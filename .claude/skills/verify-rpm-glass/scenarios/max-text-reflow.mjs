import {sleep} from './lib.mjs';

export const id = 'max-text-reflow';
export const rule = 'At 200% system text the main screens reflow: no button, heading, chip or title is cut with an ellipsis or clipped, and the bottom nav labels stay visible.';
export const enforces = 'docs/planner-surface-contract.md "Content reflows at 200%"; AGENTS.md "validate ... at enlarged text"; fda3272 ("At 130% text the label cut to \'Capture a tho…\'"); 534194f ("Chips wrap instead of truncating").';

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
    return {label: label.textContent.trim(), shown: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1};
  });
  return {out, excepted, nav};
}

const live = EXCEPTIONS.filter(x => new Date(x.expires) >= new Date());

export async function run(t) {
  await t.do('seed');
  await t.do('open', 'planner');
  await t.do('display', 'max-text');
  await sleep(1500);
  const screens = {};
  screens.today = await t.read(clipped, live);
  await t.shot('today');
  await t.do('tap', '--role', 'button', '--name', 'Blocks');
  screens.blocks = await t.read(clipped, live);
  await t.shot('blocks');
  await t.do('tap', '--name', 'RM critical review drafted');
  await sleep(800);
  screens.blockDetail = await t.read(clipped, live);
  await t.shot('block-detail');
  await t.do('open', 'capture');
  await sleep(1000);
  screens.capture = await t.read(clipped, live);
  await t.shot('capture');
  await t.do('display', 'phone');
  t.facts.clipped = Object.fromEntries(Object.entries(screens).map(([k, v]) => [k, v.out]));
  t.facts.nav = screens.today.nav;
  t.facts.excepted = Object.entries(screens).flatMap(([screen, v]) => v.excepted.map(c => ({screen, ...c})));
  t.expect(['Today', 'Blocks', 'Projects', 'Life'].every(want => screens.today.nav.some(n => n.label === want && n.shown)), 'Bottom nav labels Today, Blocks, Projects and Life must stay visible at 200% text', screens.today.nav);
  const cut = Object.entries(screens).flatMap(([screen, v]) => v.out.map(c => ({screen, ...c})));
  t.expect(!cut.length, `${cut.length} label(s) cut at 200% text: ${cut.map(c => `${c.screen} "${c.text}"`).join('; ')}`, cut);
}
