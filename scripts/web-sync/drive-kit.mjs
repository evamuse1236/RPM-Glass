import {readFileSync} from 'node:fs';
import {sleep} from './cdp.mjs';

export const q = JSON.stringify;
export const BANK = 'Call the bank about the fee refund';
export const CARD = 'Buy a birthday card for Amma';
export const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const PAGE_WORDS = `(document.getElementById('notes')?.textContent ?? '')`;
const WAITING = `/waiting for your phone/i.test(${PAGE_WORDS}) || !!document.querySelector('[data-sync=waiting]')`;
const SETTLED = `!/waiting for your phone/i.test(${PAGE_WORDS}) && !document.querySelector('[data-sync]')
  && !(JSON.parse(localStorage.getItem('rpm.web.plan.v1') || '{}').records ?? []).length`;
const CONTROLS = `[...document.querySelectorAll('button,[role=button],[role=tab],[role=radio],[role=menuitem],[role=option],[role=slider],input,textarea,a[href]')]
  .filter(n => n.getClientRects().length).slice(-70)
  .map(n => (n.getAttribute('aria-label') || n.textContent || n.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 48) + ' <' + n.tagName.toLowerCase() + [...n.classList].map(c => '.' + c).join('') + '>').join(' | ')`;

export function makeKit({b, check, state, site}) {
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const readPhone = () => {
    for (let i = 0; i < 5; i++) { try { return JSON.parse(readFileSync(state, 'utf8')).data; } catch {} }
    return null;
  };
  const task = (data, title) => data?.entries.find(e => e.title === title);
  const planner = data => data?.planner ?? {};
  const changed = pick => (data, before) => q(pick(data) ?? null) !== q(pick(before) ?? null);

  const mark = async (selector, text, inner) => {
    const found = await b.js(`(() => {
      document.querySelectorAll('[data-drive]').forEach(n => n.removeAttribute('data-drive'));
      const words = n => n.textContent + ' ' + (n.getAttribute('aria-label') ?? '') + ' ' + (n.getAttribute('placeholder') ?? '');
      let node = [...document.querySelectorAll(${q(selector)})].find(n => n.getClientRects().length && words(n).includes(${q(text)}));
      if (node && ${q(inner ?? null)}) node = node.querySelector(${q(inner ?? '*')});
      if (!node) return false;
      node.setAttribute('data-drive', '');
      return true; })()`);
    if (!found) throw new Error(`nothing matches ${selector} with “${text}”${inner ? ` ${inner}` : ''}`);
  };
  const tapText = async (selector, text, inner) => { await mark(selector, text, inner); await b.tap('[data-drive]'); };
  const shown = (selector, timeout = 6000) => b.until(`[...document.querySelectorAll(${q(selector)})].some(n => n.getClientRects().length)`, timeout);
  const shownText = (selector, text, timeout = 6000) => b.until(`[...document.querySelectorAll(${q(selector)})].some(n => n.getClientRects().length
    && (n.textContent + ' ' + (n.getAttribute('aria-label') ?? '')).includes(${q(text)}))`, timeout);
  const tapShown = async selector => {
    if (!await shown(selector)) throw new Error(`${selector} did not appear`);
    await b.tap(selector);
  };
  const typeInto = async (selector, text, enter = true) => {
    await b.js(`(() => { const node = document.querySelector(${q(selector)}); node.focus();
      if (node.select) node.select(); else getSelection().selectAllChildren(node); return true; })()`);
    await b.cdp('Input.insertText', {text});
    if (enter) await b.key('Enter');
  };
  const fill = async (selector, text) => {
    await typeInto(selector, text, false);
    await b.js(`document.activeElement?.blur(); true`);
  };
  const edit = async (selector, text) => { await tapShown(selector); await typeInto(selector, text); };
  const tab = async name => { await tapText('#nav-bar .nav-item', name); await sleep(500); };
  const menu = async item => { await tapShown('.top-bar [aria-label="More options"]'); await tapText('.menu-item', item); await sleep(600); };
  const closeSheet = async () => { await b.key('Escape'); await sleep(500); };
  const closeAll = async () => { for (let i = 0; i < 3; i++) await closeSheet(); };
  const openTask = async title => {
    await tab('Today');
    const timed = `.spine-open[aria-label^=${q(title)}]`;
    if (await shown(timed, 1500)) await b.tap(timed);
    else await tapText('.spine-chip', title);
    if (!await shown('#task-tab-when')) throw new Error(`the task sheet for “${title}” did not open`);
  };
  const markedBox = async (selector, text, inner) => { await mark(selector, text, inner); return b.box('[data-drive]'); };
  const hold = async (selector, text, ms = 450) => {
    const r = await markedBox(selector, text);
    await b.drag({x: r.x + Math.min(40, r.width / 3), y: r.y + r.height / 2}, [], {hold: ms});
  };
  const swipe = async (selector, text, dx) => {
    const r = await markedBox(selector, text);
    const x = dx > 0 ? Math.max(r.x + 40, 40) : Math.min(r.x + r.width - 40, 412 - 40);
    await b.drag({x, y: r.y + r.height / 2}, [[dx / 10, 0], [dx * 9 / 10, 0]], {steps: 10});
  };

  const shots = async name => {
    await b.viewport(412, 915); await sleep(350);
    await b.capture(`${name}-412`);
    await b.viewport(1280, 800); await sleep(450);
    await b.capture(`${name}-1280`);
    await b.viewport(412, 915); await sleep(350);
  };
  const failed = async (name, error) => {
    check(false, `${name}: ${error.message}`);
    console.log(`  controls: ${await b.js(CONTROLS).catch(() => '?')}`);
    await b.capture(`${name}-failed`).catch(() => {});
    await closeAll().catch(() => {});
  };

  async function step(name, act, applied) {
    try {
      const before = readPhone();
      await act();
      const waited = await b.until(WAITING, 4000);
      if (waited) await b.capture(`${name}-waiting`);
      check(waited, `${name}: the page says it is waiting for the phone`);
      let ok = false;
      for (const end = Date.now() + 45000; !ok && Date.now() < end; await sleep(400)) {
        try { ok = !!applied(readPhone(), before); } catch {}
      }
      check(ok, `${name}: the phone saved it`);
      check(await b.until(SETTLED, 30000), `${name}: the page shows it saved, nothing left waiting`);
      await shots(name);
    } catch (error) { await failed(name, error); }
  }

  async function look(name, act, expect, label) {
    try {
      await act();
      check(await b.until(expect, 6000), `${name}: ${label}`);
      await shots(name);
    } catch (error) { await failed(name, error); }
  }

  return {b, check, site, stamp, readPhone, task, planner, changed, mark, tapText, shown, shownText, tapShown, typeInto, fill, edit, tab, menu,
    closeSheet, closeAll, openTask, markedBox, hold, swipe, shots, step, look};
}
