/** Draws the timeline (spine-model.mjs): the gutter times, the rail with each row's pill, the words, and the ring. */
import {el, icon, button, iconButton} from './dom.mjs';

function gutter(row) {
  const node = el('div', 'spine-gutter tnum');
  node.setAttribute('aria-hidden', 'true');
  if (row.kind === 'gap') return node;
  node.append(el('span', 'spine-time', row.sameTime ? '' : row.gutter?.time ?? row.time ?? ''));
  if (row.gutter?.end) node.append(el('span', 'spine-time', row.gutter.end));
  return node;
}

/** On the wide clock grid (day-grid.mjs) a row sits at its time, in its lane. */
function place(node, row) {
  if (row.top == null) return;
  node.style.setProperty('--top', row.top + 'px');
  node.style.setProperty('--lane', String(row.lane ?? 0));
  node.style.setProperty('--lanes', String(row.lanes ?? 1));
  node.classList.toggle('short', (row.height ?? 0) < 40);
}

function shell(row, body) {
  const node = el('div', `spine-row spine-${row.kind}`);
  node.dataset.key = row.key;
  for (const flag of ['past', 'current', 'next', 'done', 'missed', 'overdue']) node.classList.toggle(flag, !!row[flag]);
  node.classList.toggle('tall', (row.height ?? 0) > 48);
  if (row.kind === 'task') node.dataset.tone = row.tone;
  if (row.height) node.style.setProperty('--h', row.height + 'px');
  place(node, row);
  node.append(gutter(row), body);
  return node;
}

/** The coloured capsule on the rail; its height follows the item's length. */
function pill(row) {
  const node = el('span', 'spine-pill');
  node.setAttribute('aria-hidden', 'true');
  node.append(icon(row.symbol, {fill: true}));
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

function words(row) {
  const copy = el('span', 'spine-copy');
  if (row.when) copy.append(el('span', `spine-when tnum when-${row.when.kind}`, row.when.text));
  const title = el('span', 'spine-title', row.title);
  if (row.must) title.append(icon('star', {fill: true, cls: 'spine-must'}));
  copy.append(title);
  if (row.line) copy.append(el('span', `spine-line line-${row.line.kind}`, row.line.text));
  return copy;
}

const spoken = row => [row.title, row.when?.text, row.line?.text, row.done ? 'done' : '', row.must ? 'Must' : '']
  .filter(Boolean).join(', ');

function card(row, ...parts) {
  const node = el('article', 'spine-card');
  node.append(pill(row), ...parts);
  return node;
}

function opener(row, onClick, label) {
  const open = button('', onClick, 'spine-open');
  open.setAttribute('aria-label', label);
  open.append(words(row));
  return open;
}

function taskCard(row, on) {
  const node = card(row, opener(row, () => on.openTask(row.task), spoken(row) + '. Open task'),
    ring(`${row.title}, ${row.done ? 'done' : 'not done'}`, row.done, () => on.toggleTask(row)));
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
  return card(row, opener(row, () => on.openEvent(row.event), `${spoken(row)}, calendar event`));
}

function routineCard(row, on) {
  const node = card(row, opener(row, () => on.openRoutine(row.routine.id), `${spoken(row)}. Open routine`),
    ring(`${row.title}, ${row.done ? 'done' : 'mark every step done'}`, row.done, () => on.toggleRoutine(row)));
  on.holdHabit?.(node, row.routine.id);
  return node;
}

function mealCard(row, on) {
  const open = () => on.openMeal(row);
  const name = row.title.toLowerCase();
  const node = card(row, opener(row, open, `${row.title}, ${row.when.text}, ${row.line.text}. ${row.meal ? 'Edit meal' : 'Log ' + name}`),
    row.meal ? ring(`${row.title} logged`, true, open, 'button') : ring(`Log ${name}`, false, open, 'button'));
  on.holdHabit?.(node, `meal:${row.slot}`, row.meal ? {} : {right: {kind: 'log', run: () => on.logMealNow(row)}});
  return node;
}

function deadlineCard(row) {
  const node = card(row, words(row));
  node.setAttribute('aria-label', `${row.when.text}, ${row.title}`);
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
    place(node, row);
    return node;
  }
  return shell(row, BODIES[row.kind](row, on));
}

export function spineList(model, on) {
  const list = el('div', 'spine');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'The day by time');
  if (model.grid) {
    list.classList.add('grid');
    list.style.setProperty('--span', model.grid.span + 'px');
    list.style.setProperty('--hour', model.grid.hour + 'px');
    for (const hour of model.grid.hours) {
      const line = el('span', 'spine-hour tnum', hour.label);
      line.setAttribute('aria-hidden', 'true');
      line.style.setProperty('--top', hour.top + 'px');
      list.append(line);
    }
  }
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
