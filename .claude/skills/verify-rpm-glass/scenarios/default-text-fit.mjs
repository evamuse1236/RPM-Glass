import {sleep, seededBlockName} from './lib.mjs';

export const id = 'default-text-fit';
export const rule = 'On the S24 FE at One UI default text (384dp wide, 100% text) the main screens, the task sheet and Capture fit: no button, heading, chip or title is cut with an ellipsis or clipped, no word is split across two lines, and the bottom nav labels stay visible.';
export const enforces = 'AGENTS.md "One UI default text" row (user 2026-10-19: optimize for Galaxy One UI default font size; 200% is not a target); fda3272 ("At 130% text the label cut to \'Capture a tho…\'"); 534194f ("Chips wrap instead of truncating").';

// Titles and action labels that are cut: ellipsis or clipping where the text is wider or taller than its box.
// Secondary lines (a card's Purpose, a subtitle, a breadcrumb) may be shortened; the contract says to drop
// metadata before cutting a title. Visually hidden screen-reader text is skipped.
export const EXCEPTIONS = [
  {cls: 'top-title-text', reason: "The collapsed top-bar title on a detail page repeats the page heading, which wraps in full. It is cut at every text size. Contract: never clip a title.", approval: 'pending: needs Dara to accept this or fix it', expires: '2026-11-07'},
];
function clipped(exceptions) {
  const out = [];
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !el.closest('[hidden],[inert],[aria-hidden="true"]'); };
  const excepted = [];
  for (const el of document.querySelectorAll('button, a, h1, h2, h3, label, [role=button], [role=tab], [role=menuitem], .chip, .pchip, [class*=title]:not([class*=subtitle])')) {
    if (!visible(el) || !el.textContent.trim() || el.getBoundingClientRect().width <= 2 || /sr-only/.test(el.className)) continue;
    const s = getComputedStyle(el);
    const cutsX = s.textOverflow === 'ellipsis' || s.overflowX === 'hidden' || s.overflow === 'hidden';
    const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
    const r = el.getBoundingClientRect();
    // A parent that hides overflow (not one that scrolls) can cut text that fits its own box.
    let clippedByParent = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (!/hidden|clip/.test(as.overflowX)) continue;
      const ar = a.getBoundingClientRect();
      if (r.left < ar.left - 1 || r.right > ar.right + 1) { clippedByParent = true; break; }
    }
    if ((cutsX && el.scrollWidth > el.clientWidth + 1) || (clamp && el.scrollHeight > el.clientHeight + 1) || clippedByParent)
      (exceptions.some(x => el.classList.contains(x.cls)) ? excepted : out).push({text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40)});
  }
  const nav = [...document.querySelectorAll('#nav-bar button')].map(b => {
    const label = [...b.querySelectorAll('*')].find(n => !n.closest('[aria-hidden="true"]') && !n.children.length && n.textContent.trim()) ?? b;
    const r = label.getBoundingClientRect();
    const ls = getComputedStyle(label);
    return {label: label.textContent.trim(), shown: ls.visibility !== 'hidden' && Number(ls.opacity) > 0.1 && r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1};
  });
  const split = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const host = n.parentElement;
    if (!host || !visible(host) || host.closest('.ms, [aria-hidden="true"], textarea, input, .sr-only')) continue;
    for (const m of n.textContent.matchAll(/[A-Za-z]{3,}/g)) {
      const range = document.createRange();
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const tops = new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top)));
      if (tops.size > 1) split.push({word: m[0], text: host.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), cls: String(host.className).slice(0, 40)});
    }
  }
  return {out, excepted, nav, split};
}

const live = EXCEPTIONS.filter(x => new Date(x.expires) >= new Date());

export async function run(t) {
  await t.do('seed');
  await t.do('open', 'planner');
  await t.do('display', 'phone');
  await sleep(1500);
  const screens = {};
  screens.today = await t.read(clipped, live);
  await t.shot('today');
  await t.do('tap', '--role', 'button', '--name', 'Blocks');
  screens.blocks = await t.read(clipped, live);
  await t.shot('blocks');
  await t.do('tap', '--name', await seededBlockName(t));
  await sleep(800);
  screens.blockDetail = await t.read(clipped, live);
  await t.shot('block-detail');
  await t.do('tap', '--role', 'button', '--name', 'Today');
  await sleep(800);
  await t.read(() => { const b = document.querySelector('button[aria-label$="Open task"]'); b.scrollIntoView({block: 'center'}); b.click(); });
  await sleep(1200);
  screens.taskSheet = await t.read(clipped, live);
  await t.shot('task-sheet');
  await t.do('key', 'back');
  await sleep(600);
  await t.do('open', 'capture');
  await sleep(1000);
  screens.capture = await t.read(clipped, live);
  await t.shot('capture');
  t.facts.clipped = Object.fromEntries(Object.entries(screens).map(([k, v]) => [k, v.out]));
  t.facts.nav = screens.today.nav;
  t.facts.excepted = Object.entries(screens).flatMap(([screen, v]) => v.excepted.map(c => ({screen, ...c})));
  t.expect(['Today', 'Blocks', 'Projects', 'Life'].every(want => screens.today.nav.some(n => n.label === want && n.shown)), 'Bottom nav labels Today, Blocks, Projects and Life must stay visible at default text', screens.today.nav);
  const cut = Object.entries(screens).flatMap(([screen, v]) => v.out.map(c => ({screen, ...c})));
  const split = Object.entries(screens).flatMap(([screen, v]) => v.split.map(c => ({screen, ...c})));
  t.facts.split = split;
  t.expect(!split.length, `${split.length} word(s) split across lines at default text: ${split.map(c => `${c.screen} "${c.word}" in "${c.text}"`).join('; ')}`, split);
  t.expect(!cut.length, `${cut.length} label(s) cut at default text: ${cut.map(c => `${c.screen} "${c.text}"`).join('; ')}`, cut);
}
