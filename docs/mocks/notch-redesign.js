const G = {
  task: '<path d="M4 6h12M4 11h12M4 16h6M14.5 19.5l5-5 2 2-5 5h-2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  drop: '<path d="M12 3.5c3.5 4.2 6 7.6 6 10.5a6 6 0 0 1-12 0c0-2.9 2.5-6.3 6-10.5z"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  meal: '<path d="M7 3v18M5 3v5a2 2 0 0 0 4 0V3M17 21V3c-2.2 1.5-3 4.5-3 8h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[k]}</svg>`;
document.querySelectorAll('[data-g]').forEach(e => e.innerHTML = svg(e.dataset.g));

const $ = id => document.getElementById(id);
const phone = $('phone'), island = $('island'), ring = $('ring'), value = $('value'), split = $('split');
const W = 412, H = 860, PH = 36, TOP = 4, CX = 206, KEEP = 34, C = 103.67;
const S = { mode: 'pill', split: false, ts: 1, rm: matchMedia('(prefers-reduced-motion: reduce)').matches,
  water: 3, goal: 8, mins: 45, dur: 60, heroDone: false, mealLogged: false };
let receiptTimer = 0, undoFn = null, prevMode = 'pill';

function setValue(text) {
  const old = value.dataset.v ?? '';
  if (old === text) return;
  value.dataset.v = text;
  if (!old || S.rm) { value.innerHTML = [...text].map(c => `<span class="c">${c}</span>`).join(''); return; }
  const n = Math.max(old.length, text.length), out = [];
  for (let i = 0; i < n; i++) {
    const o = old[old.length - n + i] ?? '', c = text[text.length - n + i] ?? '';
    if (!c) continue;
    out.push(o === c ? `<span class="c">${c}</span>` : `<span class="c"><span class="o">${o}</span><span class="n">${c}</span></span>`);
  }
  value.innerHTML = out.join('');
}
function setRing({ kind, p, glyph, disc, gc }) {
  ring.style.setProperty('--kc', `var(--${kind})`);
  ring.style.setProperty('--disc', disc ?? 'transparent');
  ring.style.setProperty('--gc', gc ?? (kind === 'task' ? 'var(--t87)' : `var(--${kind})`));
  $('track').style.display = disc ? 'none' : '';
  $('arc').style.display = disc ? 'none' : '';
  $('arc').style.strokeDashoffset = C * (1 - Math.max(0, Math.min(1, p)));
  if ($('glyph').dataset.k !== glyph) { $('glyph').dataset.k = glyph; $('glyph').innerHTML = svg(glyph); }
}
const pillText = () => S.heroDone ? '5:30' : `${S.mins}m`;
const heroP = () => S.heroDone ? 0 : (S.dur - S.mins) / S.dur;
function place(el, x, y, size) {
  el.style.translate = `${x}px ${y}px`;
  if (size) { el.style.inlineSize = size + 'px'; el.style.blockSize = size + 'px'; }
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}

function render(dur) {
  const m = S.mode;
  phone.dataset.mode = m; phone.dataset.ts = S.ts;
  phone.classList.toggle('rm', S.rm);
  phone.style.setProperty('--ts', S.ts);
  phone.style.setProperty('--dur', (dur ?? 350) + 'ms');
  document.querySelectorAll('.face').forEach(f => f.classList.toggle('on', f.dataset.face === m));
  $('undoBox').classList.toggle('on', m === 'receipt');
  $('stopBox').classList.toggle('on', m === 'alarm');
  document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));

  $('heroTitle').textContent = S.heroDone ? 'Past paper 2019, section B' : 'Group call: merge sections';
  $('heroLine').textContent = S.heroDone ? 'Next · 5:30 PM' : `Block · ${S.mins} min left`;
  $('dots').innerHTML = Array.from({ length: S.goal }, (_, i) => `<i class="${i < S.water ? 'f' : ''}"></i>`).join('');
  $('waterV').textContent = `${S.water}/${S.goal}`;
  document.querySelector('[data-row="water"]').hidden = false;
  document.querySelector('[data-row="next"]').hidden = S.heroDone;
  document.querySelector('[data-row="meal"]').hidden = S.mealLogged;
  $('splitArc').style.strokeDashoffset = C * (1 - S.water / S.goal);

  if (m === 'reminder') setRing({ kind: 'task', p: 0, glyph: 'bell', disc: 'oklch(1 0 none / 0.12)', gc: 'var(--t87)' });
  else if (m === 'alarm') setRing({ kind: 'alarm', p: 0, glyph: 'clock', disc: 'color-mix(in oklch, var(--alarm) 24%, black)' });
  else if (m !== 'receipt') setRing({ kind: 'task', p: heroP(), glyph: 'task' });

  value.style.opacity = (m === 'alarm' || m === 'receipt') ? 0 : 1;
  setValue(m === 'reminder' ? '5:30' : pillText());
  value.style.setProperty('--vc', m === 'pill' || m === 'reminder' ? 'var(--t1)' : 'var(--task)');

  let g;
  if (m === 'pill') {
    const ps = Math.min(15 * S.ts, PH - 12) / 22;
    const vw = value.offsetWidth * ps;
    const side = Math.max(4 + 28 + 8, 8 + vw + 14);
    const w = Math.max(112, 2 * side + KEEP);
    g = { x: CX - w / 2, w, h: PH, r: PH / 2 };
    place(ring, g.x + 4, TOP + 4, 28);
    place(value, g.x + w - 14 - value.offsetWidth, TOP + PH / 2 - value.offsetHeight / 2);
    value.style.scale = ps;
  } else {
    const face = document.querySelector(`.face[data-face="${m}"]`);
    const rows = [...face.querySelectorAll('.row')].filter(r => !r.hidden);
    let h = 68 + face.offsetHeight + 16;
    while (h > H * 0.6 && rows.length > 1) { rows.pop().hidden = true; h = 68 + face.offsetHeight + 16; }
    g = { x: 12, w: W - 24, h, r: 36 };
    place(ring, 28, TOP + 16, 40);
    const vs = m === 'reminder' ? 17 / 22 : 1;
    place(value, W - 12 - 16 - value.offsetWidth, TOP + 16 + 20 - value.offsetHeight / 2);
    value.style.scale = vs;
  }
  island.style.insetInlineStart = g.x + 'px';
  island.style.inlineSize = g.w + 'px';
  island.style.blockSize = g.h + 'px';
  island.style.borderRadius = g.r + 'px';
  island.setAttribute('aria-label', m === 'pill' ? `Notch: ${$('heroTitle').textContent}, ${pillText()}. Tap to open.` : 'Notch, open');

  split.style.opacity = S.split && m === 'pill' ? 1 : 0;
  if (m === 'pill') place(split, g.x - 8 - 36, TOP); else place(split, 28, TOP + 16);
}

