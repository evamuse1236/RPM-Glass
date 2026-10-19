import {tasks, conflicts} from '../planner-state.mjs';
import {repeats, nextOccurrence, occurrences} from '../planner-recurrence.mjs';
import {calendarLabel, calendarRisk, calendarRows} from '../planner-calendar.mjs';
import {rankResults} from '../review-state.mjs';
import {el, icon} from './dom.mjs';
import {clock, timeRange, dateText} from './format.mjs';

export const findTask = (app, id) => tasks(app.data()).find(task => task.id === id);
export const NEEDS_TIME = 'A repeating task needs a date and time.';

/** Saves one after another, so a choice made while another save is still in flight is never dropped. */
export function saver(app) {
  let chain = Promise.resolve();
  const idle = async () => { while (app.saving) await new Promise(done => setTimeout(done, 16)); };
  return (op, label) => {
    const run = chain.then(idle).then(() => app.commit(op, {keepSheet: true, label}));
    chain = run.catch(() => {});
    return run.catch(() => undefined);
  };
}

/** A borderless field that grows with its text and saves when it loses focus. */
export function inlineText(host, symbol, label, value, onSave, cls = '') {
  const wrap = el('label', 'detail-row detail-field ' + cls);
  const input = el('textarea');
  input.rows = 1;
  input.placeholder = label;
  input.value = value ?? '';
  input.setAttribute('aria-label', label);
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  };
  input.addEventListener('input', grow);
  requestAnimationFrame(grow);
  input.addEventListener('change', () => onSave(input.value));
  input.grow = grow;
  wrap.append(icon(symbol), input);
  host.append(wrap);
  return input;
}

/** Put a saved value back into a text field, unless the user is typing in it. */
export function syncText(input, value) {
  if (document.activeElement === input || input.value === (value ?? '')) return;
  input.value = value ?? '';
  input.grow?.();
}

/** The Block this task's words point to (the weekly review's suggestion), or null. */
export function suggestBlock(app, task, exclude = null) {
  if (!task?.title?.trim()) return null;
  const candidates = app.activeBlocks().filter(b => b.id !== exclude).map(b => ({...b, blockId: b.id}));
  if (!candidates.length) return null;
  return rankResults(app.data(), task, candidates).suggested;
}

/** Calendar and Plan clashes for a task's time. Never blocks a save: the sheet says it in words. */
export async function scheduleCheck(app, id, fields) {
  const existing = id ? findTask(app, id) : null;
  const candidate = {...existing, ...fields};
  const planned = candidate.planned;
  const minutes = candidate.minutes ?? 30;
  if (!planned) return {clashes: [], risk: null};
  const anchor = repeats(candidate) ? nextOccurrence(candidate) : planned;
  const copy = await app.api.native('calendarRead', {anchor: Date.parse(anchor)});
  app.state.calendar = calendarRows(copy);
  app.state.calendarState = calendarLabel(copy);
  const start = Date.parse(anchor);
  const risk = calendarRisk(copy, start, start + minutes * 60000);
  const window = start + (repeats(candidate) ? 21 * 86400000 : 1);
  const clashes = occurrences(candidate, start, window)
    .flatMap(o => conflicts(app.data(), o.start, minutes, app.state.calendar, id))
    .filter((e, i, all) => all.findIndex(x => x.id === e.id && x.start === e.start) === i);
  return {clashes, risk};
}

export function clashText(clashes) {
  const names = clashes.slice(0, 2).map(c => `${c.title} (${dateText(c.start)}, ${timeRange(c.start, c.end)})`);
  const more = clashes.length > 2 ? ` and ${clashes.length - 2} more` : '';
  return `Clashes with ${names.join(' and ')}${more}`;
}

export function alertText(type, task) {
  const at = task?.planned ? ' at ' + clock(task.planned) : '';
  if (type === 'reminder') return 'Reminder' + at;
  if (type === 'alarm') return 'Ringing alarm' + at;
  return 'No alert';
}

/** A chip's accessible name, with `extra` added while what it shows was read from the typed words. */
export function readLabel(chip, extra) {
  chip.dataset.aria ??= chip.getAttribute('aria-label') ?? '';
  const base = chip.dataset.aria;
  if (extra) chip.setAttribute('aria-label', (base || chip.querySelector('.chip-label')?.textContent || '') + extra);
  else if (base) chip.setAttribute('aria-label', base);
  else chip.removeAttribute('aria-label');
}
