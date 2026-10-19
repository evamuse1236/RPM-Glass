import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {today, freeGaps} from './today.mjs';
import {week, quests, inboxTasks, moveArgs} from './plan.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/snapshot.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-19T10:05:00+05:30');
const H = 3600000;

test('Today leads with the task under way, framed by its Result and deadline', () => {
  const model = today(fixture, NOW);
  assert.match(model.date, /^Monday, (19 October|October 19)$/);
  assert.equal(model.lead.task.title, 'Finish my section of the critical review');
  assert.equal(model.lead.label, 'Now');
  assert.equal(model.lead.block.title, 'RM critical review drafted with my group');
  assert.match(model.lead.facts.due.label, /^Due tomorrow 11:00\sPM$/);
  assert.equal(model.lead.facts.leftText, '5 tasks left');
  assert.equal(model.inbox, 6);
  assert.deepEqual(model.anytime.map(t => t.title), ['Buy a birthday card for Amma']);
});

test('Today\'s agenda runs in time order with meals, water, the routine and free gaps', () => {
  const kinds = today(fixture, NOW).agenda.map(i => i.kind === 'task' ? i.task.title : i.kind);
  assert.deepEqual(kinds.slice(0, 4), ['routine', 'water', 'meal', 'free']);
  assert.ok(kinds.includes('Call the bank about the fee refund'));
  assert.ok(kinds.includes('Weekly review'));
  assert.equal(today(fixture, NOW).water.count, 3);
});

test('free gaps start now, skip short ones and stop at the end of the day', () => {
  const now = new Date('2026-10-19T10:00:00+05:30');
  const spans = [{at: +now + 0.25 * H, end: +now + H}, {at: +now + 3 * H, end: +now + 4 * H}];
  const gaps = freeGaps(spans, now, +now + 6 * H);
  assert.deepEqual(gaps.map(g => g.minutes), [120, 120]);
});

test('Week runs Monday to Sunday with Result deadlines on their day', () => {
  const days = week(fixture, NOW);
  assert.equal(days[0].day, '2026-10-19');
  assert.equal(days[0].today, true);
  assert.deepEqual(days[1].deadlines.map(d => d.block.id), ['block-1', 'block-2']);
  assert.deepEqual(days[1].timed.map(t => t.id), [22, 23]);
  assert.equal(days[4].timed.length + days[4].dated.length, 0);
});

test('Quests are open Results soonest first; the Inbox holds undated tasks without a Result', () => {
  const list = quests(fixture, NOW);
  assert.equal(list[0].block.id, 'block-1');
  assert.equal(list[0].done, 2);
  assert.equal(list[0].total, 7);
  assert.equal(list.length, 8);
  assert.deepEqual(inboxTasks(fixture).map(t => t.id), [24, 25, 26, 27, 28, 29]);
});

test('moving a task to a day keeps the clock time of a timed task and gives an untimed one the day', () => {
  const timed = fixture.tasks.find(t => t.id === 31);
  assert.deepEqual(moveArgs(timed, '2026-10-21'), {taskId: 31, time: '2026-10-21T10:30:00.000Z', day: null});
  assert.deepEqual(moveArgs({id: 24, planned: null}, '2026-10-21'), {taskId: 24, time: null, day: '2026-10-21'});
  assert.deepEqual(moveArgs(timed, null), {taskId: 31, time: null, day: null});
});
