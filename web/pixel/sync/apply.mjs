/** One browser command applied to a snapshot copy. Shared by the optimistic view and the demo phone. */

export class CommandProblem extends Error {
  constructor(message, status = 'rejected') {
    super(message);
    this.status = status;
  }
}

const repeats = task => !!(task.recurrence || task.repeatAfterDays);

function liveTask(snapshot, id) {
  const task = snapshot.tasks.find(t => t.id === id);
  if (!task || task.archived) throw new CommandProblem('This task was deleted there.');
  return task;
}

const TASK_OPS = {
  complete(task, args, now) {
    if (repeats(task) && args.occurrence) {
      if (!task.completedOccurrences.includes(args.occurrence)) task.completedOccurrences.push(args.occurrence);
      return;
    }
    task.done = true;
    task.completedAt = now.toISOString();
  },
  uncomplete(task, args) {
    if (repeats(task) && args.occurrence) {
      task.completedOccurrences = task.completedOccurrences.filter(o => o !== args.occurrence);
      return;
    }
    task.done = false;
    task.completedAt = null;
  },
  reschedule(task, {time, day}) {
    if (time && day) throw new CommandProblem('Choose a time or a day, not both.');
    task.planned = time;
    task.plannedDate = day;
  },
  edit(task, {fields}) {
    for (const [name, value] of Object.entries(fields)) {
      if (name === 'time') { task.planned = value; if (value) task.plannedDate = null; }
      else task[name] = value;
    }
  },
  archive(task) {
    task.archived = true;
    task.archiveDisposition = 'trash';
  },
};

export function applyCommand(snapshot, command, {now = new Date()} = {}) {
  const next = structuredClone(snapshot);
  const {type, args} = command;
  if (TASK_OPS[type]) {
    TASK_OPS[type](liveTask(next, args.taskId), args, new Date(now));
  } else if (type === 'move-to-block') {
    if (args.blockId != null && !next.blocks.some(b => b.id === args.blockId && !b.archived)) throw new CommandProblem('That Result was deleted there.');
    liveTask(next, args.taskId).blockId = args.blockId;
  } else if (type === 'restore') {
    const task = next.tasks.find(t => t.id === args.taskId);
    if (!task) throw new CommandProblem('This task is no longer in Trash.');
    task.archived = false;
    task.archiveDisposition = null;
  } else if (type === 'log-water') {
    next.body.water.glasses.push(args.at);
  } else if (type === 'log-meal') {
    next.body.meals.push({id: command.id, name: args.name, slot: args.slot, at: args.at});
  } else {
    throw new CommandProblem(`The phone does not know "${type}" here.`);
  }
  return next;
}

/** The fields a command may change, read before it is sent, so Undo can show the old state while it waits. */
export function beforeOf(snapshot, command) {
  const id = command.args?.taskId;
  if (id == null) return null;
  const task = snapshot.tasks.find(t => t.id === id);
  return task ? structuredClone(task) : null;
}

export function restoreTask(snapshot, before) {
  const next = structuredClone(snapshot);
  const at = next.tasks.findIndex(t => t.id === before.id);
  if (at >= 0) next.tasks[at] = structuredClone(before);
  return next;
}
