import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
installFakeDom();
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};
const {addToToday, scheduleSlots} = await import('./planner/today.mjs');

/** A planner whose commit, like app.commit, does nothing and returns undefined while another save runs. */
function fakeApp({savingFor = 0} = {}) {
  const entries = [{id: 5, title: 'Draft', kind: 'plan'}, {id: 6, title: 'Submit', kind: 'plan'}];
  const ops = [];
  const app = {
    saving: savingFor > 0, ops, entries,
    data: () => ({entries}),
    notice() {},
    commit: async op => {
      if (app.saving) return undefined;
      app.saving = true;
      await new Promise(resolve => setTimeout(resolve, 5));
      ops.push(op);
      app.saving = false;
      return op.id ?? 'batch';
    },
  };
  if (savingFor) setTimeout(() => { app.saving = false; }, savingFor);
  return app;
}

const at = minutes => new Date(Date.UTC(2026, 9, 3, 9, minutes));
const slots = app => app.entries.map((task, i) => ({task, start: at(i * 30), end: at(i * 30 + 30)}));

test('"Add to today" tapped while another save runs waits for it and then saves', async () => {
  const app = fakeApp({savingFor: 40});
  await addToToday(app, app.entries[0]);
  assert.deepEqual(app.ops.map(op => [op.type, op.id, Object.keys(op.fields)]), [['saveTask', 5, ['plannedDate']]]);
});

test("the gap card's Schedule tapped while a tick saves waits, then schedules in one batch", async () => {
  const app = fakeApp({savingFor: 40});
  await scheduleSlots(app, slots(app), '2:30 pm to 3:30 pm');
  assert.equal(app.ops.length, 1, 'one batch, so one Undo');
  assert.deepEqual(app.ops[0].ops.map(op => op.id), [5, 6]);
});

test('Schedule leaves out a slot whose task was ticked done or archived by the save it waited for', async () => {
  const app = fakeApp({savingFor: 40});
  const card = slots(app);
  setTimeout(() => { app.entries[0].done = true; }, 20);
  await scheduleSlots(app, card, '2:30 pm to 3:30 pm');
  assert.deepEqual(app.ops.map(op => op.ops.map(o => o.id)), [[6]]);
  const gone = fakeApp({savingFor: 40});
  const both = slots(gone);
  setTimeout(() => { gone.entries[0].done = true; gone.entries[1].archived = true; }, 20);
  await scheduleSlots(gone, both, '2:30 pm to 3:30 pm');
  assert.deepEqual(gone.ops, [], 'nothing left to schedule, nothing saved');
});
