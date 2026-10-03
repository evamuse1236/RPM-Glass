/** Task rows in the style of Google Tasks: circle check, title, supporting time and duration, a star on Musts only. */
import {blockTasks, localDay} from '../planner-state.mjs';
import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {reorderTask} from '../planner-ux.mjs';
import {attachTaskSwipe} from '../task-swipe.mjs';
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button} from './dom.mjs';
import {clock, duration, dayName} from './format.mjs';
export {dayName};

const REPEAT_NAMES = {daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly'};

export function taskWhen(task) {
  if (task.start) return task.start;
  if (task.occurrence) return Date.parse(task.occurrence);
  if (task.planned) return Date.parse(repeats(task) ? nextOccurrence(task) : task.planned);
  return null;
}

export function isOverdue(task, when = taskWhen(task)) {
  if (task.done) return false;
  if (when) return when + (task.minutes ?? 30) * 60000 < Date.now();
  return !!task.plannedDate && task.plannedDate < localDay();
}

/** Supporting line: "Now · 30 min", "Sun 9:00 PM · 20 min", "Overdue · …". Times carry their day unless it is today.
 * Must is the star alone (with its accessible name), never the word as well. */
function supportingLine(task, options) {
  const when = taskWhen(task);
  const line = el('span', 'task-supporting tnum');
  const parts = [];
  const leads = [];
  if (options.current) leads.push(['now', 'Now']);
  else if (isOverdue(task, when)) leads.push(['overdue', 'Overdue']);
  else if (options.next) leads.push(['next', 'Next']);
  leads.forEach(([cls, text], i) => line.append(...(i ? [' · '] : []), el('b', 'lead-' + cls, text)));
  const lead = leads.length > 0;
  const day = when ? dayName(localDay(new Date(when)), {today: options.days})
    : task.plannedDate ? dayName(task.plannedDate, {today: options.days}) : '';
  if (when && !options.current) parts.push([day, clock(when)].filter(Boolean).join(' '));
  else if (day) parts.push(day);
  else if (!when && options.anytime) parts.push('Anytime');
  if (task.minutes != null) parts.push(duration(task.minutes));
  const rule = task.repeatAfterDays ? 'After completion' : REPEAT_NAMES[task.recurrence];
  if (rule) parts.push(rule);
  if (options.context) parts.push(options.context);
  const text = parts.join(' · ');
  if (lead && text) line.append(' · ');
  line.append(text);
  return line;
}

function checkButton(app, task) {
  const label = `Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`;
  const check = button('', () => toggleDone(app, task, task.occurrence), 'task-check');
  check.setAttribute('aria-label', label);
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(!!task.done));
  const ring = el('span', 'check-ring');
  if (task.done) ring.append(icon('check'));
  check.append(ring);
  return check;
}

/** The filled star marks a Must; other rows show nothing there. Must is set from the task sheet, never by a stray tap. */
function mustMark() {
  const star = icon('star', {fill: true, cls: 'must-mark'});
  star.removeAttribute('aria-hidden');
  star.setAttribute('role', 'img');
  star.setAttribute('aria-label', 'Must');
  return star;
}

/**
 * options: current, next, anytime, days (say "Today" too), context (text), plan (true in a Block's Plan),
 * swipe (schedule/delete gestures; on unless false). Open Plan rows reorder by long-press and drag.
 */
export function taskRow(app, task, options = {}) {
  const row = el('div', 'task-row');
  row.classList.toggle('done', !!task.done);
  row.classList.toggle('current', !!options.current);
  row.dataset.taskId = task.id;
  row.append(checkButton(app, task));

  const main = button('', () => app.actions.openTask(task.id, task.occurrence), 'task-main');
  const title = el('span', 'task-title', task.title);
  const line = supportingLine(task, options);
  main.append(title, line);
  const blockTitle = app.context(task).block?.title ?? 'No block';
  main.setAttribute('aria-label', [task.title, line.textContent, 'part of ' + blockTitle,
    task.must ? 'Must' : '', task.done ? 'completed' : ''].filter(Boolean).join(', '));
  row.append(main);

  if (task.must) row.append(mustMark());
  if (options.plan && !task.done) installOrder(app, row, task);
  if (!options.plan && options.swipe !== false && !task.done) attachSwipe(app, row, task);
  return row;
}

/** Swipe right schedules (one-tap date choices anchored to the row); swipe left deletes, with Undo. */
function attachSwipe(app, row, task) {
  row.classList.add('swipe-task');
  attachTaskSwipe(row, {
    schedule: () => app.actions.scheduleTask(task, row),
    remove: () => app.actions.deleteTask(task),
  });
}

const LONG_PRESS = 350;
const SLOP = 8;

