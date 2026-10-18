// Copy of NotchPill, NotchContent, NotchAnchor and IslandView's shapes, drawn in device pixels of a Galaxy S24 FE.
import {S24} from './device.mjs';

const D = S24.density, dp = v => Math.round(v * D), css = px => `${px / D}px`;
const ICONS = {TASK: 'notch_ic_task', EVENT: 'notch_ic_event', WATER: 'notch_ic_water', HABIT: 'notch_ic_routine', MEAL: 'notch_ic_meal'};
const ACCENT = {WATER: '#7CACF8', HABIT: '#6DD58C', MEAL: '#FDD663'};
const TILE = {HABIT: '#146C2E', EVENT: '#3C4043'};
const plain = look => look === 'TASK' || look === 'EVENT';
const accent = look => ACCENT[look] ?? 'rgb(255 255 255 / .6)';
const lookOf = (kind, scene) => kind === 'WATER' ? 'WATER' : kind === 'HABIT' ? 'HABIT' : scene.hero?.task.fixed ? 'EVENT' : 'TASK';
const EAR_CURVE = 0.5523;

function anchor() {
  const hole = S24.hole.diameter, pill = Math.max(dp(36), hole + dp(8));
  const centerY = Math.max(Math.floor(pill / 2), S24.hole.centerY + hole / 2 - Math.floor(hole / 2));
  return {centerX: S24.hole.centerX, centerY, hole, pill, top: centerY - Math.floor(pill / 2)};
}

function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return Object.assign(node, props);
}

function glyph(look, icon = ICONS[look]) {
  const g = el('span', 'notch-glyph');
  g.style.setProperty('--icon', `url(/__playground/icon/${icon}.svg)`);
  return g;
}

function iconCircle(look, size) {
  const c = el('span', 'notch-circle');
  c.style.inlineSize = c.style.blockSize = css(size);
  c.style.background = plain(look) ? '#3C3C3C' : `color-mix(in srgb, ${accent(look)} 24%, transparent)`;
  const g = glyph(look);
  g.style.inlineSize = g.style.blockSize = css(Math.round(size * 0.6));
  g.style.color = plain(look) ? 'rgb(255 255 255 / .87)' : accent(look);
  c.append(g);
  return c;
}

function measure(stage, value) {
  const probe = text(value, 15, '#fff', 600, 'notch-text notch-probe');
  stage.append(probe);
  const width = Math.ceil(probe.getBoundingClientRect().width * D);
  probe.remove();
  return width;
}

function bodyPath(x, y, w, h, rt, rb, ear) {
  rt = Math.min(rt, h / 2); rb = Math.min(rb, h / 2);
  let d = `M${x + rt} ${y}H${x + w - rt}A${rt} ${rt} 0 0 1 ${x + w} ${y + rt}V${y + h - rb}A${rb} ${rb} 0 0 1 ${x + w - rb} ${y + h}`
    + `H${x + rb}A${rb} ${rb} 0 0 1 ${x} ${y + h - rb}V${y + rt}A${rt} ${rt} 0 0 1 ${x + rt} ${y}Z`;
  const e = Math.min(ear, h / 2);
  if (e >= 0.5) {
    const k = e * (1 - EAR_CURVE), r = x + w;
    d += `M${x - e} ${y}L${x + 1} ${y}L${x + 1} ${y + e}L${x} ${y + e}C${x} ${y + k} ${x - k} ${y} ${x - e} ${y}Z`;
    d += `M${r - 1} ${y}L${r + e} ${y}C${r + k} ${y} ${r} ${y + k} ${r} ${y + e}L${r - 1} ${y + e}Z`;
  }
  return d;
}

function describe(primary, secondary, scene) {
  const say = item => item.kind === 'WATER' ? `Water due, ${scene.water.count} of ${scene.water.goal} glasses`
    : item.kind === 'HABIT' ? `${scene.habit.routine.name}, ${scene.habit.done} of ${scene.habit.total} steps done` : scene.spoken;
  return say(primary) + (secondary ? '. Also ' + say(secondary) : '') + '. Tap to open.';
}

function text(value, sp, color, weight, className = 'notch-text') {
  const t = el('span', className, {textContent: value});
  t.style.cssText = `font-size:calc(${sp}px * var(--font-scale));color:${color};font-weight:${weight}`;
  return t;
}

