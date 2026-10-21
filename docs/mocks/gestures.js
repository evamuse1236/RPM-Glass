const $ = s => document.querySelector(s);
const phone = $('#phone'), day = $('#day'), scroll = $('#scroll'), ghost = $('#ghost'), dragpill = $('#dragpill'), railhi = $('#railhi');
const START_H = 8, NOW = 16 * 60 + 26;
let hourPx = 64, dblTap = true;
const tasks = [
  {id: 'a', t: 'Morning run', start: 8 * 60, len: 30, done: true},
  {id: 'b', t: 'Read RM paper 3', start: 10 * 60, len: 45},
  {id: 'c', t: 'Draft my section of the review', start: 16 * 60, len: 60, must: true},
  {id: 'e', t: 'Past paper 2019, section B', start: 18 * 60, len: 60, event: true},
  {id: 'd', t: 'Run the plagiarism report', start: 19 * 60 + 30, len: 20},
  {id: 'f', t: 'Call Amma', start: 20 * 60 + 30, len: 30},
];
const fmt = m => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12; return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtLen = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
const y = m => (m - START_H * 60) / 60 * hourPx;
const h = len => Math.max(56, len / 60 * hourPx);
const capture = (el, id) => { try { el.setPointerCapture(id); } catch {} };
const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };
const logLines = [];
function log(s) { logLines.unshift(s); $('#log').textContent = logLines.slice(0, 6).join('\n'); }
let undoFn = null;
function toast(msg, undo) {
  $('#tmsg').textContent = msg; undoFn = undo; $('#tundo').hidden = !undo;
  $('#toast').classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => $('#toast').classList.remove('on'), 4000);
}
$('#tundo').onclick = () => { undoFn?.(); undoFn = null; $('#toast').classList.remove('on'); log('Undo'); };

function render() {
  phone.style.setProperty('--hour', hourPx + 'px');
  day.querySelectorAll('.hr, .card').forEach(n => n.remove());
  for (let i = 0; i < 15; i++) { const r = document.createElement('div'); r.className = 'hr'; r.style.insetBlockStart = (i * hourPx) + 'px'; r.innerHTML = `<span>${fmt((START_H + i) * 60)}</span>`; day.prepend(r); }
  $('#now').style.insetBlockStart = y(NOW) + 'px';
  for (const k of tasks) {
    const c = document.createElement('div');
    c.className = 'card' + (k.event ? ' event' : '') + (k.done ? ' done' : '');
    c.dataset.id = k.id; c.tabIndex = 0;
    c.style.insetBlockStart = y(k.start) + 'px'; c.style.blockSize = h(k.len) + 'px';
    c.innerHTML = `<span class="ring"></span><span class="t">${k.must ? '★ ' : ''}${k.t}</span><span class="s">${fmt(k.start)} · ${fmtLen(k.len)}${k.event ? ' · Calendar' : ''}</span>${k.event ? '' : '<span class="knurl" aria-hidden="true"></span>'}`;
    day.append(c);
  }
}
const find = id => tasks.find(k => k.id === id);
const cardEl = id => day.querySelector(`.card[data-id="${id}"]`);
function showPill(x, yy, text, fine) { dragpill.textContent = text; dragpill.classList.toggle('fine', !!fine); const pr = phone.getBoundingClientRect(); dragpill.style.insetInlineStart = Math.min(pr.width - 70, Math.max(70, x - pr.left)) + 'px'; dragpill.style.insetBlockStart = (yy - pr.top - 64) + 'px'; dragpill.classList.add('on'); }
const hidePill = () => dragpill.classList.remove('on');

