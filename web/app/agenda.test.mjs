import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan, inboxRows} from '../../android-companion/planner-state.mjs';
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
  assert.equal(inbox.count, inboxRows(d).length);
  assert.equal(inbox.count, 8);
  assert.deepEqual(inbox.tasks, inboxRows(d).slice(0, 4));
});

test('the next Block is the one due soonest, with its open tasks not already on Today', () => {
  const {d, review} = seed();
  const {next} = agendaModel(d, SATURDAY_10_AM_KOLKATA);
  assert.equal(next.block.id, review);
  assert.ok(next.due);
  assert.deepEqual(next.tasks.map(t => t.title), ['Submit']);
  assert.equal('musts' in agendaModel(d, SATURDAY_10_AM_KOLKATA), false);
});

test('the week lists only the next six days that hold tasks, with their counts', () => {
  const {week} = agendaModel(seed().d, SATURDAY_10_AM_KOLKATA);
  assert.ok(week.every(day => day.count > 0 && day.day > '2026-10-03' && day.day <= '2026-10-09'));
  assert.equal(week[0].day, '2026-10-04');
  assert.equal(week[0].count, 1);
  assert.deepEqual(week[0].titles, ['Submit']);
});

test('the panel shows only on a wide window on Today', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.match(source, /isWide\(\) && planner\.dataset\.view === 'today'/);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<aside id="agenda"[^>]*hidden/);
});

test('a Week day wraps each title on its own line and keeps its count on the day line', () => {
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.agenda-section \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.agenda-day \.list-supporting \{ overflow-wrap: anywhere; \}/);
  assert.match(css, /\.agenda-day \.list-headline \{ display: flex; align-items: baseline;/);
});
