/**
 * Draws the timeline (spine-model.mjs): the gutter times, the rail with one marker per row (the ring for what can be
 * done or logged, a small icon disc for events and deadlines) over a tone bar as long as the item, and the words.
 * The time shows only in the gutter; the words carry the title and one quiet line.
 */
import {el, icon, button, iconButton} from './dom.mjs';

function gutter(row) {
  const node = el('div', 'spine-gutter tnum');
  node.setAttribute('aria-hidden', 'true');
  if (row.kind === 'gap') return node;
  node.append(el('span', 'spine-time', row.gutter?.time ?? row.time ?? ''));
  if (row.gutter?.end) node.append(el('span', 'spine-time', row.gutter.end));
  return node;
}

function shell(row, body) {
  const node = el('div', `spine-row spine-${row.kind}`);
  node.dataset.key = row.key;
  for (const flag of ['past', 'current', 'next', 'done', 'missed', 'overdue']) node.classList.toggle(flag, !!row[flag]);
  node.classList.toggle('tall', (row.height ?? 0) > 48);
  if (row.kind === 'task') node.dataset.tone = row.tone;
  if (row.height) node.style.setProperty('--h', row.height + 'px');
  node.append(gutter(row), body);
  return node;
}

/** The tone bar on the rail; its height follows the item's length. A moment (meal, deadline) has none. */
function pill(row) {
  const node = el('span', 'spine-pill');
  node.setAttribute('aria-hidden', 'true');
  node.classList.toggle('moment', !row.minutes);
  return node;
}

/** The marker for a row with nothing to tick: a small disc with the event or deadline icon. */
function disc(row) {
  const node = el('span', 'spine-disc');
  node.setAttribute('aria-hidden', 'true');
  node.append(icon(row.symbol, {fill: row.kind === 'deadline'}));
  return node;
}

function ring(label, done, onClick, role = 'checkbox') {
  const node = button('', onClick, 'spine-check');
  if (role === 'checkbox') {
    node.setAttribute('role', 'checkbox');
    node.setAttribute('aria-checked', String(done));
  }
  node.setAttribute('aria-label', label);
  const mark = el('span', 'check-ring');
  mark.append(icon('check'));
  node.append(mark);
  return node;
}

/** A plain clock time is already in the gutter; only a countdown or a lateness earns words. */
const LOUD_WHEN = new Set(['soon', 'now', 'late', 'due']);
/** "Not logged" on every meal says nothing the empty ring does not; it stays in the spoken name. */
const QUIET_LINE = new Set(['unlogged']);

function words(row) {
  const copy = el('span', 'spine-copy');
  const title = el('span', 'spine-title', row.title);
  if (row.must) title.append(icon('star', {fill: true, cls: 'spine-must'}));
  copy.append(title);
  const parts = [];
  if (row.when && LOUD_WHEN.has(row.when.kind)) parts.push(el('span', `spine-when tnum when-${row.when.kind}`, row.when.text));
  if (row.line && !QUIET_LINE.has(row.line.kind)) parts.push(el('span', `spine-line line-${row.line.kind}`, row.line.text));
  if (parts.length) {
    const line = el('span', 'spine-meta');
    parts.forEach((part, i) => line.append(...(i ? [' · ', part] : [part])));
    copy.append(line);
  }
  return copy;
}

const spoken = row => [row.title, row.when?.text, row.line?.text, row.done ? 'done' : '', row.must ? 'Must' : '']
  .filter(Boolean).join(', ');

function card(row, marker, ...parts) {
  const node = el('article', 'spine-card');
  node.append(pill(row), marker, ...parts);
  return node;
}

function opener(row, onClick, label) {
  const open = button('', onClick, 'spine-open');
  open.setAttribute('aria-label', label);
  open.append(words(row));
  return open;
}

function taskCard(row, on) {
  const node = card(row, ring(`${row.title}, ${row.done ? 'done' : 'not done'}`, row.done, () => on.toggleTask(row)),
    opener(row, () => on.openTask(row.task), spoken(row) + '. Open task'));
  if (row.line?.kind === 'clash') {
    const resolve = button('Resolve', () => on.resolve(row), 'text-btn spine-resolve');
    resolve.setAttribute('aria-label', `Resolve the clash with ${row.line.with.title}`);
    node.append(resolve);
  }
  if (!row.done) on.gestures?.(node, row);
  if (!row.done && row.start != null) on.drag?.(node, row);
  return node;
}

function eventCard(row, on) {
  return card(row, disc(row), opener(row, () => on.openEvent(row.event), `${spoken(row)}, calendar event`));
}

function routineCard(row, on) {
  const node = card(row, ring(`${row.title}, ${row.done ? 'done' : 'mark every step done'}`, row.done, () => on.toggleRoutine(row)),
    opener(row, () => on.openRoutine(row.routine.id), `${spoken(row)}. Open routine`));
  on.holdHabit?.(node, row.routine.id);
  return node;
}

function mealCard(row, on) {
  const open = () => on.openMeal(row);
  const name = row.title.toLowerCase();
  const node = card(row, row.meal ? ring(`${row.title} logged`, true, open, 'button') : ring(`Log ${name}`, false, open, 'button'),
    opener(row, open, `${row.title}, ${row.when.text}, ${row.line.text}. ${row.meal ? 'Edit meal' : 'Log ' + name}`));
  on.holdHabit?.(node, `meal:${row.slot}`, row.meal ? {} : {right: {kind: 'log', run: () => on.logMealNow(row)}});
  return node;
}

function deadlineCard(row) {
  const node = card(row, disc(row), words(row));
  node.setAttribute('aria-label', `${row.when.text} ${row.gutter.time}, ${row.title}`);
  return node;
}

function gapBody(row, on) {
  const body = el('div', 'spine-free');
  body.append(el('span', 'spine-free-label tnum', row.label));
  if (row.plan != null) body.append(iconButton('add', `Plan something in ${row.label.replace('free', 'of free time')}`, () => on.plan(row), {cls: 'spine-action'}));
  return body;
}

const BODIES = {task: taskCard, event: eventCard, routine: routineCard, meal: mealCard, deadline: deadlineCard, gap: gapBody};

export function spineRow(row, on) {
  if (row.kind === 'now') {
    const node = el('div', 'spine-row spine-now');
    node.dataset.key = row.key;
    const time = el('span', 'spine-gutter tnum', row.label);
    time.setAttribute('aria-hidden', 'true');
    node.append(time, el('span', 'spine-now-line'));
    node.setAttribute('role', 'separator');
    node.setAttribute('aria-label', 'Now, ' + row.label);
    return node;
  }
  return shell(row, BODIES[row.kind](row, on));
}

export function spineList(model, on) {
  const list = el('div', 'spine');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'The day by time');
  for (const row of model.rows) {
    const node = spineRow(row, on);
    node.setAttribute('role', node.getAttribute('role') ?? 'listitem');
    list.append(node);
  }
  return list;
}

/** The anytime tasks as one strip of chips; a chip opens its task. */
export function anytimeChips(tasks, on) {
  return tasks.map(task => {
    const chip = button('', () => on.openTask(task.task), 'spine-chip');
    chip.dataset.key = task.key;
    chip.dataset.tone = task.tone;
    chip.classList.toggle('done', task.done);
    chip.append(icon(task.symbol, {fill: true}), el('span', 'chip-label', task.title));
    chip.setAttribute('aria-label', `${task.title}${task.must ? ', Must' : ''}${task.done ? ', done' : ''}. Open task`);
    return chip;
  });
}
