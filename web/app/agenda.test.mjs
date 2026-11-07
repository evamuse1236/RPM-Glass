import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {agendaModel, weekModel} from './agenda.mjs';

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

test('Next lists each open Result with a due date once, soonest first: when, what, tasks left and the next one not on Today', () => {
  const {d, review} = seed();
  const later = block(d, {title: 'Workbook uploaded', purpose: 'Done early'});
  task(d, {title: 'Upload the workbook', blockId: later, plannedDate: '2026-10-08'});
  block(d, {title: 'No date yet', purpose: 'Someday'});
  const items = agendaModel(d, SATURDAY_10_AM_KOLKATA);
  assert.deepEqual(items.filter(item => item.kind === 'result').map(item => item.id), [review, later]);
  const [first] = items;
  assert.equal(first.left, 3);
  assert.equal(first.next, 'Submit', 'Draft and Read are on Today already, so Submit is the next one named');
  assert.match(first.due.label, /^Due tomorrow/);
});

test('a Must in the next six days sits under its day in This week; a later one joins Next; a Must due today stays on the timeline only', () => {
  const {d} = seed();
  task(d, {title: 'Pay the fees', plannedDate: '2026-10-06', must: true});
  task(d, {title: 'Book the hall', planned: '2026-10-06T03:30:00.000Z', must: true});
  task(d, {title: 'Renew the visa', plannedDate: '2026-10-20', must: true});
  task(d, {title: 'Today Must', plannedDate: '2026-10-03', must: true});
  task(d, {title: 'Plain later', plannedDate: '2026-10-06'});
  const titles = agendaModel(d, SATURDAY_10_AM_KOLKATA).map(item => item.title);
  assert.deepEqual(titles, ['Critical review submitted', 'Renew the visa']);
  const week = weekModel(d, SATURDAY_10_AM_KOLKATA);
  assert.deepEqual(week.map(day => day.day), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  assert.deepEqual(week[2].items.map(item => item.title), ['Book the hall', 'Pay the fees'], 'timed first, then untimed');
  assert.ok(week[2].items[0].time, 'a timed Must shows its time');
  assert.equal(week.flatMap(day => day.items).length, 2, 'Today Must and plain tasks stay out of the week');
  const list = agendaModel(d, SATURDAY_10_AM_KOLKATA).map(item => item.id);
  assert.equal(new Set(list).size, list.length);
});

test('the side panel holds Next then This week, no Inbox; amber marks only an overdue deadline; Musts carry a star', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Inbox'|inboxRows/);
  assert.match(source, /el\('h2', 'next-head', 'Next'\)[\s\S]*el\('h2', 'next-head', 'This week'\)/);
  assert.match(source, /item\.due\.overdue \? ' overdue'/);
  assert.match(source, /if \(item\.nextMust\) next\.prepend\(star/);
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.next-when\.overdue \{ color: var\(--must\); \}/);
  assert.doesNotMatch(css, /\.next-when\.soon/);
  const next = css.slice(css.indexOf('/* Next: the deadlines ahead'), css.indexOf('@media (width >= 1080px)'));
  assert.doesNotMatch(next, /\.next-item \{[^}]*border-radius/, 'a rounded row would bend its divider');
  assert.doesNotMatch(next, /\.agenda-next \{[^}]*border-inline-start/, 'no side rule that stops short of the column');
});

test('the panel shows only on a wide window on Today', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.match(source, /isWide\(\) && planner\.dataset\.view === 'today'/);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<aside id="agenda"[^>]*hidden/);
});

test('wide Today rows keep the phone layout: one ring on the rail beside the title, no second column for the check', () => {
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  const wide = css.slice(css.indexOf('@media (width >= 1080px)'));
  assert.doesNotMatch(wide, /\.spine \{ max-inline-size/);
  assert.doesNotMatch(css, /\.spine-check[^{]*\{[^}]*grid-column: 2/, 'the check stays on the rail, as on the phone');
  assert.doesNotMatch(css, /\.spine-copy \{ flex-flow: row wrap/, 'the row has one meta line under the title, built by the view');
});

test('on wide the timeline drops its Inbox footer while the left nav counts the Inbox', () => {
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  const wide = css.slice(css.indexOf('@media (width >= 1080px)'));
  assert.match(wide, /\.planner-view:has\(> #agenda:not\(\[hidden\]\)\) \.inbox-row \{ display: none; \}/);
  assert.match(css, /\[aria-label='More choices'\] > \.chip \{ border-color: transparent; background: none;/, 'the pane folds its extra pickers into quiet text');
});

test('on wide a free gap is one compact row with its + right after the words', () => {
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  const wide = css.slice(css.indexOf('@media (width >= 1080px)'));
  assert.match(wide, /\.planner-view \.spine-row\.spine-gap \{ min-block-size: 32px; \}/);
  assert.match(wide, /\.planner-view \.spine-free \{ grid-template-columns: var\(--spine-pill\) auto var\(--touch\) minmax\(0, 1fr\); \}/);
});

test('on wide a detail page keeps one 720px column, so Back, its actions and its content share the same edges', () => {
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  const wide = css.slice(css.indexOf('@media (width >= 1080px)'));
  assert.match(wide, /\.planner-view #planner\[data-detail=true\] \{ --column: 720px; \}/);
  assert.match(wide, /\.planner-view #planner\[data-detail=true\] \.page \{ max-width: var\(--column\); margin-inline: auto; \}/);
});
