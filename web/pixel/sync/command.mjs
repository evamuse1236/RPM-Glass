export const newId = () => globalThis.crypto.randomUUID();

export function makeCommand(type, args, baseRevision, now = new Date()) {
  return {id: newId(), type, args, baseRevision, createdAt: new Date(now).toISOString()};
}

/** The planner entity a command touches, so a plate can show its pending or problem state. */
export function targetKey(command) {
  const {type, args} = command;
  if (args && 'taskId' in args) return `task:${args.taskId}`;
  if (type === 'log-water') return 'water';
  if (type === 'log-meal') return `meal:${args.slot}`;
  if (type === 'capture') return `capture:${command.id}`;
  return null;
}
