import fs from 'node:fs';
import path from 'node:path';
import {PACKAGE, UserError, adb, shell, sleep, waitFor, foregroundActivity, displayInfo, nativeNodes, dismissAnr} from './device.mjs';
import {inPage, toDevice, pageTargets} from './page.mjs';
import {DISPLAYS, evidenceDir, journal, target, openLauncher} from './runtime.mjs';
import {wipeAppDataKeepingSync} from './sync.mjs';

// The software-rendered emulator can raise "System UI isn't responding" at any time; it sits on top of the app and eats
// every tap. Answer Wait and try once more before reporting the element as missing.
// Opens Capture's More menu and waits for the item, since the menu animates in and a slow emulator takes a while.
async function openMenuItem(serial, cdpPort, item) {
  const menuOpen = async () => {
    const page = await inPage(serial, cdpPort);
    try { return await page.evaluate(`document.querySelector('[aria-label="More: planner, history, settings"]')?.getAttribute('aria-expanded') === 'true'`); } finally { page.close(); }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await menuOpen())) touch(serial, (await tapElement(serial, cdpPort, {name: 'More: planner, history, settings', role: 'button'})).at);
    await sleep(400);
    for (const until = Date.now() + 6000; Date.now() < until; await sleep(300)) {
      try { return await tapElement(serial, cdpPort, {name: item, role: 'button'}, true); } catch (e) { if (!(e instanceof UserError)) throw e; }
    }
  }
  throw new UserError(`Capture's More menu did not show "${item}".`, 'Run `rpmctl shot menu` and `rpmctl ui` to see the screen.');
}

async function tapElement(serial, cdpPort, query, retried = false) {
  try { return await locateForTap(serial, cdpPort, query); }
  catch (e) { if (!retried && e instanceof UserError && dismissAnr(serial)) { await sleep(1500); return tapElement(serial, cdpPort, query, true); } throw e; }
}

async function locateForTap(serial, cdpPort, query) {
  const page = await inPage(serial, cdpPort);
  try {
    const found = await page.evaluate(`(q) => window.__rpmLocate(q)`, {...query, scroll: true});
    if (found.error) throw new UserError(found.error + (found.candidates ? `. On screen: ${found.candidates.join(', ')}` : ''), 'Run `rpmctl ui` to see names, then retry with --role/--nth or --css.');
    if (found.match.coveredBy) throw new UserError(`"${found.match.name}" is covered by ${found.match.coveredBy}, so a tap there lands on that instead`, 'Fix the layout so nothing sits on top of the control, or close what covers it first.');
    const dpr = await page.evaluate('devicePixelRatio');
    const [x, y, w, h] = found.match.rect;
    const at = toDevice(page, dpr, [x + w / 2, y + h / 2]);
    return {at, match: found.match};
  } finally { page.close(); }
}

const touch = (serial, [x, y], long) => shell(serial, long ? `input swipe ${x} ${y} ${x} ${y} 800` : `input tap ${x} ${y}`);

