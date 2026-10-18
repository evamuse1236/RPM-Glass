import {taskDate} from './review-state.mjs';
import {dueInfo, duration} from './planner/format.mjs';

export const STEPS = [
  {name: "Last week's Results", next: 'Next: empty your head'},
  {name: 'Empty your head', next: 'Next: sort the Inbox'},
  {name: 'Sort the Inbox', next: 'Next: pick Results'},
  {name: "This week's Results"},
];
export const VERDICTS = [['achieved', 'Achieved'], ['partly', 'Partly'], ['notyet', 'Not yet']];
export const VERDICT_RECEIPTS = {achieved: 'Result achieved', partly: 'Marked partly achieved', notyet: 'Marked not achieved yet'};
export const CHOICES = [['carry', 'Carry'], ['defer', 'Defer'], ['drop', 'Drop']];
export const MAX_FOCUS = 5;
/** Calendar states that come with events; any other state means free time can't be counted. */
export const READABLE = new Set(['ready', 'stale', 'incomplete']);

/* ---------- small DOM helpers (same conventions as planner.mjs) ---------- */
export function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}
export function icon(name, fill = false) {
  const node = el('span', fill ? 'ms fill' : 'ms', name);
  node.setAttribute('aria-hidden', 'true');
  return node;
}
export function button(label, onClick, cls = '', iconName = '') {
  const node = el('button', cls);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  if (label) node.append(el('span', 'wr-label', label));
  if (onClick) node.addEventListener('click', onClick);
  return node;
}
export function iconButton(name, label, onClick, cls = 'wr-icon-btn') {
  const node = button('', onClick, cls, name);
  node.setAttribute('aria-label', label);
  return node;
}
/** A strip cell's hours: "12h", "1.5h", "45m". Exact durations are in its accessible label. */
export const hours = minutes => (minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 30) / 2}h`);
export function weekLabel(day) {
  const date = new Date(day + 'T12:00:00');
  return 'Week of ' + date.toLocaleDateString(undefined, {day: 'numeric', month: 'long'});
}
export const dayName = day => new Date(day + 'T12:00').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'});
export const weekday = day => new Date(day + 'T12:00').toLocaleDateString(undefined, {weekday: 'short'});
export const capital = text => text[0].toUpperCase() + text.slice(1);

/** A Result's deadline as a chip: "Due tomorrow 11:00 PM", stronger when close, in error colour when past. */
export function dueChip(value, now) {
  const info = dueInfo(value, now);
  if (!info) return null;
  const chip = el('span', 'wr-due' + (info.overdue ? ' overdue' : info.soon ? ' soon' : ''));
  chip.append(icon(info.overdue ? 'error' : 'event'), el('span', '', info.label));
  return chip;
}
/** A task's own date ("Tomorrow 9:00 PM", "Overdue"): it is scheduled, not a deadline. */
export function whenText(task, now) {
  const value = taskDate(task);
  const info = value && dueInfo(value, now);
  if (!info) return null;
  return {text: capital(info.overdue ? 'Overdue' : info.label.replace(/^Due /, '')), overdue: info.overdue, soon: info.soon};
}

export function heading(title, sub) {
  const h = el('h2', 'wr-title', title);
  h.tabIndex = -1;
  return [h, el('p', 'wr-sub', sub)];
}
export function emptyState(iconName, title, body) {
  const box = el('div', 'wr-empty');
  const badge = el('div', 'wr-empty-icon');
  badge.append(icon(iconName));
  box.append(badge, el('h3', 'wr-empty-title', title), el('p', 'wr-empty-body', body));
  return box;
}

/** Section label with a count, and an optional trailing action. */
export function sectionHead(title, count, action = null) {
  const row = el('div', 'wr-section-row');
  const h = el('h3', 'wr-section', title);
  if (count != null) h.append(el('span', 'wr-count tnum', String(count)));
  row.append(h);
  if (action) row.append(action);
  return row;
}
/** One facts line, as the Blocks list writes it: parts joined by " · ", each kept whole, a line only breaking after a dot. */
export function factsLine(parts) {
  const nodes = parts.filter(Boolean).map(part => (typeof part === 'string' ? el('span', '', part) : part));
  return nodes.flatMap((node, i) => (i < nodes.length - 1 ? [node, '\u00a0· '] : [node]));
}
/** The deadline in the words every card uses ("Due tomorrow 11:00 PM"), in medium weight; error colour once past. */
export function dueFact(value, now) {
  const info = value && dueInfo(value, now);
  return info ? el('b', 'wr-due-text' + (info.overdue ? ' overdue' : ''), info.label) : null;
}
/** "★ 3 h 50 min": the open Must time with the star as its legend; `none` words it when there is no Must. */
export function mustFact(minutes, none = '') {
  if (!minutes) return none ? el('span', '', none) : null;
  const node = el('span', 'wr-must-fact');
  node.append(Object.assign(icon('star', true), {className: 'ms fill must'}), duration(minutes));
  node.setAttribute('aria-label', `${duration(minutes)} of Must`);
  return node;
}
export function textField(label, placeholder, value, key, onInput) {
  const wrap = el('label', 'wr-field');
  wrap.append(el('span', 'wr-field-label', label));
  const input = el('input', 'wr-input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = placeholder;
  input.value = value;
  input.dataset.key = key;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input);
  return wrap;
}
/** A Result's deadline in the words its card uses ("Due tomorrow 11:00 PM", "Overdue since …"). */
export const dueWords = (value, now) => dueInfo(value, now).label;
