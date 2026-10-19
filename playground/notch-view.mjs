// Copy of NotchPill, NotchContent, IslandView and IslandBand: one black island that morphs between the pill, the open island,
// the alert islands and the receipt, with the band's ring and value travelling between them.
import {S24} from './device.mjs';
import {D, G, anchor, ISLAND_INSET_DP, pillRing, bandAt} from './notch-geometry.mjs';
import {el, glyph, button, face, title, line, pill, controls, row, rowValue, circle, accent, lookOf, ICONS, INK} from './notch-parts.mjs';
import {alertFace} from './notch-alert.mjs';
import {alertChip, alertSpoken, receiptFace, manageFace, MARK} from './notch-change.mjs';
import {alertLook, alertName, controls as heroControls, visibleRows, progress, heroValue} from './notch-scene.mjs';
import {dropAmPm} from './notch-day.mjs';
import {swipeable} from './notch-gesture.mjs';

const C = 2 * Math.PI * 16.5;
const MAX_SHARE = 0.6;

function describe(primary, secondary, scene) {
  const say = item => item.kind === 'WATER' ? `Water due, ${scene.water.count} of ${scene.water.goal} glasses`
    : item.kind === 'HABIT' ? `${scene.habit.routine.name}, ${scene.habit.done} of ${scene.habit.total} steps done` : scene.spoken;
  return say(primary) + (secondary ? '. Also ' + say(secondary) : '') + '. Opens the island.';
}

/** What the band shows: NotchBand.of. */
function bandFor({mode, scene, primary, note, alert, managed, receipt}) {
  const ring = (look, p, value, valueColor, sp, chip = false) =>
    ({disc: 'ring', icon: ICONS[look], glyphColor: look === 'TASK' || look === 'EVENT' ? INK.W87 : accent(look), accent: accent(look), p, value, valueColor, sp, chip});
  if (mode === 'open') return ring(scene.heroLook, scene.progress, heroValue(scene), accent(scene.heroLook), G.BAND_VALUE_SP);
  if (mode === 'reminder') return {disc: 'plain', icon: 'ic_notification', glyphColor: INK.W87, p: 0, value: dropAmPm(alert.at), valueColor: '#fff', sp: G.ALERT_TIME_SP};
  if (mode === 'alarm') return {disc: 'alarm', icon: 'ic_clock', glyphColor: INK.ALARM, p: 0, value: '', sp: G.ALERT_TIME_SP, pulse: true};
  if (mode === 'manage') {
    const alarm = managed.alert === 'alarm';
    return {disc: alarm ? 'alarm' : 'plain', icon: alarm ? 'ic_clock' : 'ic_notification', glyphColor: alarm ? INK.ALARM : INK.W87, p: 0,
      value: dropAmPm(managed.at), valueColor: '#fff', sp: G.ALERT_TIME_SP};
  }
  if (mode === 'receipt') {
    const [icon, color, glyphColor] = MARK[receipt.mark] ?? MARK.done;
    return {disc: 'ring', icon, glyphColor, accent: color, p: receipt.to, from: receipt.from, at: receipt.at, value: '', sp: G.BAND_VALUE_SP};
  }
  const look = primary ? lookOf(primary.kind, scene) : 'TASK';
  const plain = look === 'TASK' || look === 'EVENT';
  return ring(look, primary ? progress(primary.kind, scene) : 0, note?.text ?? primary.text, plain || note ? '#fff' : accent(look), G.PILL_VALUE_SP, !!note?.chip);
}

function ringEl(className) {
  const r = el('div', className);
  r.setAttribute('aria-hidden', 'true');
  r.innerHTML = `<svg viewBox="0 0 36 36"><circle class="notch-disc" cx="18" cy="18" r="18"/><circle class="notch-track" cx="18" cy="18" r="16.5"/>`
    + `<circle class="notch-arc" cx="18" cy="18" r="16.5" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`;
  r.append(el('span', 'notch-ring-glyph'));
  return r;
}

