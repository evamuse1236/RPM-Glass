import {css} from './notch-geometry.mjs';

export const ICONS = {TASK: 'notch_ic_task', EVENT: 'notch_ic_event', WATER: 'notch_ic_water', HABIT: 'notch_ic_routine', MEAL: 'notch_ic_meal',
  REMINDER: 'ic_notification', ALARM: 'ic_clock'};
const ACCENT = {WATER: '#7CACF8', HABIT: '#6DD58C', MEAL: '#FDD663', ALARM: '#F2B8B5', REMINDER: 'rgb(255 255 255 / .87)'};
export const TILE = {HABIT: '#146C2E', EVENT: '#3C4043'};
export const plain = look => look === 'TASK' || look === 'EVENT' || look === 'REMINDER';
export const accent = look => ACCENT[look] ?? 'rgb(255 255 255 / .6)';
export const lookOf = (kind, scene) => kind === 'WATER' ? 'WATER' : kind === 'HABIT' ? 'HABIT' : scene.hero?.task.fixed ? 'EVENT' : 'TASK';

export function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return Object.assign(node, props);
}

export function glyph(look, icon = ICONS[look]) {
  const g = el('span', 'notch-glyph');
  g.setAttribute('aria-hidden', 'true');
  g.style.setProperty('--icon', `url(/__playground/icon/${icon}.svg)`);
  return g;
}

export function text(value, sp, color, weight, className = 'notch-text') {
  const t = el('span', className, {textContent: value});
  t.style.cssText = `font-size:calc(${sp}px * var(--font-scale));color:${color};font-weight:${weight}`;
  return t;
}

export function iconCircle(look, size) {
  const c = el('span', 'notch-circle');
  c.style.inlineSize = c.style.blockSize = css(size);
  c.style.background = plain(look) ? '#3C3C3C' : `color-mix(in srgb, ${accent(look)} 24%, transparent)`;
  const g = glyph(look);
  g.style.inlineSize = g.style.blockSize = css(Math.round(size * 0.6));
  g.style.color = plain(look) ? 'rgb(255 255 255 / .87)' : accent(look);
  c.append(g);
  return c;
}

export function button(className, label, action) {
  const b = el('button', className, {type: 'button'});
  b.setAttribute('aria-label', label);
  b.addEventListener('click', event => { event.stopPropagation(); action(); });
  return b;
}

/** One labelled control: glyph over its name, as NotchContent.control draws it. */
export function control(icon, label, spoken, enabled, action) {
  const b = button('notch-control', enabled ? spoken : spoken + ', not available now', action);
  b.disabled = !enabled;
  b.append(glyph(null, icon), el('span', 'notch-control-label', {textContent: label}));
  return b;
}