export const driveCommands = {
  async open(args) {
    const {serial, state} = target(args, {mutates: true});
    const surface = args._[0];
    const {cdpPort} = target(args, {mutates: false});
    const rendered = async selector => waitFor(async () => {
      try { const page = await inPage(serial, cdpPort); try { return await page.evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`); } finally { page.close(); } }
      catch (e) { if (e instanceof UserError) return false; throw e; }
    }, {timeout: 45000, every: 400, what: `the ${surface} screen to render`});
    dismissAnr(serial);
    const plannerInFront = () => /PlannerActivity/.test(foregroundActivity(serial) ?? '');
    let backs = 0;
    if (['capture', 'widget-capture', 'widget-voice', 'history'].includes(surface)) {
      await openLauncher(serial, surface.startsWith('widget-') ? `com.rpm.widget.${surface.slice(7)}` : undefined);
      // The launcher (and am start) resume the task as it was; the real widget clears it. Back out of the planner like a user.
      while (plannerInFront() && backs < 6) { shell(serial, 'input keyevent 4'); backs++; await sleep(700); }
      await rendered('#message');
      if (surface === 'history') {
        touch(serial, (await openMenuItem(serial, cdpPort, 'History')).at);
      }
    } else if (surface === 'planner') {
      await openLauncher(serial);
      if (!plannerInFront()) {
        await rendered('#message');
        touch(serial, (await openMenuItem(serial, cdpPort, 'Planner')).at);
      }
      await rendered('#nav-bar button');
    } else throw new UserError(`Unknown surface "${surface ?? ''}".`, 'One of: capture, planner, history, widget-capture, widget-voice. See `rpmctl open --help`.');
    await sleep(600);
    const out = {ok: true, surface, activity: foregroundActivity(serial), ...(backs ? {pressedBackFromPlanner: backs} : {})};
    journal(state, {command: 'open', args: args._, result: out});
    return out;
  },

  async seed(args) {
    const {serial, state} = target(args, {mutates: true});
    let data;
    if (args.empty) data = null;
    else if (args.file) { data = JSON.parse(fs.readFileSync(path.resolve(String(args.file)), 'utf8')); if (data.ok && data.json) data = data.json; }
    else data = (await import(new URL('../../../../scripts/gauntlet/seed.mjs', import.meta.url))).seedStore(new Date()).data;
    shell(serial, `am force-stop ${PACKAGE}`);
    if (data) {
      const local = path.join(evidenceDir(state), 'seed-companion.json');
      fs.writeFileSync(local, JSON.stringify(data));
      adb(serial, ['push', local, '/data/local/tmp/rpm-seed.json']);
      adb(serial, ['shell', 'run-as', PACKAGE, 'sh', '-c', `'${wipeAppDataKeepingSync()} && cp /data/local/tmp/rpm-seed.json files/companion.json'`]);
      adb(serial, ['shell', 'rm', '-f', '/data/local/tmp/rpm-seed.json']);
    } else adb(serial, ['shell', 'run-as', PACKAGE, 'sh', '-c', `'${wipeAppDataKeepingSync()}'`]);
    await openLauncher(serial);
    await sleep(2000);
    const stored = adb(serial, ['exec-out', 'run-as', PACKAGE, 'cat', 'files/companion.json'], {allowFail: true});
    let summary = null;
    try { const d = JSON.parse(stored); summary = {version: d.version, tasks: d.entries?.length, blocks: d.planner?.blocks?.length, projects: d.planner?.projects?.length}; } catch {}
    const out = {ok: true, seeded: args.empty ? 'empty' : args.file ? String(args.file) : 'scripts/gauntlet/seed.mjs (dates relative to now)', stored: summary};
    journal(state, {command: 'seed', result: out});
    return out;
  },

  async ui(args) {
    const {serial, cdpPort} = target(args, {mutates: false});
    if (args.native) return {ok: true, activity: foregroundActivity(serial), nodes: nativeNodes(serial)};
    const page = await inPage(serial, cdpPort);
    try { return {ok: true, activity: foregroundActivity(serial), ...(await page.evaluate(`(all) => window.__rpmSnapshot(all)`, !!args.all))}; }
    finally { page.close(); }
  },

  async tap(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    let at, match;
    if (args.xy) at = String(args.xy).split(',').map(Number);
    else if (args.native) {
      const want = String(args.native).toLowerCase();
      const nodes = nativeNodes(serial);
      const hits = nodes.filter(n => [n.text, n.desc].some(v => v?.toLowerCase() === want));
      const hit = (hits.length ? hits : nodes.filter(n => [n.text, n.desc].some(v => v?.toLowerCase().includes(want))))[Number(args.nth ?? 0)];
      if (!hit) throw new UserError(`No native view with text/description "${args.native}".`, 'Run `rpmctl ui --native` to see what is on screen.');
      at = hit.center; match = hit;
    } else if (args.name || args.css) ({at, match} = await tapElement(serial, cdpPort, {name: args.name, role: args.role, css: args.css, nth: args.nth === undefined ? undefined : Number(args.nth)}));
    else throw new UserError('Nothing to tap.', 'Pass --name TEXT [--role ROLE], --css SELECTOR, --native TEXT or --xy X,Y.');
    touch(serial, at, args.long);
    await sleep(Number(args.settle ?? 600));
    const out = {ok: true, tapped: match ? {role: match.role ?? match.cls, name: match.name ?? match.text ?? match.desc} : null, at, long: !!args.long};
    journal(state, {command: 'tap', args, result: out});
    return out;
  },

  async type(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    const text = args._.join(' ');
    if (!text) throw new UserError('Nothing to type.', 'rpmctl type "Buy milk tomorrow at 9"');
    if (args.adb) {
      if (/[^\x20-\x7e]/.test(text)) throw new UserError('--adb types ASCII only.', 'Drop --adb to type unicode through DevTools.');
      adb(serial, ['shell', 'input', 'text', text.replace(/ /g, '%s').replace(/([\\'"`$&|;<>()*?!#~])/g, '\\$1')]);
    } else {
      const page = await inPage(serial, cdpPort);
      try {
        const focused = await page.evaluate(`(() => { const a = document.activeElement; return a && a !== document.body ? (a.id || a.tagName) : null; })()`);
        if (!focused) throw new UserError('No field has focus in the page.', 'Tap the field first, e.g. `rpmctl tap --role textbox --name "Capture a thought"`.');
        await page.send('Input.insertText', {text});
      } finally { page.close(); }
    }
    await sleep(400);
    const out = {ok: true, typed: text};
    journal(state, {command: 'type', result: out});
    return out;
  },

  async key(args) {
    const {serial, state} = target(args, {mutates: true});
    const names = {back: 4, enter: 66, home: 3, tab: 61, del: 67, escape: 111, recents: 187, menu: 82};
    const k = args._[0];
    const code = names[k?.toLowerCase()] ?? (/^KEYCODE_\w+$/.test(k ?? '') ? k : null);
    if (!code) throw new UserError(`Unknown key "${k ?? ''}".`, `One of ${Object.keys(names).join(', ')} or a KEYCODE_* name.`);
    shell(serial, `input keyevent ${code}`);
    await sleep(Number(args.settle ?? 600));
    journal(state, {command: 'key', key: k});
    return {ok: true, key: k};
  },

  async scroll(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    const dir = args._[0];
    if (!['up', 'down', 'left', 'right'].includes(dir)) throw new UserError('Scroll needs a direction.', 'rpmctl scroll down [--amount 900] | rpmctl scroll right --name "Buy a new notebook"');
    const [w, h] = (displayInfo(serial).size ?? '1080x2340').split('x').map(Number);
    let [x, y] = [Math.round(w / 2), Math.round(h / 2)];
    if (args.name || args.css) [x, y] = (await tapElement(serial, cdpPort, {name: args.name, role: args.role, css: args.css, nth: args.nth === undefined ? undefined : Number(args.nth)})).at;
    const vertical = dir === 'up' || dir === 'down';
    const amount = Number(args.amount ?? (vertical ? 900 : 500)), sign = dir === 'down' || dir === 'left' ? -1 : 1;
    const [x1, y1, x2, y2] = vertical ? [x, y - sign * amount / 2, x, y + sign * amount / 2] : [x - sign * amount / 2, y, x + sign * amount / 2, y];
    const clamp = (v, max) => Math.max(5, Math.min(max - 5, Math.round(v)));
    shell(serial, `input swipe ${clamp(x1, w)} ${clamp(y1, h)} ${clamp(x2, w)} ${clamp(y2, h)} ${Number(args.ms ?? 350)}`);
    await sleep(700);
    journal(state, {command: 'scroll', dir, amount, at: [x, y]});
    return {ok: true, scrolled: dir, amount, at: [x, y]};
  },

  async wait(args) {
    const {serial, cdpPort} = target(args, {mutates: false});
    const timeout = Number(args.timeout ?? 10000), until = Date.now() + timeout;
    for (;;) {
      let found = false;
      try {
        const page = await inPage(serial, cdpPort);
        try { found = !(await page.evaluate(`(q) => window.__rpmLocate(q)`, {name: args.name, role: args.role, css: args.css})).error; }
        finally { page.close(); }
      } catch (e) { if (!(e instanceof UserError)) throw e; }
      if (found !== !!args.gone) return {ok: true, [args.gone ? 'gone' : 'found']: args.name ?? args.css, ms: timeout - (until - Date.now())};
      if (Date.now() > until) {
        const pages = (await pageTargets(serial, cdpPort).catch(() => [])).map(p => ({url: p.url, visible: p.view?.visible, attached: p.view?.attached}));
        throw new UserError(`"${args.name ?? args.css}" ${args.gone ? 'still on screen' : 'did not appear'} after ${timeout}ms. Pages: ${JSON.stringify(pages)}`, 'Run `rpmctl ui` and `rpmctl shot` to see the current screen.');
      }
      await sleep(300);
    }
  },

  async display(args) {
    const {serial, state} = target(args, {mutates: true});
    const name = args._[0] === 'reset' ? 'phone' : args._[0];
    const d = DISPLAYS[name];
    if (!d) throw new UserError(`Unknown display "${args._[0] ?? ''}".`, `One of ${Object.keys(DISPLAYS).join(', ')}, reset.`);
    const before = displayInfo(serial);
    shell(serial, `settings put system font_scale ${d.fontScale}`);
    shell(serial, `settings put system user_rotation ${d.rotation}`);
    shell(serial, d.size ? `wm size ${d.size}` : 'wm size reset');
    shell(serial, d.density ? `wm density ${d.density}` : 'wm density reset');
    await sleep(2000);
    const out = {ok: true, display: name, note: d.note, before, after: displayInfo(serial)};
    journal(state, {command: 'display', result: out});
    return out;
  },

};
