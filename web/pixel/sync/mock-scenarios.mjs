/** The demo phone's starting plan for each `?state=`: the fixture moved to today, plus seeded commands. */
import {localDay} from '../../../android-companion/planner-state.mjs';
import {makeCommand, targetKey} from './command.mjs';
import {beforeOf} from './apply.mjs';

export const SCENARIOS = ['stale', 'offline', 'reject', 'conflict', 'unlinked', 'empty', 'loading', 'needs-answer', 'pending'];
export const PHONE_ASLEEP = new Set(['stale', 'offline', 'pending', 'loading']);
const MIN = 60000, DAY = 864e5;

function shiftAll(snapshot, ms) {
  const iso = value => (value ? new Date(Date.parse(value) + ms).toISOString() : value);
  const day = value => (value ? localDay(Date.parse(value + 'T12:00') + ms) : value);
  for (const t of snapshot.tasks) {
    Object.assign(t, {planned: iso(t.planned), plannedDate: day(t.plannedDate), completedAt: iso(t.completedAt)});
    t.completedOccurrences = t.completedOccurrences.map(iso);
  }
  const body = snapshot.body;
  body.water.glasses = body.water.glasses.map(iso);
  for (const meal of body.meals) meal.at = iso(meal.at);
  for (const run of body.runs) {
    run.day = day(run.day);
    for (const mark of run.marks) mark.at = iso(mark.at);
  }
}

const QUESTION = {id: 'draft-demo-1', status: 'question', title: 'Dentist next week',
  reply: 'You said "dentist next week". Which day should it go on?', receipt: [{text: 'Dentist · next week, day not set'}], taskIds: []};

export function prepareSnapshot(fixture, scenario, now) {
  const snapshot = structuredClone(fixture);
  const days = Math.round((Date.parse(localDay(now) + 'T12:00') - Date.parse(fixture.savedAt.slice(0, 10) + 'T12:00')) / DAY);
  if (days) shiftAll(snapshot, days * DAY);
  snapshot.savedAt = new Date(+now - (scenario === 'stale' ? 42 : 3) * MIN).toISOString();
  if (scenario === 'empty') {
    Object.assign(snapshot, {tasks: [], blocks: [], projects: [], goals: [], drafts: [], captures: []});
    Object.assign(snapshot.body, {meals: [], runs: []});
    snapshot.body.water.glasses = [];
  }
  if (scenario === 'needs-answer') snapshot.drafts = [QUESTION];
  return snapshot;
}

function seeded(snapshot, type, args, label, status, message = null, at = Date.now()) {
  const command = makeCommand(type, args, snapshot.revision, at);
  return {command, status, message, newRevision: null, label, at: +at, key: targetKey(command),
    before: beforeOf(snapshot, command), undoOf: null, undoRequested: false, dismissed: false};
}

export function seedEntries(snapshot, scenario, now) {
  const task = id => snapshot.tasks.find(t => t.id === id);
  if (scenario === 'pending') {
    return [
      seeded(snapshot, 'complete', {taskId: 30}, `Done: ${task(30).title}`, 'pending', 'Waiting for phone', now),
      seeded(snapshot, 'log-water', {at: new Date(now).toISOString()}, 'Glass of water', 'pending', 'Waiting for phone', now),
      seeded(snapshot, 'capture', {text: 'Call Amma tomorrow and buy ink'}, 'Capture', 'pending', 'Waiting for phone', now),
    ];
  }
  if (scenario === 'reject') {
    return [seeded(snapshot, 'complete', {taskId: 33}, `Done: ${task(33).title}`, 'rejected', 'This task was deleted there.', now)];
  }
  if (scenario === 'conflict') {
    const five = new Date(localDay(now) + 'T17:00');
    return [seeded(snapshot, 'reschedule', {taskId: 31, time: five.toISOString(), day: null}, `Moved: ${task(31).title}`,
      'conflict', 'The phone changed this at 10:14.', now)];
  }
  return [];
}