function paintRing(r, band) {
  r.dataset.disc = band.disc;
  r.style.setProperty('--kc', band.accent ?? INK.W87);
  r.style.setProperty('--gc', band.glyphColor);
  const g = r.querySelector('.notch-ring-glyph');
  if (g.dataset.icon !== band.icon) {
    g.dataset.icon = band.icon;
    g.replaceChildren(glyph(null, band.icon));
  }
  const arc = r.querySelector('.notch-arc');
  const to = String(C * (1 - Math.max(0, Math.min(1, band.p))));
  if (band.from != null && r.dataset.receipt !== String(band.at)) {
    r.dataset.receipt = String(band.at);
    arc.style.transition = 'none';
    arc.style.strokeDashoffset = String(C * (1 - band.from));
    arc.getBoundingClientRect();
    arc.style.transition = '';
  }
  if (band.from == null) delete r.dataset.receipt;
  arc.style.strokeDashoffset = to;
}

/** Only the characters that change move: the old one rolls up and out, the new one rolls in from below (IslandBand). */
function setValue(v, value) {
  const old = v.dataset.v ?? '';
  if (old === value) return;
  v.dataset.v = value;
  if (!old || !value) {
    v.replaceChildren(...[...value].map(c => el('span', 'notch-c', {textContent: c})));
    return;
  }
  const n = value.length, out = [];
  for (let i = 0; i < n; i++) {
    const o = old[old.length - n + i] ?? '', c = value[i];
    const cell = el('span', 'notch-c');
    if (o === c) cell.textContent = c;
    else cell.append(el('span', 'notch-o', {textContent: o}), el('span', 'notch-n', {textContent: c}));
    out.push(cell);
  }
  v.replaceChildren(...out);
}

/** The value is laid out once at 22sp and scaled from its end, so it travels and grows without relaying out mid-morph. */
const valueScale = (band, fontScale, pillDp) =>
  (band.sp === G.PILL_VALUE_SP ? Math.min(G.PILL_VALUE_SP * fontScale, pillDp - G.VALUE_CAP_DP) : band.sp * fontScale) / (G.BAND_VALUE_SP * fontScale);

function paintValue(v, band, at, fontScale, pillDp) {
  if (band.value) setValue(v, band.value);
  v.dataset.chip = String(!!band.chip);
  v.style.setProperty('--vc', band.valueColor ?? '#fff');
  v.style.opacity = band.value ? '1' : '0';
  v.style.fontSize = `${G.BAND_VALUE_SP * fontScale}px`;
  v.style.scale = String(valueScale(band, fontScale, pillDp));
  v.style.translate = `${at.valueRight - v.offsetWidth}px ${at.cy - v.offsetHeight / 2}px`;
}

function heroAlertRow(scene, actions) {
  const look = alertLook(scene.heroAlert);
  return row(ICONS[look], accent(look), alertName(scene.heroAlert), alertSpoken(scene.heroAlert, scene.heroTitle, scene.heroAt),
    () => actions.manage(scene.hero), rowValue(scene.heroAt, accent(look)));
}

function sceneRow(r, scene, actions) {
  const color = r.look === 'TASK' || r.look === 'EVENT' ? INK.W60 : accent(r.look);
  if (r.look === 'WATER' && scene.water) {
    const dots = el('span', 'notch-dots');
    for (let i = 0; i < Math.min(12, scene.water.goal); i++) dots.append(el('i', i < scene.water.count ? 'on' : ''));
    const plus = glyph(null, 'notch_ic_plus');
    plus.style.color = INK.WATER;
    return row(ICONS.WATER, color, r.title, `${r.title}, ${r.value}. Log a glass of water`, actions.drink, dots,
      rowValue(`${scene.water.count}/${scene.water.goal}`, INK.WATER), plus);
  }
  if (r.alert) {
    const done = circle('notch-row-done', `Done: ${r.title}`, () => actions.doneSlot(r.slot), 'ic_check');
    return row(ICONS[r.look], color, r.title, alertSpoken(r.alert, r.title, r.value), () => actions.manage(r.slot), alertChip(r.alert, r.value), done);
  }
  if (r.look === 'MEAL') return row(ICONS.MEAL, color, r.title, `${r.title}, not logged. Log it in the planner`, actions.logMeal, rowValue('Log', INK.MEAL));
  const value = r.look === 'HABIT' && scene.habit ? `${scene.habit.done}/${scene.habit.total}` : r.value;
  return row(ICONS[r.look], color, r.title, `${r.title}, ${r.value}`, null, rowValue(value, r.look === 'HABIT' ? INK.HABIT : INK.W60));
}

