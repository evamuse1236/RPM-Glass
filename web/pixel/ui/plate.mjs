import {h, key} from './dom.mjs';
import {icon} from './icons.mjs';
import {statusText} from '../sync/state.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';

export const pendingLine = (entry, online) => h('span.pending-line', {}, icon('hourglass'), statusText(entry, online));

/** The ink strip above a plate the phone refused or found changed: the phone's words and what to do next. */
export function problemStrip(ctx, entry) {
  const conflict = entry.status === 'conflict';
  return h('div.strip', {role: 'alert'},
    h('p', {}, userMessage(statusText(entry))),
    h('div.strip-keys', {},
      key(conflict ? 'Keep phone' : 'Dismiss', () => ctx.store.dismiss(entry.command.id), {cls: 'on-ink'}),
      key(conflict ? 'Send mine' : 'Retry', () => ctx.store.resend(entry.command.id), {cls: 'on-ink'})));
}

const repeats = task => !!(task.recurrence || task.repeatAfterDays);
export const occurrenceOf = task => (repeats(task) && task.start ? new Date(task.start).toISOString() : null);

export function toggleDone(ctx, task, done) {
  const occurrence = occurrenceOf(task);
  const args = occurrence ? {taskId: task.id, occurrence} : {taskId: task.id};
  ctx.act(done ? 'uncomplete' : 'complete', args, `${done ? 'Not done' : 'Done'}: ${task.title}`);
}

/**
 * A task as a floor plate: tick, title (opens the task), facts, and its command state. `done` sinks it into the
 * floor; a waiting command draws it dashed with an hourglass; a refusal adds the strip above it.
 */
export function taskPlate(ctx, task, {meta = [], done = !!task.done, tail = null, heroSpot = false, drag = true} = {}) {
  const pending = ctx.view.pending.get(`task:${task.id}`);
  const problem = ctx.view.problems.get(`task:${task.id}`);
  const state = pending ? 'pending' : done ? 'done' : 'idle';
  const open = h('button.plate-open', {type: 'button', dataset: {focusKey: `open:${task.id}:${task.start ?? ''}`},
    onclick: () => ctx.openTask(task),
    onkeydown: event => {
      if (event.key === ' ') { event.preventDefault(); toggleDone(ctx, task, done); }
    }},
  h('span.plate-title', {}, task.title),
  h('span.plate-meta', {}, pending ? pendingLine(pending, ctx.state.online) : meta.filter(Boolean).flatMap((m, i) => (i ? [' · ', m] : [m]))));
  const plate = h('article.plate', {dataset: {state, task: task.id, drag: drag ? 'task' : null}},
    heroSpot ? h('span.hero-spot', {dataset: {heroSpot: 'today'}}) : null,
    h('button.tick', {type: 'button', 'aria-pressed': String(done), 'aria-label': `${done ? 'Mark not done' : 'Mark done'}: ${task.title}`,
      dataset: {focusKey: `tick:${task.id}:${task.start ?? ''}`}, onclick: () => toggleDone(ctx, task, done)}, icon('check')),
    open,
    h('span.plate-tail', {}, task.must ? h('span.must', {title: 'Must'}, icon('star', {title: 'Must'})) : null, tail));
  plate.rpmTask = task;
  return h('div.plate-wrap', {dataset: {key: `task:${task.id}`}}, problem ? problemStrip(ctx, problem) : null, plate);
}

export const emptyPlate = (...lines) => h('div.empty-plate', {}, ...lines.map(line => h('p', {}, line)));
