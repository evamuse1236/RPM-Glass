/** `h('button.text-btn', {onclick}, 'Undo')`: tag with optional classes, then props, then children. */
export function h(spec, props = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node && !key.includes('-') && key !== 'list') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

export const icon = (name, {fill = false, cls = ''} = {}) =>
  h(`span.ms${fill ? '.fill' : ''}${cls ? '.' + cls : ''}`, {'aria-hidden': 'true'}, name);

export const iconButton = (name, label, onclick, cls = 'icon-btn') =>
  h(`button.${cls}`, {type: 'button', 'aria-label': label, title: label, onclick}, icon(name));

export function emptyState(symbol, title, text, action = null) {
  return h('div.empty-state', h('div.empty-art', icon(symbol)), h('h2', title), text && h('p', text), action);
}

/** "just now", "3 min ago", "2 h ago", "3 days ago". */
export function ago(ms) {
  if (ms == null) return 'not yet';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export const ago2 = ms => ago(ms).replace(' ago', '');

/** Replaces a region's children and puts keyboard focus back on the element with the same data-focus key. */
export function swap(region, ...children) {
  const active = document.activeElement;
  const key = region.contains(active) ? active?.dataset?.focus : null;
  region.replaceChildren(...children.flat().filter(Boolean));
  const again = key ? region.querySelector(`[data-focus="${CSS.escape(key)}"]`) : null;
  if (!again) return;
  again.focus({preventScroll: true});
  if (again instanceof HTMLInputElement) again.setSelectionRange(again.value.length, again.value.length);
}
