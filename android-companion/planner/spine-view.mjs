/** Draws the spine (spine-model.mjs): the gutter times, the line with its dots, and one row per item, gap or now. */
import {el, icon, button, iconButton} from './dom.mjs';

function gutter(row) {
  const node = el('div', 'spine-gutter tnum');
  node.setAttribute('aria-hidden', 'true');
  node.append(el('span', 'spine-time', row.sameTime ? '' : row.gutter?.time ?? row.time ?? ''));
  if (row.gutter?.length) node.append(el('span', 'spine-length', row.gutter.length.replaceAll(' ', ' ')));
  return node;
}

function shell(row, body) {
  const node = el('div', `spine-row spine-${row.kind}`);
  node.dataset.key = row.key;
  for (const flag of ['past', 'current', 'next', 'done', 'missed']) node.classList.toggle(flag, !!row[flag]);
  if (row.height) node.style.setProperty('--h', row.height + 'px');
  const dot = el('span', 'spine-dot');
  dot.setAttribute('aria-hidden', 'true');
  node.append(gutter(row), dot, body);
  return node;
}

function check(label, done, onClick) {
  const node = button('', onClick, 'spine-check');
  node.setAttribute('role', 'checkbox');
  node.setAttribute('aria-checked', String(done));
  node.setAttribute('aria-label', label);
  const ring = el('span', 'check-ring');
  ring.append(icon('check'));
  node.append(ring);
  return node;
}

function line(row) {
  if (!row.line) return null;
  const node = el('span', `spine-line line-${row.line.kind}`);
  if (row.line.kind === 'result') {
    const dot = el('span', 'area-dot');
    dot.dataset.tone = row.line.tone;
    node.append(dot);
  }
  node.append(el('span', 'spine-line-text', row.line.text));
  return node;
}

function elapsedBar(row) {
  const {fraction, in: inside, left} = row.elapsed;
  const node = el('div', 'spine-elapsed tnum');
  const track = el('span', 'spine-bar');
  track.style.setProperty('--value', String(fraction));
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', `${inside}, ${left}`);
  track.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  node.append(track, el('span', 'spine-in', inside), el('span', 'spine-left', left));
  return node;
}

function words(row) {
  const copy = el('span', 'spine-copy');
  copy.append(el('span', 'spine-title', row.title));
  const supporting = line(row);
  if (supporting) copy.append(supporting);
  return copy;
}

const spoken = row => [row.title, row.gutter.time, row.gutter.length, row.line?.text,
  row.done ? 'done' : '', row.must ? 'Must' : ''].filter(Boolean).join(', ');

function taskCard(row, on) {
  const card = el('article', 'spine-card filled');
  const open = button('', () => on.openTask(row.task), 'spine-open');
  open.setAttribute('aria-label', spoken(row) + '. Open task');
  open.append(words(row));
  card.append(check(`${row.title}, ${row.done ? 'done' : 'not done'}`, row.done, () => on.toggleTask(row)), open);
  if (row.must) card.append(icon('star', {fill: true, cls: 'spine-must'}));
  if (row.line?.kind === 'clash') {
    const resolve = button('Resolve', () => on.resolve(row), 'text-btn spine-resolve');
    resolve.setAttribute('aria-label', `Resolve the clash with ${row.line.with.title}`);
    card.append(resolve);
  }
  if (row.elapsed) card.append(elapsedBar(row));
  if (!row.done) on.gestures?.(card, row);
  return card;
}

function eventCard(row, on) {
  const card = button('', () => on.openEvent(row.event), 'spine-card outlined');
  card.append(icon('event', {cls: 'spine-icon'}), words(row));
  card.setAttribute('aria-label', `${spoken(row)}, calendar event`);
  if (row.elapsed) card.append(elapsedBar(row));
  return card;
}

function routineCard(row, on) {
  const card = el('article', 'spine-card filled');
  const open = button('', () => on.openRoutine(row.routine.id), 'spine-open');
  open.setAttribute('aria-label', `${spoken(row)}. Open routine`);
  open.append(words(row));
  const {done, total} = row.progress;
  const bar = el('span', 'spine-bar spine-steps');
  bar.style.setProperty('--value', String(total ? done / total : 0));
  bar.setAttribute('aria-hidden', 'true');
  card.append(check(`${row.title}, ${row.done ? 'done' : 'mark every step done'}`, row.done, () => on.toggleRoutine(row)), open, bar);
  return card;
}

function smallRow(row, symbol, open, action) {
  const body = el('div', 'spine-small');
  const main = button('', open, 'spine-open');
  main.append(icon(symbol, {fill: row.kind === 'water', cls: 'spine-icon'}), el('span', 'spine-label', row.label));
  body.append(main);
  if (action) body.append(action);
  return body;
}

function waterBody(row, on) {
  const add = iconButton('add', 'Log a glass of water', on.drink, {cls: 'spine-action'});
  const body = smallRow(row, 'water_drop', on.openWater, add);
  body.firstChild.setAttribute('aria-label', `${row.label}${row.due ? ', a glass is due' : ''}. Open water`);
  return body;
}

function mealBody(row, on) {
  const open = () => on.openMeal(row);
  const action = row.meal ? null : button('Log it', open, 'text-btn spine-action');
  action?.setAttribute('aria-label', `Log ${row.label.split(' · ')[0].toLowerCase()}`);
  return smallRow(row, 'restaurant', open, action);
}

function deadlineBody(row) {
  const body = el('div', 'spine-small');
  body.classList.toggle('overdue', row.overdue);
  body.append(icon('hourglass_bottom', {cls: 'spine-icon'}), el('span', 'spine-label', row.label));
  return body;
}

function gapBody(row, on) {
  const body = el('div', 'spine-free');
  body.append(el('span', 'spine-label tnum', row.label));
  if (row.plan != null) body.append(iconButton('add', `Plan something in ${row.label.replace('free', 'of free time')}`, () => on.plan(row), {cls: 'spine-action'}));
  return body;
}

function ticks(row, node) {
  for (const at of row.ticks) {
    const tick = el('span', 'spine-tick');
    tick.style.setProperty('--at', String(at));
    tick.setAttribute('aria-hidden', 'true');
    node.append(tick);
  }
  return node;
}

const BODIES = {task: taskCard, event: eventCard, routine: routineCard, water: waterBody, meal: mealBody, deadline: deadlineBody, gap: gapBody};

export function spineRow(row, on) {
  if (row.kind === 'now') {
    const node = shell(row, el('span', 'spine-now-line'));
    node.setAttribute('role', 'separator');
    node.setAttribute('aria-label', 'Now, ' + row.label);
    return node;
  }
  const node = shell(row, BODIES[row.kind](row, on));
  return row.kind === 'gap' ? ticks(row, node) : node;
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
