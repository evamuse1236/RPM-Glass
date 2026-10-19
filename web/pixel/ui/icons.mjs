import {ART, outline, dashed, toSvg} from './sprite-art.mjs';

const VARIANTS = {full: rows => rows, empty: outline, dashed};
const cache = new Map();

/** An inline pixel sprite: icon('heart', {variant: 'empty'}). */
export function icon(name, {variant = 'full', title = null, cls = ''} = {}) {
  const id = `${name}:${variant}:${title}:${cls}`;
  if (!cache.has(id)) cache.set(id, toSvg(VARIANTS[variant](ART[name]), {title, cls: `px-${name} ${cls}`}));
  const holder = document.createElement('span');
  holder.className = `sprite sprite-${name}`;
  holder.innerHTML = cache.get(id);
  return holder;
}
