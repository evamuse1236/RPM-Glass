import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {inboxTasks} from '../../android-companion/review-state.mjs';
import {agendaModel} from './agenda.mjs';

const SATURDAY_10_AM_KOLKATA = new Date('2026-10-03T10:00:00+05:30');
const block = (d, fields) => editPlan(d, {type: 'saveEntity', collection: 'blocks', fields});
const task = (d, fields) => editPlan(d, {type: 'saveTask', fields}, SATURDAY_10_AM_KOLKATA);

function seed() {
  const d = freshStore();
  const review = block(d, {title: 'Critical review submitted', purpose: 'A calm Sunday'});
  task(d, {title: 'Submit', blockId: review, planned: '2026-10-04T15:30:00.000Z'});
  task(d, {title: 'Draft', blockId: review, planned: '2026-10-03T11:30:00.000Z', must: true});
  task(d, {title: 'Read', blockId: review, planned: '2026-10-03T04:30:00.000Z', must: true});
  task(d, {title: 'Call the bank', plannedDate: '2026-10-03'});
  task(d, {title: 'Buy stamps', plannedDate: '2026-10-05'});
  for (const title of ['One', 'Two', 'Three', 'Four', 'Five', 'Six']) task(d, {title});
  return {d, review};
}

test('the Today side panel counts the whole Inbox and lists only the first four', () => {
  const {d} = seed();
  const {inbox} = agendaModel(d, SATURDAY_10_AM_KOLKATA);
  assert.equal(inbox.count, inboxTasks(d).length);
  assert.equal(inbox.count, 8);
  assert.deepEqual(inbox.tasks, inboxTasks(d).slice(0, 4));
});

test("today's Musts come soonest first and leave out tasks that are not a Must", () => {
  const {musts} = agendaModel(seed().d, SATURDAY_10_AM_KOLKATA);
  assert.deepEqual(musts.map(t => t.title), ['Read', 'Draft']);
});

test('the next Block is the one due soonest, with its open tasks', () => {
  const {d, review} = seed();
  const {next} = agendaModel(d, SATURDAY_10_AM_KOLKATA);
  assert.equal(next.block.id, review);
  assert.ok(next.due);
  assert.deepEqual(next.tasks.map(t => t.title).sort(), ['Draft', 'Read', 'Submit']);
});

test('the week shows the six days after today with their task counts', () => {
  const {week} = agendaModel(seed().d, SATURDAY_10_AM_KOLKATA);
  assert.deepEqual(week.map(day => day.day), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  assert.equal(week[0].count, 1);
  assert.deepEqual(week[0].titles, ['Submit']);
  assert.equal(week[1].count, 1);
  assert.equal(week[2].count, 0);
});

test('the panel shows only on a wide window on Today', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.match(source, /isWide\(\) && planner\.dataset\.view === 'today'/);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<aside id="agenda"[^>]*hidden/);
});

test("a long day in the Week ends in an ellipsis inside its card", () => {
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.agenda-section \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.agenda-day \.list-supporting \{ white-space: nowrap; overflow: clip; text-overflow: ellipsis; \}/);
});
