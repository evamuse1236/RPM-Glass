/** What one command does to a snapshot. The overlay (optimistic view) and the mock phone share it. */
const TASK_TYPES = new Set(['complete', 'uncomplete', 'reschedule', 'edit', 'move-to-block', 'archive', 'restore']);
export const touchesTask = command => TASK_TYPES.has(command.type);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row?.[key] ?? null]));
const iso = now => new Date(now).toISOString();

function findTask(snapshot, id) {
  const task = snapshot.tasks.find(t => t.id === id);
  if (!task) throw new Error('That task is no longer on your phone.');
  return task;
}

/** The fields a task command sets, with their new values. */
export function taskPatch(snapshot, command, now = Date.now()) {
  const {args} = command, task = findTask(snapshot, args.taskId);
  switch (command.type) {
    case 'complete':
      if (args.occurrence) return {completedOccurrences: [...new Set([...task.completedOccurrences, args.occurrence])]};
      return {done: true, completedAt: iso(now)};
    case 'uncomplete':
      if (args.occurrence) return {completedOccurrences: task.completedOccurrences.filter(o => o !== args.occurrence)};
      return {done: false, completedAt: null};
    case 'reschedule':
      if (args.time && args.day) throw new Error('Choose a time or a day, not both.');
      return {planned: args.time ?? null, plannedDate: args.day ?? null};
    case 'edit': {
      const patch = {}, f = args.fields;
      if ('title' in f) {
        if (!String(f.title).trim()) throw new Error('Give the task a title.');
        patch.title = f.title;
      }
      if ('notes' in f) patch.notes = f.notes;
      if ('time' in f) Object.assign(patch, f.time ? {planned: f.time, plannedDate: null} : {planned: null});
      if ('minutes' in f) patch.minutes = f.minutes;
      if ('alert' in f) patch.alert = f.alert;
      return patch;
    }
    case 'move-to-block':
      if (args.blockId && !snapshot.blocks.some(b => b.id === args.blockId && !b.archived)) throw new Error('That Block is no longer on your phone.');
      return {blockId: args.blockId};
    case 'archive': return {archived: true, archiveDisposition: 'trash'};
    case 'restore': return {archived: false, archiveDisposition: null};
    default: throw new Error('Your phone does not know this change.');
  }
}

const withTask = (snapshot, id, patch) => ({...snapshot, tasks: snapshot.tasks.map(t => (t.id === id ? {...t, ...patch} : t))});
const withBody = (snapshot, body) => ({...snapshot, body: {...snapshot.body, ...body}});

/** What a command will overwrite, so Undo can put it back. */
export function beforeOf(snapshot, command, now = Date.now()) {
  if (!touchesTask(command)) return null;
  try {
    const keys = Object.keys(taskPatch(snapshot, command, now));
    return {taskId: command.args.taskId, fields: pick(findTask(snapshot, command.args.taskId), keys)};
  } catch {
    return null;
  }
}

/** Applies a command; throws an Error with words for the person when the phone would refuse it. */
export function applyCommand(snapshot, command, {now = Date.now()} = {}) {
  if (touchesTask(command)) return withTask(snapshot, command.args.taskId, taskPatch(snapshot, command, now));
  if (command.type === 'log-water') {
    const water = snapshot.body.water;
    return withBody(snapshot, {water: {...water, glasses: [...water.glasses, command.args.at]}});
  }
  if (command.type === 'log-meal') {
    const {name, slot, at} = command.args;
    if (!String(name ?? '').trim()) throw new Error('Name the meal.');
    return withBody(snapshot, {meals: [...snapshot.body.meals, {id: 'meal-' + command.id, name, slot, at}]});
  }
  if (command.type === 'capture' || command.type === 'undo') return snapshot;
  throw new Error('Your phone does not know this change.');
}

/** Puts back what `original` changed, unless the phone changed those fields again since. */
export function undoApplied(snapshot, original, before, {now = Date.now()} = {}) {
  if (touchesTask(original)) {
    if (!before) throw new Error('This change cannot be undone from the browser.');
    const task = findTask(snapshot, before.taskId);
    const keys = Object.keys(before.fields).filter(key => key !== 'completedAt');
    const after = pick(applyCommand(withTask(snapshot, before.taskId, before.fields), original, {now}).tasks.find(t => t.id === before.taskId), keys);
    if (!same(pick(task, keys), after)) {
      throw new Error('This changed on your phone after that. Undo it there.');
    }
    return withTask(snapshot, before.taskId, before.fields);
  }
  if (original.type === 'log-water') {
    const glasses = [...snapshot.body.water.glasses], at = glasses.lastIndexOf(original.args.at);
    if (at < 0) throw new Error('That glass is no longer logged.');
    glasses.splice(at, 1);
    return withBody(snapshot, {water: {...snapshot.body.water, glasses}});
  }
  if (original.type === 'log-meal') {
    return withBody(snapshot, {meals: snapshot.body.meals.filter(m => m.id !== 'meal-' + original.id)});
  }
  throw new Error('This change cannot be undone from the browser.');
}

/** The phone's conflict rule: the fields this command touches changed between its base snapshot and now. */
export function conflictBetween(base, current, command, now = Date.now()) {
  if (!touchesTask(command) || !base) return null;
  const keys = Object.keys(taskPatch(current, command, now));
  const was = pick(base.tasks.find(t => t.id === command.args.taskId), keys);
  const is = pick(current.tasks.find(t => t.id === command.args.taskId), keys);
  return same(was, is) ? null : {fields: is};
}
