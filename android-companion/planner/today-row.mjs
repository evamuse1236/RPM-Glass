/** Today's list row and its phrases, shared by the body rows. A copy of today.mjs's private `listRow`, `phrase` and
 * `sep`; today.mjs moves to these once the body rows join the real Today (today.mjs is over the commit size limit). */
import {el, icon, button} from './dom.mjs';

/**
 * A Material list row: leading icon, the headline on its own full-width line, then supporting lines beside at most
 * one trailing text button, so a title never wraps to make room for it (`top` puts the button beside a short headline
 * instead, so the lines get the full width). The whole row opens; the button acts.
 */
export function listRow({symbol, alert = false, headline, lines = [], action, onAction, open, label, top = false}) {
  const row = el('div', 'today-row' + (alert ? ' is-alert' : '') + (top ? ' action-top' : ''));
  const main = button('', open ?? onAction, 'today-row-main');
  const lead = icon(symbol, {cls: 'leading'});
  const title = el('span', 'today-row-headline');
  title.append(...[headline].flat());
  const copy = el('span', 'today-row-supporting');
  for (const line of lines) {
    const node = el('span', 'today-row-line');
    node.append(...[line].flat());
    node.classList.toggle('is-clash-item', !!node.querySelector('.clash-time'));
    copy.append(node);
  }
  main.setAttribute('aria-label', label ?? [title, ...copy.children].map(node => node.textContent).join('. '));
  for (const node of [lead, title, copy]) node.setAttribute('aria-hidden', 'true');
  row.append(main, lead, title, copy);
  if (action) row.append(button(action, onAction, 'text-btn today-row-action'));
  return row;
}

export const phrase = (text, cls = '') => el('span', 'phrase' + (cls ? ' ' + cls : ''), text);
/** " · " between phrases; with large text each phrase takes its own line instead. */
export const sep = () => el('span', 'sep', ' · ');

/** Phrases joined by " · "; a phrase that yields (and its separator) gives way first with large text. */
export function phraseNodes(parts) {
  const nodes = [];
  parts.forEach((part, i) => {
    if (part.yields) {
      const yieldBox = el('span', 'yield');
      yieldBox.append(...(i ? [sep()] : []), phrase(part.text));
      nodes.push(yieldBox);
    } else nodes.push(...(i ? [sep()] : []), phrase(part.text));
  });
  return nodes;
}
