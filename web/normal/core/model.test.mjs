import test from 'node:test';
import assert from 'node:assert/strict';
import {todayModel, weekModel, blockList, inboxTasks, areaOf, findTasks, freeMinutes, weekStart} from './model.mjs';
import {rebase} from './mock-phone.mjs';
import {fixture, NOW} from './test-kit.mjs';

const s = rebase(fixture(), NOW);

test('a Block finds its Area through its Project and Goal', () => {
  assert.equal(areaOf(s, s.blocks.find(b => b.id === 'block-1')).title, 'Studies');
  assert.equal(areaOf(s, s.blocks.find(b => b.id === 'block-4')).title, 'Health');
  assert.equal(areaOf(s, s.blocks.find(b => b.id === 'block-8')), null);
});

test('Today at 10:15 AM: the review section is on now, with its Result, Purpose and deadline', () => {
  const t = todayModel(s, NOW);
  assert.equal(t.next.task.id, 30);
  assert.equal(t.next.label, 'Now · until 11:30 AM');
  assert.equal(t.next.block.purpose, "So Sunday's submission is calm, not a 10 PM scramble");
  assert.equal(t.next.facts.due.label, 'Due tomorrow 11:00 PM');
  assert.equal(t.next.facts.left, 5);
  assert.equal(t.spine.rows.find(r => r.kind === 'water').label, 'Water · 3 of 8');
  assert.equal(t.inbox, 6);
  assert.ok(t.upcoming.length >= 3);
});

test('the week runs Monday to Sunday with deadlines on their days and free time', () => {
  const week = weekModel(s, NOW);
  assert.equal(week.length, 7);
  assert.equal(week[0].day, '2026-10-19');
  assert.equal(week[0].today, true);
  assert.deepEqual(week[1].deadlines.map(d => d.title), ['RM critical review drafted with my group', 'PMDL post work ready to submit']);
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
});

test('free minutes subtract overlapping timed tasks once', () => {
  const day = '2026-10-19', at = h => Date.parse(`${day}T${h}`);
  const items = [{start: at('09:00'), minutes: 60}, {start: at('09:30'), minutes: 60}, {start: at('21:30'), minutes: 120}];
  assert.equal(freeMinutes(items, day), 14 * 60 - 90 - 30);
});

test('Inbox is open tasks with no Block and no day; Blocks sort by deadline', () => {
  assert.equal(inboxTasks(s).length, 6);
  assert.equal(blockList(s, NOW)[0].block.id, 'block-1');
  assert.equal(blockList(s, NOW, 'project-3').length, 1);
});

test('search matches word starts', () => {
  const rows = inboxTasks(s);
  assert.deepEqual(findTasks(rows, 'ri bud').map(t => t.id), [26]);
  assert.deepEqual(findTasks(rows, 'udget'), []);
});