/** The open island: title, line, the hero's one control (two when Later sits beside Glass), then up to maxRows rows. */
function openFace(scene, actions, maxRows) {
  const heroAccent = accent(scene.heroLook);
  const pills = heroControls(scene).map((c, i) => c === 'DONE' ? pill('ic_check', 'Done', `Done: ${scene.heroTitle}`, heroAccent, i === 0, actions.done)
    : c === 'GLASS' ? pill('notch_ic_water', 'Glass', 'Log a glass of water', INK.WATER, i === 0, actions.drink)
      : pill('notch_ic_snooze', 'Later', `Snooze ${scene.snoozeMinutes} minutes`, heroAccent, i === 0, actions.snooze));
  const rows = [];
  let room = maxRows;
  if (scene.heroAlert && room > 0) { rows.push(heroAlertRow(scene, actions)); room--; }
  rows.push(...visibleRows(scene, room).map(r => sceneRow(r, scene, actions)));
  const parts = [title(scene.heroTitle), line(scene.heroSubtitle, heroAccent)];
  if (pills.length) parts.push(controls(...pills));
  if (rows.length) {
    const list = el('div', 'notch-rows');
    list.append(...rows);
    parts.push(list);
  }
  return face('island-open', ...parts);
}

function pillFace(stage, {primary, secondary, scene, note, onTap}, band, fontScale) {
  const a = anchor(), h = a.pill / D;
  const ring = pillRing(h), keep = Math.max(24, a.hole / D + 12);
  const probe = stage.querySelector(':scope > .notch-value');
  probe.style.fontSize = `${G.BAND_VALUE_SP * fontScale}px`;
  setValue(probe, band.value);
  const lead = (h - ring) / 2 + ring + G.VALUE_START_DP;
  const trail = G.VALUE_START_DP + probe.offsetWidth * valueScale(band, fontScale, h) + G.VALUE_END_DP;
  const side = Math.max(lead, trail, (G.MIN_PILL_WIDTH_DP - keep) / 2), w = side + keep + side;
  const x = Math.max(4, Math.min(a.centerX / D - keep / 2 - side, S24.width / D - w - 4));
  const f = button('island-face notch-pill', note?.spoken ?? describe(primary, secondary, scene), onTap);
  return {face: f, geo: {x, w, h, r: h / 2}};
}

function paintSplit(stage, {mode, secondary, scene}, geo) {
  let split = stage.querySelector(':scope > .notch-split');
  if (!secondary) return split?.remove();
  const a = anchor(), h = a.pill / D;
  if (!split) {
    split = el('span', 'notch-split');
    split.append(ringEl('notch-ring notch-split-ring'));
    stage.querySelector(':scope > .island').before(split);
  }
  const look = lookOf(secondary.kind, scene);
  paintRing(split.firstChild, {disc: 'ring', icon: ICONS[look], glyphColor: look === 'TASK' || look === 'EVENT' ? INK.W87 : accent(look), accent: accent(look),
    p: progress(secondary.kind, scene)});
  split.firstChild.style.inlineSize = split.firstChild.style.blockSize = `${pillRing(h)}px`;
  if (mode === 'pill') {
    Object.assign(split.style, {insetInlineStart: `${geo.x - 8 - h}px`, insetBlockStart: `${a.top / D}px`, inlineSize: `${h}px`, blockSize: `${h}px`, translate: ''});
    split.dataset.state = 'shown';
  } else {
    const at = parseFloat(split.style.insetInlineStart) || 0;
    split.style.translate = `${ISLAND_INSET_DP + G.PAD_DP - at}px ${G.PAD_DP}px`;
    split.dataset.state = 'away';
  }
}

