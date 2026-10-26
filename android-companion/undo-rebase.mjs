import {applyRecord, projectRecords} from '../web/contract/records.mjs';
import {validatePlanner} from './planner-validation.mjs';
import {changedGroups, copyGroups, equal, knownRecord} from './replica-groups.mjs';

export const UNDO_IMAGE_LOCATIONS = ['planner.undo', 'undo.before'];
export const UNDO_CHANGED_MESSAGE = 'This changed on another device.';

export function* undoImages(store) {
  for (const location of UNDO_IMAGE_LOCATIONS) {
    if (location === 'planner.undo') {
      if (store.planner?.undo) yield {owner: store.planner, field: 'undo', image: store.planner.undo};
    } else {
      let owner = store, field = 'undo';
      while (owner[field]) {
        const record = owner[field];
        yield {owner, field, record, image: record.before};
        owner = record; field = 'previous';
      }
    }
  }
}

export function rebaseUndo(store, applied) {
  for (const {owner, field, record, image} of [...undoImages(store)].reverse()) {
    const next = structuredClone(image);
    for (const {key, sent, server} of applied) {
      if (!knownRecord(key) || equal(sent, server)) continue;
      const current = projectRecords(next).get(key) ?? null;
      if (server === null) applyRecord(next, key, null);
      else if (sent === null) applyRecord(next, key, server);
      else if (current !== null) applyRecord(next, key, copyGroups(key, current, server, changedGroups(key, sent, server)));
    }
    delete next.sync;
    try {
      validatePlanner(next);
      if (record) record.before = next;
      else owner[field] = next;
    } catch {
      owner[field] = record?.previous ?? null;
      store.undoMessage = UNDO_CHANGED_MESSAGE;
    }
  }
  return store;
}
