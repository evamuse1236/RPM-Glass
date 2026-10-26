import {undoImages} from './undo-rebase.mjs';

export const PHONE_TASK_ID_CEILING = 1000000000;
export const PHONE_TASK_IDS = Object.freeze([1, PHONE_TASK_ID_CEILING]);
export const SERVER_TASK_IDS = Object.freeze([PHONE_TASK_ID_CEILING, 2 ** 31]);

const rangeOf = sync => sync.taskIdRange ?? PHONE_TASK_IDS;

export function initializeTaskIds(data) {
  const sync = data.sync ??= {};
  if (sync.nextTaskId === undefined) {
    const [low, high] = rangeOf(sync);
    let highest = low - 1;
    for (const image of [data, ...[...undoImages(data)].map(item => item.image)]) {
      for (const entry of image?.entries ?? []) if (Number.isInteger(entry.id) && entry.id >= low && entry.id < high) highest = Math.max(highest, entry.id);
    }
    sync.nextTaskId = highest + 1;
  }
  return sync;
}

export function nextTaskId(data) {
  const sync = initializeTaskIds(data);
  const [low, high] = rangeOf(sync);
  if (!Number.isInteger(sync.nextTaskId) || sync.nextTaskId < low || sync.nextTaskId >= high) throw new Error('Task ID range exhausted; cannot create another task.');
  return sync.nextTaskId++;
}