let g = null, lastTap = {id: null, t: 0}, tapTimer = null;
day.addEventListener('pointerdown', e => {
  const c = e.target.closest('.card'); if (!c || c.classList.contains('event') || e.button > 0) return;
  const k = find(c.dataset.id);
  if (e.target.closest('.knurl')) {
    e.preventDefault(); capture(c, e.pointerId);
    g = {mode: 'len', k, c, y0: e.clientY, len0: k.len, last: k.len, id: e.pointerId}; buzz(10); return;
  }
  g = {mode: 'wait', k, c, x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false};
  g.timer = setTimeout(() => {
    if (!g || g.mode !== 'wait') return;
    g.mode = 'move'; g.start0 = k.start; g.last = k.start; g.scroll0 = scroll.scrollTop;
    try { c.setPointerCapture(g.id); } catch {}
    c.classList.add('lifted'); buzz(20); log(`Lifted "${k.t}"`);
    ghost.style.insetBlockStart = y(k.start) + 'px'; ghost.style.blockSize = h(k.len) + 'px'; ghost.classList.add('on');
    showPill(e.clientX, e.clientY, fmt(k.start));
  }, 250);
});
day.addEventListener('touchmove', e => { if (g && g.mode !== 'wait') e.preventDefault(); }, {passive: false});
window.addEventListener('pointermove', e => {
  if (!g || e.pointerId !== g.id) return;
  if (g.mode === 'wait') { if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 8) { clearTimeout(g.timer); g.moved = true; g = null; } return; }
  const snapPx = hourPx / 4;
  if (g.mode === 'move') {
    const dy = e.clientY - g.y0 + (scroll.scrollTop - g.scroll0);
    g.c.style.translate = `0 ${dy}px`;
    let next = g.start0 + Math.round(dy / snapPx) * 15;
    next = Math.max(START_H * 60, Math.min(22 * 60 + 45 - g.k.len, next));
    if (next !== g.last) { g.last = next; buzz(6); ghost.style.insetBlockStart = y(next) + 'px'; }
    const lo = Math.min(y(g.start0), y(next)), hi = Math.max(y(g.start0), y(next));
    railhi.style.insetBlockStart = lo + 'px'; railhi.style.blockSize = (hi - lo) + 'px'; railhi.style.opacity = next === g.start0 ? 0 : 1;
    showPill(e.clientX, e.clientY, fmt(next));
    const r = scroll.getBoundingClientRect();
    if (e.clientY < r.top + 40) scroll.scrollTop -= 6; else if (e.clientY > r.bottom - 40) scroll.scrollTop += 6;
  } else if (g.mode === 'len') {
    const dy = e.clientY - g.y0;
    const raw = g.len0 + dy / hourPx * 60;
    let next = raw < 30 ? Math.round(raw / 5) * 5 : Math.round(raw / 15) * 15;
    next = Math.max(5, Math.min(240, next));
    if (next !== g.last) { g.last = next; buzz(6); g.c.style.blockSize = h(next) + 'px'; g.c.querySelector('.s').textContent = `${fmt(g.k.start)} · ${fmtLen(next)}`; }
    showPill(e.clientX, e.clientY, fmtLen(next));
  }
});
function endDrag(e) {
  if (!g || (e && e.pointerId !== g.id)) return;
  const cur = g; g = null;
  if (cur.mode === 'wait') { clearTimeout(cur.timer); if (e?.type === 'pointerup') tap(cur.k); return; }
  hidePill(); ghost.classList.remove('on'); railhi.style.opacity = 0;
  if (cur.mode === 'move') {
    const before = cur.start0, after = cur.last;
    cur.c.classList.add('settle'); cur.c.style.translate = `0 ${y(after) - y(before)}px`;
    setTimeout(() => {
      cur.k.start = after; render();
      if (after !== before) { buzz(15); log(`Moved "${cur.k.t}" to ${fmt(after)}`); toast(`Moved to ${fmt(after)}`, () => { cur.k.start = before; render(); }); }
      else log('Put back');
    }, 200);
  } else if (cur.mode === 'len') {
    const before = cur.len0, after = cur.last; cur.k.len = after; render();
    if (after !== before) { buzz(15); log(`"${cur.k.t}" is now ${fmtLen(after)}`); toast(fmtLen(after), () => { cur.k.len = before; render(); }); }
  }
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

function tap(k) {
  const now = performance.now();
  if (dblTap && lastTap.id === k.id && now - lastTap.t < 300) {
    clearTimeout(tapTimer); lastTap = {id: null, t: 0};
    const before = k.start, after = Math.round(NOW / 5) * 5; k.start = after; render(); buzz(15);
    log(`Double tap: started "${k.t}" at ${fmt(after)}`); toast(`Started now · ${fmt(after)}`, () => { k.start = before; render(); });
    return;
  }
  lastTap = {id: k.id, t: now};
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => openSheet(k), dblTap ? 260 : 0);
}

