/** Draws the "Day" model (day-model.mjs): the hour rail, every item to scale, the now line and the free gap at now. */
import {el, icon, button} from './dom.mjs';

const place = (node, item) => {
  node.style.setProperty('--y', item.y + 'px');
  if (item.h != null) node.style.setProperty('--h', item.h + 'px');
  if (item.lane != null) {
    node.style.setProperty('--lane', String(item.lane));
    node.style.setProperty('--lanes', String(item.lanes));
  }
  node.classList.toggle('after-insert', !!item.afterInsert);
  return node;
};

function checkButton(task, on) {
  const check = button('', () => on.toggleTask(task), 'day-check');
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(!!task.done));
  check.setAttribute('aria-label', `${task.title}, ${task.done ? 'done' : 'not done'}`);
  const ring = el('span', 'check-ring');
  ring.append(icon('check'));
  check.append(ring);
  return check;
}

function taskCard(item, on) {
  const node = el('article', 'day-item day-task');
  for (const flag of ['past', 'overdue', 'done', 'clash']) node.classList.toggle(flag, !!item[flag]);
  node.classList.toggle('do-next', !!item.flag);
  node.dataset.tone = item.task.tone ?? 'neutral';
  const open = button('', () => on.openTask(item.task), 'day-open');
  open.setAttribute('aria-label', item.label);
  if (item.flag) open.append(el('span', 'day-flag flag-next', item.flag));
  const meta = el('span', 'day-meta tnum');
  if (item.overdue) meta.append(el('span', 'day-late', 'Not done'), item.meta.slice('Not done'.length));
  else meta.textContent = item.meta;
  open.append(el('span', 'day-title', item.task.title), meta);
  if (item.clash) {
    const line = el('div', 'day-clash-line');
    const resolve = button('Resolve', () => on.resolve(item), 'text-btn day-resolve');
    resolve.setAttribute('aria-label', `Resolve the clash with ${item.clash}`);
    line.append(el('span', 'flag-clash', 'Clash'), resolve);
    node.append(line);
  }
  node.append(checkButton(item.task, on), open);
  return node;
}

function eventCard(item, on) {
  const node = button('', () => on.openEvent(item.event), 'day-item day-event');
  node.classList.toggle('past', item.past);
  const {time} = item;
  node.append(el('span', 'day-title', item.event.title), el('span', 'day-meta tnum', time));
  node.setAttribute('aria-label', `${item.event.title}, ${time}, calendar event${item.past ? ', ended' : ''}`);
  return node;
}

function routineCard(item, on) {
  const {routine} = item;
  const node = button('', () => on.openRoutine(routine.id), 'day-item day-routine');
  node.classList.toggle('past', item.past);
  node.classList.toggle('missed', !!item.missed);
  const head = el('span', 'day-routine-head');
  head.append(icon('checklist', {fill: routine.state === 'done', cls: 'day-icon'}), el('span', 'day-title', routine.name));
  const {done, total} = routine.progress;
  const bar = el('span', 'day-progress');
  bar.style.setProperty('--value', String(total ? done / total : 0));
  node.append(head, el('span', 'day-meta tnum', `${item.time} · ${item.meta}`), bar);
  node.setAttribute('aria-label', `${routine.name}, ${item.time}, ${item.meta}. Open routine`);
  return node;
}

function rowItem(cls, symbol, words, open, action) {
  const node = el('div', 'day-item ' + cls);
  const main = button('', open, 'day-open');
  main.append(icon(symbol, {cls: 'day-icon'}), ...words);
  node.append(main);
  if (action) node.append(button(action.label, action.onClick, 'text-btn day-action'));
  return node;
}

function markerItem(item, on) {
  if (item.kind === 'water') {
    const node = rowItem('day-water', 'water_drop', [el('span', 'day-label tnum', item.label)], on.openWater,
      {label: 'Drank it', onClick: on.drink});
    node.querySelector('.day-action').setAttribute('aria-label', 'Drank a glass of water');
    return node;
  }
  if (item.kind === 'meal') {
    const words = [el('span', 'day-label', item.label)];
    if (item.time) words.push(el('span', 'day-time tnum', item.time));
    const node = rowItem('day-meal', 'restaurant', words, () => on.openMeal(item),
      item.meal ? null : {label: 'Log it', onClick: () => on.openMeal(item)});
    node.classList.toggle('past', item.past);
    node.classList.toggle('unlogged', !item.meal);
    return node;
  }
  const node = el('div', 'day-item day-deadline');
  node.classList.toggle('overdue', item.overdue);
  node.append(icon('hourglass_bottom', {cls: 'day-icon'}), el('span', 'day-label tnum', item.label));
  return node;
}