/**
 * Where a lifted row lands: it takes a row's slot once its leading edge passes that row's middle (its top going up,
 * its bottom going down), so short and tall rows swap alike. `centers` are the rows' resting centres.
 */
export function dropIndex(centers, from, top, bottom) {
  let to = from;
  for (let i = from + 1; i < centers.length; i++) if (bottom > centers[i]) to = i;
  for (let i = from - 1; i >= 0; i--) if (top < centers[i]) to = i;
  return to;
}

/**
 * Plan order by touch, as in Google Tasks: hold a Plan row still for 350 ms and it lifts; drag it and the rows it
 * passes slide out of its way; let go and it settles into the gap and the order is saved, with Undo. Moving before
 * the hold completes is a scroll and releasing early is a tap, so neither conflicts. Alt or Ctrl with the arrow keys
 * moves a row one step; "Change Plan order" in the task menu stays the accessible path.
 */
function installOrder(app, row, task) {
  let press = null;
  let drag = null;
  let swallowClick = false;
  const scroller = () => app.dom.scroll;
  const cancelPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  const save = targetId => {
    const ids = blockTasks(app.data(), task.blockId).map(t => t.id);
    const next = reorderTask(ids, task.id, targetId);
    if (next.every((id, i) => id === ids[i])) return Promise.resolve();
    return app.commit({type: 'reorder', blockId: task.blockId, ids: next}, {label: 'Plan order changed'});
  };
  const shift = () => {
    const {peers, from, to, gap} = drag;
    peers.forEach((peer, i) => {
      if (peer === row) return;
      const by = from < to && i > from && i <= to ? -gap : to < from && i >= to && i < from ? gap : 0;
      peer.style.setProperty('--shift', by + 'px');
    });
  };
  const follow = clientY => {
    const scrolled = scroller().scrollTop - drag.scroll;
    const dy = clientY - drag.startY + scrolled;
    row.style.setProperty('--drag-y', dy + 'px');
    const to = dropIndex(drag.centers, drag.from, drag.top + dy, drag.top + drag.gap + dy);
    if (to !== drag.to) {
      drag.to = to;
      shift();
    }
  };
  // Near the top or bottom edge of the page, the page scrolls under the lifted row.
  const edgeScroll = () => {
    if (!drag) return;
    const box = scroller().getBoundingClientRect();
    const edge = 64;
    const speed = drag.y > box.bottom - edge ? (drag.y - (box.bottom - edge)) / 4
      : drag.y < box.top + edge ? -((box.top + edge) - drag.y) / 4 : 0;
    if (speed) {
      scroller().scrollTop += speed;
      follow(drag.y);
    }
    drag.frame = requestAnimationFrame(edgeScroll);
  };
  const lift = () => {
    const list = row.parentElement;
    if (!press || !list) return;
    const peers = [...list.querySelectorAll(':scope > .task-row')];
    if (peers.length < 2) { cancelPress(); return; }
    drag = {pointerId: press.id, startY: press.y, y: press.y, peers, from: peers.indexOf(row), scroll: scroller().scrollTop,
      gap: row.offsetHeight, top: row.getBoundingClientRect().top, centers: peers.map(peer => { const r = peer.getBoundingClientRect(); return r.top + r.height / 2; })};
    drag.to = drag.from;
    press = null;
    swallowClick = true;
    try { row.setPointerCapture(drag.pointerId); } catch {}
    list.classList.add('sorting');
    row.classList.add('lifted');
    row.style.setProperty('--drag-y', '0px');
    app.api.native('haptic').catch(() => {});
    drag.frame = requestAnimationFrame(edgeScroll);
  };
  const reset = list => {
    row.classList.remove('lifted', 'settling');
    row.style.removeProperty('--drag-y');
    list?.classList.remove('sorting');
    list?.querySelectorAll(':scope > .task-row').forEach(peer => peer.style.removeProperty('--shift'));
  };
  const drop = keep => {
    if (!drag) return;
    const {peers, from, to, frame} = drag;
    cancelAnimationFrame(frame);
    drag = null;
    const list = row.parentElement;
    const moved = keep && to !== from;
    // Settle into the gap: the slot is the sum of the heights of the rows it passed.
    const span = moved ? peers.slice(Math.min(from, to) + (to > from ? 1 : 0), Math.max(from, to) + (to > from ? 1 : 0))
      .reduce((sum, peer) => sum + peer.offsetHeight, 0) * (to > from ? 1 : -1) : 0;
    if (!moved) peers.forEach(peer => peer.style.setProperty('--shift', '0px'));
    row.classList.add('settling');
    row.style.setProperty('--drag-y', span + 'px');
    const finish = () => {
      if (!moved) return reset(list);
      // The saved order re-renders the Plan in its new order, exactly where the rows now sit.
      return save(Number(peers[to].dataset.taskId)).catch(() => {}).finally(() => { if (row.isConnected) reset(list); });
    };
    if (reducedMotion()) finish();
    else setTimeout(finish, 200);
  };

  row.addEventListener('pointerdown', event => {
    if (event.button > 0 || drag || app.saving) return;
    cancelPress();
    press = {id: event.pointerId, x: event.clientX, y: event.clientY, timer: setTimeout(lift, LONG_PRESS)};
  });
  row.addEventListener('pointermove', event => {
    if (press && event.pointerId === press.id) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP) cancelPress();
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.y = event.clientY;
    follow(event.clientY);
  });
  row.addEventListener('pointerup', event => {
    cancelPress();
    if (drag && event.pointerId === drag.pointerId) drop(true);
  });
  row.addEventListener('pointercancel', () => {
    cancelPress();
    drop(false);
  });
  // Once lifted, a finger moving is a drag, not a page scroll; the long-press menu and text selection stay away.
  row.addEventListener('touchmove', event => { if (drag && event.cancelable) event.preventDefault(); }, {passive: false});
  row.addEventListener('contextmenu', event => { if (press || drag || swallowClick) event.preventDefault(); });
  row.addEventListener('click', event => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  row.addEventListener('pointerdown', () => { if (!drag) swallowClick = false; }, true);
  row.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !(event.altKey || event.ctrlKey)) return;
    event.preventDefault();
    const open = blockTasks(app.data(), task.blockId).filter(t => !t.done).map(t => t.id);
    const target = open[open.indexOf(task.id) + (event.key === 'ArrowUp' ? -1 : 1)];
    if (target == null) return;
    save(target).then(() => app.dom.work.querySelector(`.plan-list .task-row[data-task-id="${task.id}"] .task-main`)
      ?.focus({preventScroll: true})).catch(() => {});
  });
}

