// Copy of NotchParts, NotchInk and NotchBand's icons.
export const ICONS = {TASK: 'notch_ic_task', EVENT: 'notch_ic_event', WATER: 'notch_ic_water', HABIT: 'notch_ic_routine', MEAL: 'notch_ic_meal',
  REMINDER: 'ic_notification', ALARM: 'ic_clock'};
export const INK = {TASK: '#A8C7FA', EVENT: '#C4C7C5', WATER: '#7CACF8', HABIT: '#6DD58C', MEAL: '#FDD663', ALARM: '#F2B8B5',
  REMINDER: 'rgb(255 255 255 / .87)', W87: 'rgb(255 255 255 / .87)', W70: 'rgb(255 255 255 / .7)', W60: 'rgb(255 255 255 / .6)'};
export const accent = look => INK[look] ?? INK.TASK;
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

export function text(value, className, color) {
  const t = el('span', className, {textContent: value});
  if (color) t.style.color = color;
  return t;
}

export function button(className, label, action) {
  const b = el('button', className, {type: 'button'});
  b.setAttribute('aria-label', label);
  b.addEventListener('click', event => { event.stopPropagation(); action(); });
  return b;
}

/** The face: its column padded 16dp on three sides and below the band on top. */
export function face(className, ...parts) {
  const f = el('div', `island-face ${className}`);
  f.append(...parts);
  return f;
}

export const title = words => text(words, 'notch-title');
export const line = (words, color) => text(words, 'notch-line', color);

/** A 40dp pill control with a 48dp touch area: the primary is filled with its accent and a dark label, the secondary white 8%. */
export function pill(icon, label, spoken, color, primary, action) {
  const b = button(primary ? 'notch-pill-button notch-primary' : 'notch-pill-button notch-secondary', spoken, action);
  b.style.setProperty('--kc', color);
  if (primary && color === INK.ALARM) b.style.setProperty('--kc-ink', 'var(--alarm-ink)');
  if (icon) b.append(glyph(null, icon));
  b.append(text(label, 'notch-pill-label'));
  return b;
}

/** One control spans the width; two sit side by side, 8dp apart, the primary first; at large text the second drops under. */
export function controls(...pills) {
  const c = el('div', 'notch-controls');
  c.append(...pills);
  return c;
}

/** A 44dp row, fully round: glyph, title, then the trailing parts. A button only with an action. */
export function row(icon, iconColor, title, spoken, action, ...trailing) {
  const r = action ? button('notch-row notch-row-tap', spoken, action) : el('div', 'notch-row');
  if (!action) r.setAttribute('aria-label', spoken);
  const g = glyph(null, icon);
  g.style.color = iconColor;
  r.append(g, text(title, 'notch-row-title'), ...trailing);
  return r;
}

export const rowValue = (value, color) => text(value, 'notch-row-value', color);

/** A 40dp round button: Done on an alert row. */
export function circle(className, spoken, action, icon) {
  const b = button(`notch-circle-button ${className}`, spoken, action);
  b.append(glyph(null, icon));
  return b;
}