function gapBlock(insert, on) {
  const node = el('section', 'day-gap');
  node.setAttribute('aria-label', insert.header);
  node.style.setProperty('--y', insert.y + 'px');
  node.append(el('h3', 'day-gap-head tnum', insert.header));
  for (const task of insert.rows) node.append(taskRow(task, on));
  if (insert.words) {
    const plan = button(insert.words, () => on.schedule(insert.slots), 'filled-btn day-schedule');
    plan.setAttribute('aria-label', `${insert.words}: ${insert.slots.map(s => s.task.title).join(' and ')}`);
    node.append(plan);
  }
  return node;
}

/** A row for a task with no time: the check, the title, its Result. */
export function taskRow(task, on) {
  const row = el('div', 'day-row');
  row.classList.toggle('done', !!task.done);
  const open = button('', () => on.openTask(task), 'day-row-open');
  const meta = [task.minutes ? `${task.minutes} min` : '', task.result ?? 'No block'].filter(Boolean).join(' · ');
  open.append(el('span', 'day-title', task.title), el('span', 'day-meta tnum', meta));
  open.setAttribute('aria-label', `${task.title}, ${meta}, no time set`);
  row.append(checkButton(task, on), open);
  return row;
}

let sizer = null;

/** The canvas. The gap block's own height pushes everything after now down (`--insert`), so nothing sits under it. */
export function dayCanvas(model, on) {
  const canvas = el('div', 'day-canvas');
  canvas.style.setProperty('--timeline-height', model.height + (model.allDone ? 40 : 0) + 'px');
  for (const line of model.lines) {
    const node = place(el('div', 'hour-line'), line);
    const label = el('span', 'hour-label tnum', line.label);
    label.hidden = line.hidden;
    label.setAttribute('aria-hidden', 'true');
    node.append(label);
    canvas.append(node);
  }
  for (const fold of model.folds) {
    const node = place(el('div', 'timeline-fold'), fold);
    node.append(icon('unfold_more'), el('span', '', fold.label));
    canvas.append(node);
  }
  for (const dot of model.dots) {
    const node = place(el('span', 'rail-dot ' + dot.kind), dot);
    node.setAttribute('aria-hidden', 'true');
    canvas.append(node);
  }
  for (const item of model.items.filter(i => !i.hidden)) {
    const draw = {task: taskCard, event: eventCard, routine: routineCard}[item.kind] ?? markerItem;
    canvas.append(place(draw(item, on), item));
  }
  for (const group of model.more) {
    const chip = place(button(group.label, () => on.more(group), 'day-more'), {...group, lane: 1, lanes: 2});
    chip.setAttribute('aria-label', `${group.count} more at this time. Open the list`);
    canvas.append(chip);
  }
  const now = place(el('div', 'now-line day-now'), model.now);
  now.setAttribute('role', 'separator');
  now.setAttribute('aria-label', 'Now, ' + model.now.label);
  const time = el('span', 'day-now-time tnum', model.now.time);
  time.setAttribute('aria-hidden', 'true');
  now.append(el('span', 'now-dot'), time);
  canvas.append(now);
  if (model.allDone) canvas.append(place(el('p', 'day-all-done', 'Everything planned is done'), model.allDone));
  sizer?.disconnect();
  sizer = null;
  if (model.insert) {
    const block = gapBlock(model.insert, on);
    canvas.append(block);
    sizer = new ResizeObserver(() => canvas.style.setProperty('--insert', block.offsetHeight + 16 + 'px'));
    sizer.observe(block);
  }
  return canvas;
}

/** Drop a card's facts line, then its title's second line, when its words don't fit its height. */
export function fitCards(canvas) {
  for (const card of canvas.querySelectorAll('.day-item')) {
    const meta = card.querySelector('.day-meta');
    if (!meta) continue;
    const box = card.querySelector('.day-open') ?? card, title = box.querySelector('.day-title');
    const over = () => box.scrollHeight > box.clientHeight + 1;
    meta.hidden = false;
    title?.style.removeProperty('--title-lines');
    meta.hidden = over();
    if (title && over()) title.style.setProperty('--title-lines', '1');
  }
}
