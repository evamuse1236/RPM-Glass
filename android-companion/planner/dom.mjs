/** Small DOM helpers. The WebView CSP forbids inline style attributes, so all
 * styling goes through classes, data attributes and CSSOM custom properties. */

export function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

/** A Material Symbols ligature, decorative unless given a label. */
export function icon(name, {fill = false, cls = ''} = {}) {
  const node = el('span', ['ms', fill ? 'fill' : '', cls].filter(Boolean).join(' '), name);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function button(label, onClick, cls = '') {
  const node = el('button', cls, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

/** 48dp icon button with an accessible name. */
export function iconButton(name, label, onClick, {fill = false, cls = ''} = {}) {
  const node = button('', onClick, ['icon-btn', cls].filter(Boolean).join(' '));
  node.setAttribute('aria-label', label);
  node.append(icon(name, {fill}));
  return node;
}

/** Button with a leading icon and a text label (text, tonal, filled, outlined). */
export function labelButton(iconName, label, onClick, cls = 'text-btn') {
  const node = button('', onClick, cls);
  if (iconName) node.append(icon(iconName));
  node.append(el('span', '', label));
  return node;
}

export function attrs(node, values) {
  for (const [key, value] of Object.entries(values)) node.setAttribute(key, String(value));
  return node;
}

/** Material list item: optional leading node, headline, supporting text, trailing node. */
export function listItem({leading = null, headline, supporting = '', trailing = null, onClick = null, cls = ''}) {
  const node = onClick ? button('', onClick, 'list-item ' + cls) : el('div', 'list-item ' + cls);
  if (leading) node.append(typeof leading === 'string' ? icon(leading, {cls: 'leading'}) : leading);
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'list-headline', headline));
  if (supporting) copy.append(el('span', 'list-supporting', supporting));
  node.append(copy);
  if (trailing) node.append(typeof trailing === 'string' ? icon(trailing, {cls: 'trailing'}) : trailing);
  return node;
}

export function sectionHeader(title, trailing = null) {
  const node = el('div', 'section-header');
  node.append(el('h2', '', title));
  if (trailing) node.append(trailing);
  return node;
}

export function emptyState({symbol = 'inbox', title, body = '', action = null, label = '', secondary = null}) {
  const node = el('div', 'empty-state');
  const art = el('div', 'empty-art');
  art.append(icon(symbol));
  node.append(art, el('h2', '', title));
  if (body) node.append(el('p', '', body));
  if (action) node.append(button(label, action, 'tonal-btn'));
  if (secondary) node.append(secondary);
  return node;
}

/** Linear progress indicator with an accessible value. */
export function progress(done, total, label) {
  const track = el('div', 'progress');
  const percent = total ? Math.round(done / total * 100) : 0;
  attrs(track, {
    role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent,
  });
  const fill = el('span');
  fill.style.setProperty('--value', String(percent / 100));
  track.append(fill);
  return track;
}

export function areaDot(tone) {
  const dot = el('span', 'area-dot');
  dot.dataset.tone = tone;
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}
