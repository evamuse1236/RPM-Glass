// Runs each interaction flow against a running serve.mjs and records what a critic needs to judge it as an
// interaction, not a still: the taps it took, the surfaces it passed through, a frame per step, and slowed-down
// frames of every transition (Chromium's animation clock runs at `rate`, frames come from the compositor).
// Usage: node scripts/gauntlet/flows.mjs <outDir> [port] [flow…]
// Output per flow: <outDir>/<flow>/NN-<step>.png, motion/<step>-NN.jpg, and <outDir>/<flow>.json with the metrics.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const [out = "gauntlet-flows", port = "4173", ...wanted] = process.argv.slice(2);
const base = `http://localhost:${port}`;
const RATE = Number(process.env.MOTION_RATE ?? 0.25);

// Logs every animation and transition that starts, and counts elements thrown away, so a critic can tell a
// re-render (rows rebuilt, so nothing can animate) from an in-place change.
const instrument = () => {
  const describe = n => n && n.nodeType === 1 ? (n.id ? '#' + n.id : n.tagName.toLowerCase())
    + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : String(n);
  window.__motion = []; window.__removed = 0;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const o = typeof options === 'number' ? {duration: options} : options ?? {};
    window.__motion.push({kind: 'animate', target: describe(this), duration: o.duration, easing: o.easing ?? 'linear',
      props: [...new Set((Array.isArray(frames) ? frames : [frames]).flatMap(f => Object.keys(f ?? {})).filter(k => k !== 'offset'))].join(',')});
    return animate.call(this, frames, options);
  };
  addEventListener('animationstart', e => window.__motion.push({kind: 'keyframes', target: describe(e.target), name: e.animationName,
    duration: getComputedStyle(e.target).animationDuration, easing: getComputedStyle(e.target).animationTimingFunction}), true);
  addEventListener('transitionrun', e => {
    const s = getComputedStyle(e.target);
    window.__motion.push({kind: 'transition', target: describe(e.target), props: e.propertyName, duration: s.transitionDuration, easing: s.transitionTimingFunction});
  }, true);
  new MutationObserver(list => { for (const m of list) for (const n of m.removedNodes) if (n.nodeType === 1) window.__removed += 1 + n.querySelectorAll('*').length; })
    .observe(document, {childList: true, subtree: true});
};

const surface = page => page.evaluate(() => {
  const sheet = document.getElementById('sheet');
  const open = sheet && !sheet.hidden && !sheet.inert;
  const view = document.getElementById('planner')?.dataset.view ?? (document.querySelector('.panel') ? 'capture' : '?');
  const wr = document.querySelector('.wr-step-title, .wr-title, h1')?.textContent?.trim().slice(0, 40);
  return [view, view === 'review' ? wr : '', open ? 'sheet:' + sheet.getAttribute('aria-label') : ''].filter(Boolean).join(' / ');
});