let sheetTask = null;
const scrim = $('#scrim'), sheet = $('#sheet');
function openSheet(k) { sheetTask = k; $('#stitle').textContent = k.t; setT(k.start); setL(k.len); sheet.classList.add('on'); scrim.classList.add('on'); log(`Opened "${k.t}"`); }
function closeSheet() { sheet.classList.remove('on'); scrim.classList.remove('on'); }
$('#sclose').onclick = closeSheet; scrim.onclick = closeSheet;
const T0 = 6 * 60, T1 = 23 * 60, L0 = 5, L1 = 240;
function place(sl, frac) { const tr = sl.querySelector('.track'); const w = tr.getBoundingClientRect().width || 300; sl.querySelector('.thumb').style.insetInlineStart = (14 + frac * w) + 'px'; sl.querySelector('.fill').style.inlineSize = (frac * w) + 'px'; }
function setT(m) { $('#tval').textContent = fmt(m); place($('#tslider'), (m - T0) / (T1 - T0)); $('#tslider').setAttribute('aria-valuetext', fmt(m)); }
function setL(m) { $('#lval').textContent = fmtLen(m); place($('#lslider'), (m - L0) / (L1 - L0)); $('#lslider').setAttribute('aria-valuetext', fmtLen(m)); }
function slider(el, from, to, snapFor, set, commit) {
  let drag = null;
  const valueAt = (e, fine) => { const tr = el.querySelector('.track').getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - tr.left) / tr.width)); const raw = from + f * (to - from); const s = snapFor(raw, fine); return Math.max(from, Math.min(to, Math.round(raw / s) * s)); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); capture(el, e.pointerId); el.classList.add('active'); drag = {y0: el.getBoundingClientRect().top + 24, v: null, start: null}; const v = valueAt(e, false); drag.start = sheetTask && (el.id === 'tslider' ? sheetTask.start : sheetTask.len); drag.v = v; set(v, false); buzz(8); });
  el.addEventListener('pointermove', e => { if (!drag) return; const fine = e.clientY - drag.y0 > 24 + 24; const v = valueAt(e, fine); el.closest('.srow').querySelector('.val').classList.toggle('fine', fine); if (v !== drag.v) { drag.v = v; buzz(fine ? 4 : 6); set(v, fine); } });
  const up = () => { if (!drag) return; el.classList.remove('active'); el.closest('.srow').querySelector('.val').classList.remove('fine'); const {v, start} = drag; drag = null; if (v !== start) { buzz(15); commit(v, start); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
slider($('#tslider'), T0, T1, (raw, fine) => fine ? 15 : 30, v => setT(v), (v, before) => { const k = sheetTask; k.start = v; render(); log(`Time slider: ${fmt(v)}`); toast(`Time ${fmt(v)}`, () => { k.start = before; render(); setT(before); }); });
slider($('#lslider'), L0, L1, (raw, fine) => fine ? 5 : raw < 30 ? 5 : 15, v => setL(v), (v, before) => { const k = sheetTask; k.len = v; render(); log(`Length slider: ${fmtLen(v)}`); toast(fmtLen(v), () => { k.len = before; render(); setL(before); }); });

let water = 3; const pill = $('#pill'), revR = $('#pillwrap .rev.r'), revL = $('#pillwrap .rev.l');
let p = null;
pill.addEventListener('pointerdown', e => { e.preventDefault(); capture(pill, e.pointerId); pill.classList.remove('back'); p = {x0: e.clientX, armed: false}; });
pill.addEventListener('pointermove', e => {
  if (!p) return; const dx = Math.max(-80, Math.min(80, e.clientX - p.x0)); pill.style.translate = `${dx}px 0`;
  revR.style.opacity = dx > 0 ? Math.min(1, dx / 48) : 0; revL.style.opacity = dx < 0 ? Math.min(1, -dx / 48) : 0;
  const armed = Math.abs(dx) >= 48; if (armed !== p.armed) { p.armed = armed; if (armed) buzz(8); }
});
const pillUp = e => {
  if (!p) return; const dx = e.clientX - p.x0; p = null;
  pill.classList.add('back'); pill.style.translate = '0 0'; revR.style.opacity = 0; revL.style.opacity = 0;
  if (dx >= 48) { water = Math.min(20, water + 1); buzz(15); $('#arc').style.strokeDashoffset = 81.7 * (1 - water / 8); $('#pillval').textContent = `${water}/8`; log(`Pill swipe right: glass ${water} of 8`); toast(`Glass logged · ${water} of 8`, () => { water--; $('#arc').style.strokeDashoffset = 81.7 * (1 - water / 8); $('#pillval').textContent = `${water}/8`; }); setTimeout(() => { $('#pillval').textContent = '34m'; $('#arc').style.strokeDashoffset = 40; }, 2500); }
  else if (dx <= -48) { const k = find('c'); k.done = true; render(); buzz(15); log('Pill swipe left: "Draft my section" done'); toast('Done · Draft my section', () => { k.done = false; render(); }); }
  else if (Math.abs(dx) < 8) log('Pill tap: would open the island');
};
pill.addEventListener('pointerup', pillUp); pill.addEventListener('pointercancel', pillUp);

$('#dtT').onclick = e => { dblTap = !dblTap; e.currentTarget.setAttribute('aria-pressed', dblTap); log(`Double tap ${dblTap ? 'on (tap waits 260 ms)' : 'off (tap opens at once)'}`); };
$('#snapT').onclick = e => { const small = hourPx === 64; hourPx = small ? 48 : 64; e.currentTarget.setAttribute('aria-pressed', small); render(); log(`Snap step ${hourPx / 4} px per 15 min`); };
render();
scroll.scrollTop = y(15 * 60) - 120;