function go(mode, dur) {
  clearTimeout(receiptTimer);
  prevMode = S.mode === 'receipt' ? prevMode : S.mode;
  S.mode = mode;
  render(dur ?? (mode === 'pill' ? 300 : 350));
}
function receipt(big, small, ringSpec, undo) {
  undoFn = undo;
  $('rBig').textContent = big; $('rSmall').textContent = small;
  setRing({ ...ringSpec, p: ringSpec.from });
  go('receipt');
  requestAnimationFrame(() => requestAnimationFrame(() => setRing({ ...ringSpec, p: ringSpec.to })));
  receiptTimer = setTimeout(() => go('pill'), 4000);
}
const logGlass = () => {
  const from = S.water / S.goal; S.water = Math.min(S.goal, S.water + 1);
  receipt('Glass logged', `${S.water} of ${S.goal} today`, { kind: 'water', glyph: 'drop', from, to: S.water / S.goal }, () => { S.water--; });
};

let pressT = 0, held = false;
island.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  held = false;
  pressT = setTimeout(() => { held = true; toast(`Opens "${$('heroTitle').textContent}" in the planner`); }, 500);
});
island.addEventListener('pointerup', e => {
  clearTimeout(pressT);
  if (e.target.closest('button') || held) return;
  if (S.mode === 'pill') go('open');
});
island.addEventListener('pointerleave', () => clearTimeout(pressT));
island.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && S.mode === 'pill') { e.preventDefault(); go('open'); } });
phone.addEventListener('pointerup', e => { if (!island.contains(e.target) && !e.target.closest('button') && S.mode !== 'pill') go('pill'); });

$('heroDone').onclick = () => {
  if (S.heroDone) { toast('Nothing else timed today'); return; }
  const p = heroP(); S.heroDone = true;
  receipt('Done', 'Group call: merge sections', { kind: 'task', glyph: 'check', from: p, to: 1 }, () => { S.heroDone = false; });
};
document.querySelector('[data-row="water"]').onclick = logGlass;
document.querySelector('[data-row="next"]').onclick = () => toast('Opens "Past paper 2019, section B" in the planner');
document.querySelector('[data-row="meal"]').onclick = () => {
  S.mealLogged = true;
  receipt('Lunch logged', 'Dal, rice and salad, as usual', { kind: 'meal', glyph: 'meal', from: 0, to: 1 }, () => { S.mealLogged = false; });
};
document.querySelectorAll('[data-act="alertDone"]').forEach(b => b.onclick = () => {
  const alarm = S.mode === 'alarm';
  receipt('Done', alarm ? 'Leave for the airport' : 'Call the bank about the fee', { kind: 'task', glyph: 'check', from: 0, to: 1 }, () => {});
});
document.querySelectorAll('[data-act="snooze"]').forEach(b => b.onclick = () => { go('pill'); toast('Snoozed. It comes back at 5:40'); });
$('stop').onclick = () => { go('pill'); toast('Alarm stopped'); };
$('undo').onclick = () => { if (undoFn) undoFn(); undoFn = null; go('pill'); toast('Undone'); };

document.querySelectorAll('#modes button').forEach(b => b.onclick = () => go(b.dataset.mode));
$('tick').onclick = () => { if (!S.heroDone && S.mins > 1) S.mins--; render(); };
$('splitT').onclick = e => { S.split = !S.split; e.currentTarget.setAttribute('aria-pressed', S.split); render(); };
$('tsT').onclick = e => { S.ts = S.ts === 1 ? 2 : 1; e.currentTarget.setAttribute('aria-pressed', S.ts === 2); document.querySelectorAll('.row').forEach(r => r.hidden = false); render(); };
$('rmT').onclick = e => { S.rm = !S.rm; e.currentTarget.setAttribute('aria-pressed', S.rm); render(); };
$('rmT').setAttribute('aria-pressed', S.rm);

render(0);