const SETTLE_MS = 900;

/** The ring fills with a short pop and the title strikes through on the row now on screen. */
function markRow(app, id, done) {
  for (const row of app.dom.work.querySelectorAll(`.task-row[data-task-id="${id}"]`)) {
    row.classList.toggle('done', done);
    row.classList.toggle('just-done', done);
    row.querySelector('.task-check')?.setAttribute('aria-checked', String(done));
  }
}

/**
 * One tap completes; recurring tasks complete one occurrence. Undo is always offered.
 * The row stays where it is, ticked, for a moment; then it collapses into Completed while the rows below slide up
 * (the re-render animates both). Undo brings it back the same way.
 */
export async function toggleDone(app, task, when) {
  if (app.saving) return;
  const completing = !task.done;
  const occurrence = when ?? task.occurrence ?? (repeats(task) ? nextOccurrence(task) : task.planned);
  const op = task.done
    ? {type: 'reopenTask', id: task.id, occurrence: when ?? task.occurrence}
    : {type: 'saveTask', id: task.id, fields: {done: true}, occurrence};
  const linger = completing && !repeats(task);
  if (linger) app.recentlyCompleted.set(task.id, true);
  if (completing) markRow(app, task.id, true);
  try {
    await app.commit(op, {label: completing ? 'Task completed' : 'Task marked incomplete', keepSheet: false});
    if (completing) markRow(app, task.id, true);
    if (linger) {
      setTimeout(() => {
        if (!app.recentlyCompleted.delete(task.id)) return;
        if (app.dom.sheet.hidden) app.render();
      }, SETTLE_MS);
    }
    app.api.native('haptic').catch(() => {});
  } catch {
    if (linger) app.recentlyCompleted.delete(task.id);
    if (completing) markRow(app, task.id, false);
  }
}

/** "Completed (n)" disclosure; tasks completed a moment ago stay in place first. */
export function completedSection(app, host, rows, options = {}) {
  if (!rows.length) return;
  const rest = rows.filter(task => !app.recentlyCompleted.has(task.id));
  for (const task of rows.filter(t => app.recentlyCompleted.has(t.id))) host.append(taskRow(app, task, options));
  if (!rest.length) return;
  const group = el('section', 'completed-group');
  group.dataset.key = 'completed';
  const open = app.state.completedOpen;
  const toggle = button('', () => {
    app.state.completedOpen = !app.state.completedOpen;
    app.render();
  }, 'completed-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.append(el('span', '', `Completed (${rest.length})`), icon(open ? 'expand_less' : 'expand_more'));
  group.append(toggle);
  if (open) for (const task of rest) group.append(taskRow(app, task, options));
  host.append(group);
}