function collapsed(stage, svg, primary, secondary, scene, onTap) {
  const a = anchor(), h = a.pill, look = lookOf(primary.kind, scene);
  const circle = Math.min(h - dp(12), dp(28)), inset = Math.floor((h - circle) / 2);
  const keep = Math.max(dp(24), a.hole + dp(12));
  const lead = inset + circle + dp(8), trail = measure(stage, primary.text) + dp(8) + dp(14);
  const side = Math.max(lead, trail, Math.floor((dp(140) - keep + 1) / 2)), w = side + keep + side;
  const x = Math.max(dp(4), Math.min(a.centerX - Math.floor(keep / 2) - side, S24.width - w - dp(4)));
  svg.innerHTML = `<path d="${bodyPath(x, a.top, w, h, h / 2, h / 2, 0)}"/>`;
  const pill = el('button', 'notch-pill', {type: 'button', onclick: event => { event.stopPropagation(); onTap(); }});
  pill.setAttribute('aria-label', describe(primary, secondary, scene));
  Object.assign(pill.style, {insetInlineStart: css(x), insetBlockStart: css(a.top), inlineSize: css(w), blockSize: css(h)});
  const icon = iconCircle(look, circle);
  icon.style.marginInlineStart = css(inset);
  icon.style.marginInlineEnd = css(side - inset - circle);
  const value = text(primary.text, 15, plain(look) ? '#fff' : accent(look), 600, 'notch-text notch-value');
  Object.assign(value.style, {inlineSize: css(side), paddingInline: `${css(dp(8))} ${css(dp(14))}`, marginInlineStart: css(keep)});
  pill.append(icon, value);
  stage.append(pill);
  if (secondary) {
    const cx = x - dp(8) - h / 2;
    svg.innerHTML += `<circle cx="${cx}" cy="${a.centerY}" r="${h / 2}"/>`;
    const split = iconCircle(lookOf(secondary.kind, scene), circle);
    split.classList.add('notch-split');
    Object.assign(split.style, {insetInlineStart: css(cx - circle / 2), insetBlockStart: css(a.centerY - circle / 2)});
    stage.append(split);
  }
}

function control(icon, label, enabled, action) {
  const b = el('button', 'notch-control', {type: 'button', disabled: !enabled, onclick: action});
  b.setAttribute('aria-label', enabled ? label : label + ', not available now');
  b.append(glyph(null, icon));
  return b;
}

function panel(scene, actions) {
  const a = anchor(), look = scene.heroLook;
  const col = el('div', 'notch-panel');
  col.style.paddingBlockStart = css(a.top + a.pill + dp(10));
  const hero = el('div', 'notch-hero');
  const art = el('span', 'notch-tile');
  art.style.background = TILE[look] ?? '#0B57D0';
  art.append(glyph(look));
  const words = el('div', 'notch-words');
  words.append(text(scene.heroTitle, 17, '#fff', 600), text(scene.heroSubtitle, 14, accent(look), 400, 'notch-text notch-sub'));
  hero.append(art, words);
  const bar = el('div', 'notch-bar');
  const track = el('span', 'notch-track');
  const fill = el('span', 'notch-fill');
  fill.style.cssText = `inline-size:max(4px, ${scene.progress * 100}%);background:${plain(look) ? 'rgb(255 255 255 / .87)' : accent(look)}`;
  track.append(fill);
  bar.append(text(scene.barStart, 12, 'rgb(255 255 255 / .6)', 500), track, text(scene.barEnd, 12, 'rgb(255 255 255 / .6)', 500));
  const controls = el('div', 'notch-controls');
  controls.append(control('notch_ic_done', scene.canDone ? 'Done: ' + scene.heroTitle : 'Done', scene.canDone, actions.done),
    control('notch_ic_snooze', `Snooze ${scene.snoozeMinutes} minutes`, scene.canSnooze, actions.snooze),
    control('notch_ic_meal', 'Log a meal', scene.canLogMeal, actions.logMeal),
    control('notch_ic_agent', 'Ask agent', true, actions.askAgent));
  col.append(hero, bar, controls);
  if (scene.rows.length) col.append(el('hr', 'notch-rule'));
  for (const r of scene.rows) {
    const row = el('div', 'notch-row');
    const g = glyph(r.look);
    g.style.color = accent(r.look);
    row.append(g, text(r.title, 15, 'rgb(255 255 255 / .87)', 400, 'notch-text notch-row-title'), text(r.value, 15, accent(r.look), plain(r.look) ? 400 : 500));
    col.append(row);
  }
  return col;
}

function expanded(stage, svg, scene, actions) {
  const ear = dp(14), x = dp(6) + ear, w = S24.width - 2 * x;
  const col = panel(scene, actions);
  Object.assign(col.style, {insetInlineStart: css(x), inlineSize: css(w)});
  stage.append(col);
  const h = col.getBoundingClientRect().height * D;
  svg.innerHTML = `<path d="${bodyPath(x, 0, w, h, 0, dp(32), ear)}"/>`;
}

/** Draws the island for one moment. Returns false when the phone would hide it (nothing to show). */
export function renderNotch(stage, {scene, primary, secondary, expand, fontScale, actions, onTap}) {
  stage.replaceChildren();
  stage.style.setProperty('--font-scale', fontScale);
  if (!primary) return false;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${S24.width} ${S24.height}`);
  svg.classList.add('notch-ink');
  stage.append(svg);
  if (expand) expanded(stage, svg, scene, actions);
  else collapsed(stage, svg, primary, secondary, scene, onTap);
  return true;
}
