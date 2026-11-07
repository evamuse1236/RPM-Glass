/**
 * Draws the timeline (spine-model.mjs): the gutter times, the rail with one marker per row (the ring for what can be
 * done or logged, a small icon disc for events and deadlines) over a tone bar as long as the item, and the words.
 * The time shows only in the gutter; the words carry the title and one quiet line.
 */
import {el, icon, button, iconButton} from './dom.mjs';
import {owedRows, owedLabel, doneLabel, doneSpoken} from '../spine-model.mjs';

/** The still-to-do group shows this many rows, then "+N more". */
export const OWED_CAP = 3;

function gutter(row) {
  const node = el('div', 'spine-gutter tnum');
  node.setAttribute('aria-hidden', 'true');
  if (row.kind === 'gap') return node;
  if (row.anytime) {
    if (row.first) node.append(el('span', 'spine-time spine-anytime', 'Any time'));
    return node;
  }
  node.append(el('span', 'spine-time', row.gutter?.time ?? row.time ?? ''));
  if (row.gutter?.end) node.append(el('span', 'spine-time spine-end', row.gutter.end));
  return node;
}

function shell(row, body) {
  const node = el('div', `spine-row spine-${row.kind}`);
  node.dataset.key = row.key;
  for (const flag of ['past', 'current', 'next', 'done', 'missed', 'overdue', 'late']) node.classList.toggle(flag, !!row[flag]);
  node.classList.toggle('tall', (row.height ?? 0) > 48);
  node.classList.toggle('owed', row.fold === 'missed');
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
const LOUD_WHEN = new Set(['soon', 'now', 'late']);
/**
 * "Not logged" on every meal says nothing the empty ring does not; it stays in the spoken name. A clash is its own small
 * marker under the words that opens Resolve.
 */
const QUIET_LINE = new Set(['unlogged', 'clash']);

function words(row) {
  const copy = el('span', 'spine-copy');
  const title = el('span', 'spine-title', row.title);
  if (row.must) title.append(icon('star', {fill: true, cls: 'spine-must'}));
  copy.append(title);
  const parts = [];
  if (row.when && LOUD_WHEN.has(row.when.kind)) parts.push(el('span', `spine-when tnum when-${row.when.kind}`, row.when.text));
  if (row.line && !QUIET_LINE.has(row.line.kind)) {
    const line = el('span', `spine-line line-${row.line.kind}`, row.line.text);
    if (row.line.kind === 'due') line.prepend(icon('hourglass_bottom', {fill: true, cls: 'spine-due'}));
    parts.push(line);
  }
  if (parts.length) {
    const line = el('span', 'spine-meta');
    parts.forEach((part, i) => line.append(...(i ? [' · ', part] : [part])));
    copy.append(line);
  }
  return copy;
}

const spoken = row => [row.title, row.when?.text, row.line?.kind === 'due' ? `due today, ${row.line.text}` : row.line?.text,
  row.done ? 'done' : '', row.must ? 'Must' : '']
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
    const resolve = button('', () => on.resolve(row), 'spine-resolve');
    resolve.append(icon('event_busy'), el('span', '', row.line.text));
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

/** Free time is space on the rail; it gets words only where its + offers to plan something in it. */
function gapBody(row, on) {
  const body = el('div', 'spine-free');
  if (row.plan == null) return body;
  body.append(el('span', 'spine-free-label tnum', row.label));
  body.append(iconButton('add', `Plan something in ${row.label.replace('free', 'of free time')}`, () => on.plan(row), {cls: 'spine-action'}));
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

const listItem = node => {
  node.setAttribute('role', node.getAttribute('role') ?? 'listitem');
  return node;
};

/** The current item's thin progress line: how much of it has gone. */
function progress(row, now) {
  const bar = el('span', 'spine-progress');
  bar.setAttribute('aria-hidden', 'true');
  bar.style.setProperty('--p', String(Math.min(1, Math.max(0, (now - row.start) / (row.end - row.start)))));
  return bar;
}

/** One row of the Now card: the same row as on the timeline, with a progress line while it runs. */
export function focusRow(row, on, now) {
  const node = listItem(spineRow(row, on));
  if (row.current) node.querySelector('.spine-card')?.append(progress(row, now));
  return node;
}

/** The Any time rows under the timeline; only the first says "Any time". */
export const anytimeRows = model => model.anytime.map((row, i) => ({...row, anytime: true, first: i === 0}));

/** The Now card's one row. */
export const focusOf = model => model.rows.find(r => r.focus);

/** The Now card at the top of a live day: the item in progress, else the next timed one. One item, or no card. */
export function focusCard(model, on) {
  const row = focusOf(model);
  if (!row) return null;
  const card = el('section', 'spine-focus');
  card.dataset.key = 'focus';
  card.setAttribute('role', 'list');
  card.setAttribute('aria-label', row.current ? 'Now' : 'Next');
  card.append(focusRow(row, on, model.now));
  return card;
}

/** A quiet text line on the rail that opens or folds rows in place: "Show 3 done", "+2 more". */
function toggleLine(key, label, spokenLabel, open, on) {
  const node = el('div', `spine-row spine-fold spine-fold-${key}`);
  node.dataset.key = key;
  const toggle = button('', () => on.toggleFold?.(key), 'spine-fold-open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', spokenLabel);
  toggle.append(el('span', 'spine-fold-label tnum', label));
  node.append(el('span', 'spine-gutter'), toggle);
  return node;
}

/** "Show 3 done": the finished past, drawn hidden in time order so it opens in place. */
export const foldToggle = (rows, open, on) => toggleLine('earlier', doneLabel(rows, open), doneSpoken(rows, open), open, on);

/** "+2 more" under the still-to-do group's first rows. */
export const moreToggle = (owed, open, on) => {
  const label = open ? 'Show fewer' : `+${owed.length - OWED_CAP} more`;
  return toggleLine('owed-more', label, open ? 'Show fewer still to do' : `${owed.length - OWED_CAP} more still to do`, open, on);
};

/** The group's header: "Still to do · 4". */
function owedHead(owed) {
  const node = el('div', 'spine-owed-head');
  node.dataset.key = 'owed';
  node.setAttribute('role', 'heading');
  node.setAttribute('aria-level', '2');
  node.setAttribute('aria-label', `Still to do from earlier, ${owed.length}`);
  const hint = el('span', 'spine-owed-hint', 'Swipe left to plan');
  hint.setAttribute('aria-hidden', 'true');
  node.append(el('span', 'spine-owed-label', owedLabel(owed)), hint);
  return node;
}

/**
 * The timeline. On a live day it opens with what is still owed from earlier ("Still to do · 4": Musts first, at most
 * three rows, then "+N more"), then one "Show N done" line that opens the finished past in place, then the rest with
 * the Now line, leaving out what the Now card shows; then the tasks with no time, under "Any time". The Now line already
 * spaces the rail, so blank free time right after it, or after another blank stretch, is left out.
 */
export function spineList(model, on, {open = {}} = {}) {
  const list = el('div', 'spine');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'The day by time');
  const owed = owedRows(model.rows);
  if (owed.length) {
    list.append(listItem(owedHead(owed)));
    owed.forEach((row, i) => {
      const node = listItem(spineRow(row, on));
      if (i >= OWED_CAP) node.hidden = !open.owed;
      list.append(node);
    });
    if (owed.length > OWED_CAP) list.append(listItem(moreToggle(owed, !!open.owed, on)));
  }
  const past = model.rows.filter(r => r.fold === 'earlier');
  if (past.some(r => r.kind !== 'gap')) list.append(listItem(foldToggle(past, !!open.earlier, on)));
  let spacer = false;
  for (const row of model.rows) {
    if (row.focus || row.fold === 'missed') continue;
    const folded = row.fold === 'earlier';
    const blank = row.kind === 'gap' && row.plan == null;
    if (blank && spacer && !folded) continue;
    if (!folded || open.earlier) spacer = blank || row.kind === 'now';
    const node = listItem(spineRow(row, on));
    if (folded) node.hidden = !open.earlier;
    list.append(node);
  }
  anytimeRows(model).forEach(row => list.append(listItem(spineRow(row, on))));
  return list;
}
