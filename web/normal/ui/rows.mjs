/** Task rows as on the phone (check ring, title, one supporting line, Must star), plus the sync marks. */
import {h, icon} from './dom.mjs';
import {clock, duration, relativeDay} from '../../../android-companion/planner/format.mjs';
import {localDay} from '../../../android-companion/planner-state.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';
import {blockOf, toneOf} from '../core/model.mjs';
import {inFlight} from '../core/store.mjs';

export function whenText(task) {
  if (task.planned) return `${relativeDay(localDay(task.planned))}, ${clock(task.planned)}`;
  if (task.plannedDate) return relativeDay(task.plannedDate);
  return '';
}

const ALERTS = {alarm: 'an alarm', reminder: 'a reminder', off: 'no alert'};

/** The phone's current value for whatever a command tried to change. */
export function phoneValue(snapshot, entry, task) {
  if (!task) return 'removed';
  const fields = entry.type === 'edit' ? Object.keys(entry.args.fields) : [];
  if (entry.type === 'reschedule' || fields.includes('time')) return whenText(task) || 'no date';
  if (fields.includes('title')) return `“${task.title}”`;
  if (fields.includes('minutes')) return duration(task.minutes);
  if (fields.includes('alert')) return ALERTS[task.alert] ?? 'no alert';
  if (fields.includes('notes')) return 'different notes';
  if (entry.type === 'move-to-block') return blockOf(snapshot, task)?.title ?? 'Inbox';
  if (entry.type === 'complete' || entry.type === 'uncomplete') return task.done ? 'done' : 'not done';
  return task.archived ? 'in Trash' : 'in your plan';
}

const sentence = text => String(text).trim().replace(/[.!]+$/, '');

export function markFor(ctx, taskId) {
  const entry = ctx.marks.get(taskId);
  if (!entry) return ctx.fading.has(taskId) ? h('span.mark.gone', icon('schedule'), 'Sending') : null;
  if (entry.status === 'rejected') return h('span.mark.error', icon('error_outline'), 'Not applied');
  if (entry.status === 'conflict') return h('span.mark.error', icon('error_outline'), 'Changed on phone');
  return h('span.mark', {title: entry.status === 'outbox' ? 'Waiting to send' : 'Waiting for your phone'}, icon('schedule'), 'Sending');
}

/** Under a row: why the phone refused, or the phone's version with Keep phone's / Use mine. */
export function resolution(ctx, taskId) {
  const entry = ctx.marks.get(taskId);
  if (!entry || inFlight(ctx.state, entry)) return null;
  if (entry.status === 'rejected') {
    return h('div.field-error', {role: 'status'},
      h('span', `Your phone didn't apply this: ${sentence(userMessage(entry.message))}.`),
      h('button.text-btn', {type: 'button', onclick: () => ctx.control.retry(entry.id)}, 'Try again'),
      h('button.text-btn', {type: 'button', onclick: () => ctx.control.dismiss(entry.id)}, 'Dismiss'));
  }
  if (entry.status === 'conflict') {
    const task = ctx.snap.tasks.find(t => t.id === taskId);
    return h('div.resolve', {role: 'status'},
      h('span', `Your phone changed this first: ${phoneValue(ctx.snap, entry, task)}. Keep yours?`),
      h('div.resolve-actions',
        h('button.text-btn', {type: 'button', onclick: () => ctx.control.retry(entry.id)}, 'Use mine'),
        h('button.tonal-btn', {type: 'button', onclick: () => ctx.control.keepPhone(entry.id), 'data-default': ''}, "Keep phone's")));
  }
  return null;
}

export function toggleDone(ctx, task, occurrence = null) {
  const args = {taskId: task.id, ...(occurrence ? {occurrence: new Date(occurrence).toISOString()} : {})};
  ctx.control.act(task.done ? 'uncomplete' : 'complete', args, task.done ? 'Task reopened' : 'Task completed');
}

export function checkButton(ctx, task, {done = task.done, occurrence = null} = {}) {
  return h('button.task-check', {type: 'button', role: 'checkbox', 'aria-checked': String(done),
    'aria-label': `${done ? 'Reopen' : 'Complete'}: ${task.title}`, onclick: () => toggleDone(ctx, {...task, done}, occurrence)},
  h('span.check-ring', icon('check')));
}

export function trailMark(ctx, task) {
  return markFor(ctx, task.id) ?? (task.must ? h('span', {title: 'Must'}, icon('star', {fill: true, cls: 'must-mark'})) : null);
}

export function trail(ctx, task) {
  return h('div.task-trail', trailMark(ctx, task));
}

export function supporting(ctx, task, {when = true, block = true, minutes = true} = {}) {
  const parts = [];
  if (when && whenText(task)) parts.push(h('span.phrase', whenText(task)));
  if (minutes && task.minutes) parts.push(h('span.phrase', duration(task.minutes)));
  const b = block && blockOf(ctx.snap, task);
  if (b) parts.push(h('span', {style: {display: 'inline-flex', alignItems: 'center', gap: '6px'}, 'data-tone': toneOf(ctx.snap, b)}, h('span.area-dot'), b.title));
  return parts.length ? h('span.task-supporting', parts.flatMap((p, i) => (i ? [h('span', {'aria-hidden': 'true'}, '·'), p] : [p]))) : null;
}

export function taskRow(ctx, task, {current = false, show = {}, cls = 'task-row'} = {}) {
  return h(`div.${cls}${task.done ? '.done' : ''}${current ? '.current' : ''}`, {dataset: {task: task.id, dragTask: task.id}},
    checkButton(ctx, task),
    h('button.task-main', {type: 'button', 'data-focus': `task-${task.id}`, 'data-row': '', 'data-task-id': task.id,
      onclick: () => ctx.open(task.id)},
    h('span.task-title', task.title), supporting(ctx, task, show)),
    trail(ctx, task),
    resolution(ctx, task.id));
}

export function sectionHeader(title, note = null) {
  return h('div.section-header', h('h2', title), note && h('small', note));
}
