import {undoImages} from './undo-rebase.mjs';

export const PHONE_TASK_ID_CEILING = 1000000000;

export function initializeTaskIds(data) {
  const sync = data.sync ??= {};
  if (sync.nextTaskId === undefined) {
    let highest = 0;
    for (const image of [data, ...[...undoImages(data)].map(item => item.image)]) {
      for (const entry of image?.entries ?? []) if (Number.isInteger(entry.id) && entry.id < PHONE_TASK_ID_CEILING) highest = Math.max(highest, entry.id);
    }
    sync.nextTaskId = highest + 1;
  }
  return sync;
}

export function nextTaskId(data) {
  const sync = initializeTaskIds(data);
  if (!Number.isInteger(sync.nextTaskId) || sync.nextTaskId < 1 || sync.nextTaskId >= PHONE_TASK_ID_CEILING) throw new Error('Phone task ID range exhausted; cannot create another task.');
  return sync.nextTaskId++;
}