async function runFlow(browser, name, flow) {
  const dir = `${out}/${name}`;
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(`${dir}/motion`, {recursive: true});
  await fetch(base + '/__reset', {method: 'POST', body: JSON.stringify(flow.reset ?? {})});
  const context = await browser.newContext({viewport: {width: 412, height: 915}, deviceScaleFactor: 1, hasTouch: false,
    colorScheme: flow.dark ? 'dark' : 'light'});
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  await page.addInitScript(instrument);
  // Today's lead card depends on the clock, so every run sees the same morning (timers and animations still run).
  const morning = new Date(); morning.setHours(8, 5, 0, 0);
  await page.clock.setFixedTime(flow.now ?? morning);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Animation.enable');
  await page.goto(base + (flow.path ?? '/planner.html'));
  await page.waitForTimeout(1000);

  const record = {flow: name, job: flow.job, taps: 0, typed: [], keys: 0, steps: [], surfaces: [], problems};
  let n = 0;
  const settle = async () => { await page.mouse.move(-10, -10); await page.waitForTimeout(flow.settle ?? 700); };
  const snapshot = async label => {
    await settle();
    const file = `${String(++n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    await page.screenshot({path: `${dir}/${file}`});
    const where = await surface(page);
    if (record.surfaces.at(-1) !== where) record.surfaces.push(where);
    return {file, where};
  };
  // Every step: run the action with the animation clock slowed, keep the compositor's frames, log motion.
  const step = async (label, kind, action) => {
    await page.evaluate(() => { window.__motion = []; window.__removed = 0; });
    await cdp.send('Animation.setPlaybackRate', {playbackRate: RATE});
    const frames = [];
    const onFrame = async ({data, metadata, sessionId}) => {
      frames.push({t: metadata.timestamp, data});
      cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
    };
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 70, maxWidth: 412, maxHeight: 915, everyNthFrame: 1});
    await page.waitForTimeout(120);
    const started = Date.now() / 1000;
    await action();
    await page.waitForTimeout(Math.round((flow.motionMs ?? 700) / RATE));
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);
    await cdp.send('Animation.setPlaybackRate', {playbackRate: 1});
    const motion = await page.evaluate(() => ({log: window.__motion, removed: window.__removed}));
    // Keep up to 10 distinct frames after the input, labelled with real animation time.
    const after = frames.filter(f => f.t >= started - 0.05);
    const distinct = after.filter((f, i) => i === 0 || f.data.length !== after[i - 1].data.length);
    const pick = distinct.length <= 10 ? distinct : Array.from({length: 10}, (_, i) => distinct[Math.round(i * (distinct.length - 1) / 9)]);
    const motionFiles = pick.map((f, i) => {
      const ms = Math.max(0, Math.round((f.t - started) * 1000 * RATE));
      const file = `motion/${String(n + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}-${ms}ms.jpg`;
      fs.writeFileSync(`${dir}/${file}`, Buffer.from(f.data, 'base64'));
      return file;
    });
    const shot = await snapshot(label);
    record.steps.push({label, kind, ...shot, motionFrames: motionFiles, elementsRemoved: motion.removed,
      motion: motion.log.slice(0, 40)});
  };
  const h = {
    page,
    tap: (label, locator) => { record.taps++; return step(label, 'tap', () => locator.first().click()); },
    type: (label, locator, text) => { record.typed.push(text); return step(label, 'type', () => locator.first().fill(text)); },
    // The keyboard's Enter and Android Back (Escape) are taps too.
    key: (label, key) => { record.keys++; if (key === 'Enter' || key === 'Escape') record.taps++; return step(label, 'key', () => page.keyboard.press(key)); },
    swipe: (label, locator, dx) => { record.taps++; return step(label, 'swipe', async () => {
      const box = await locator.first().boundingBox();
      const y = box.y + box.height / 2, x = box.x + box.width / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y);
      await page.mouse.up();
    }); },
    // Long-press (held still for `hold` ms) then a vertical drag by dy px, as a finger reorders a list: 1 interaction.
    drag: (label, locator, dy, hold = 450) => { record.taps++; return step(label, 'drag', async () => {
      const box = await locator.first().boundingBox();
      const y = box.y + box.height / 2, x = box.x + box.width / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.waitForTimeout(hold);
      for (let i = 1; i <= 16; i++) { await page.mouse.move(x, y + dy * i / 16); await page.waitForTimeout(30); }
      await page.waitForTimeout(120);
      await page.mouse.up();
    }); },
    look: label => snapshot(label).then(shot => record.steps.push({label, kind: 'look', ...shot})),
    wait: ms => page.waitForTimeout(ms),
  };
  try {
    await h.look('start');
    await flow.run(h);
  } catch (error) {
    problems.push('flow failed: ' + error.message.split('\n')[0]);
    await page.screenshot({path: `${dir}/zz-failed.png`});
  }
  // The flow's own check of the saved store: did the job actually get done?
  if (flow.check) {
    try { record.result = flow.check(await (await fetch(base + '/__store')).json()); }
    catch (error) { record.result = 'check failed: ' + error.message; }
  }
  await context.close();
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(record, null, 1));
  return record;
}

export async function runFlows(flows) {
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch();
  const summary = [];
  for (const [name, flow] of Object.entries(flows)) {
    if (wanted.length && !wanted.includes(name)) continue;
    const r = await runFlow(browser, name, flow);
    summary.push(`${name}: ${r.taps} taps${r.typed.length ? ` + typing ${r.typed.length}` : ''}, ${r.surfaces.length} surfaces`
      + ` (${r.surfaces.join(' → ')})${r.result ? ' · check: ' + r.result : ''}${r.problems.length ? ' · PROBLEMS: ' + r.problems.join(' | ') : ''}`);
  }
  await browser.close();
  fs.writeFileSync(`${out}/summary.txt`, summary.join('\n') + '\n');
  console.log(summary.join('\n'));
}