function settle(island, next, same) {
  for (const old of island.querySelectorAll(':scope > .island-face')) {
    if (same) { old.remove(); continue; }
    if (old.dataset.state === 'leaving') continue;
    old.dataset.state = 'leaving';
    old.inert = true;
    Promise.allSettled(old.getAnimations().map(a => a.finished)).then(() => old.remove());
  }
  if (same) next.dataset.enter = 'instant';
  island.append(next);
}

/**
 * Draws the island for one moment and morphs to it from what is on screen. Returns false when the phone would hide it.
 * mode is 'pill', 'open', 'manage', 'receipt', 'reminder' or 'alarm'; gestures maps each mode to its swipe handlers.
 */
export function renderNotch(stage, opts) {
  const {scene, primary, mode, alert, managed, receipt, fontScale, actions, gestures, instant = false} = opts;
  stage.style.setProperty('--font-scale', fontScale);
  stage.dataset.text = fontScale >= 1.8 ? 'max' : fontScale > 1.3 ? 'large' : 'normal';
  const alerting = mode === 'reminder' || mode === 'alarm';
  if (!alerting && mode !== 'receipt' && !primary) {
    stage.replaceChildren();
    return false;
  }
  let island = stage.querySelector(':scope > .island');
  const first = !island;
  if (first) {
    island = el('div', 'island');
    stage.append(island, ringEl('notch-ring notch-band-ring'), el('div', 'notch-value'));
    swipeable(island, () => island.gestures ?? {});
  }
  island.gestures = gestures?.[mode] ?? {};
  const same = island.dataset.mode === mode;
  const band = bandFor(opts);
  const a = anchor(), top = a.top / D, h = a.pill / D;
  let next, geo;
  if (mode === 'pill') {
    ({face: next, geo} = pillFace(stage, opts, band, fontScale));
  } else {
    const w = S24.width / D - 2 * ISLAND_INSET_DP, cap = (S24.height / D) * MAX_SHARE;
    const build = rows => alerting ? alertFace(alert, actions) : mode === 'receipt' ? receiptFace(receipt, actions)
      : mode === 'manage' ? manageFace(managed, actions) : openFace(scene, actions, rows);
    let rows = 3;
    next = build(rows);
    next.style.setProperty('--face-w', `${w}px`);
    settle(island, next, same || first || instant);
    while (mode === 'open' && rows > 1 && next.offsetHeight > cap) {
      next.remove();
      next = build(--rows);
      next.style.setProperty('--face-w', `${w}px`);
      settle(island, next, true);
    }
    geo = {x: ISLAND_INSET_DP, w, h: Math.min(next.offsetHeight, cap), r: G.RADIUS_DP};
  }
  if (mode === 'pill') {
    next.style.setProperty('--face-w', `${geo.w}px`);
    next.style.blockSize = `${geo.h}px`;
    settle(island, next, same || first || instant);
  }
  island.dataset.motion = first || instant ? 'none' : mode === 'pill' ? 'close' : 'open';
  island.dataset.mode = mode;
  stage.dataset.mode = mode;
  Object.assign(island.style, {insetInlineStart: `${geo.x}px`, insetBlockStart: `${top}px`, inlineSize: `${geo.w}px`,
    blockSize: `${geo.h}px`, borderRadius: `${geo.r}px`});
  const at = bandAt(mode, geo, top);
  const ring = stage.querySelector(':scope > .notch-band-ring'), value = stage.querySelector(':scope > .notch-value');
  for (const e of [ring, value]) e.dataset.motion = island.dataset.motion;
  paintRing(ring, band);
  ring.dataset.pulse = String(!!band.pulse);
  Object.assign(ring.style, {inlineSize: `${at.d}px`, blockSize: `${at.d}px`, translate: `${at.cx - at.d / 2}px ${at.cy - at.d / 2}px`});
  paintValue(value, band, at, fontScale, h);
  paintSplit(stage, opts, geo);
  if (island.dataset.motion === 'none') {
    island.getBoundingClientRect();
    for (const e of [island, ring, value]) e.dataset.motion = 'idle';
  }
  return true;
}
