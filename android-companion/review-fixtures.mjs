import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';

// Tests run in Asia/Kolkata (scripts/test-tz.mjs). Week of 28 Sep 2026 is the review week; 21 Sep is last week.
export const WEEK = '2026-09-28';
export const LAST = '2026-09-21';
export const at = iso => new Date(iso);

export const block = (d, fields) => editPlan(d, {type: 'saveEntity', collection: 'blocks', fields});
export const task = (d, fields, now) => editPlan(d, {type: 'saveTask', fields}, now);
export const entry = (d, id) => d.entries.find(e => e.id === id);

export function seed() {
  const d = freshStore();
  const rest = block(d, {title: 'Make space for rest', purpose: 'So I can think clearly'});
  const home = block(d, {title: 'Have home ready for the week', purpose: 'Calm Mondays'});
  const meals = task(d, {title: 'Prepare a few meals', blockId: home, minutes: 60, must: true, plannedDate: '2026-09-23'});
  const kitchen = task(d, {title: 'Clear the kitchen', blockId: home, minutes: 30, planned: '2026-09-24T12:30:00.000Z'});
  const laundry = task(d, {title: 'Laundry', blockId: home, minutes: 45, plannedDate: '2026-09-30'});
  const walk = task(d, {title: 'Walk without phone', blockId: rest, minutes: 40});
  const inbox = task(d, {title: 'Call the bank'});
  return {d, rest, home, meals, kitchen, laundry, walk, inbox};
}
