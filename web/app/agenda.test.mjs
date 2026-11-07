import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
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

test('Next adds a Must due after today that no listed Result holds; a Must due today stays on the timeline only', () => {
  const {d} = seed();
  task(d, {title: 'Pay the fees', plannedDate: '2026-10-06', must: true});
  task(d, {title: 'Today Must', plannedDate: '2026-10-03', must: true});
  task(d, {title: 'Plain later', plannedDate: '2026-10-06'});
  const titles = agendaModel(d, SATURDAY_10_AM_KOLKATA).map(item => item.title);
  assert.deepEqual(titles, ['Critical review submitted', 'Pay the fees']);
  const list = agendaModel(d, SATURDAY_10_AM_KOLKATA).map(item => item.id);
  assert.equal(new Set(list).size, list.length);
});

test('the side panel holds only Next: no Inbox card, Block cards or Week, since the left nav counts the Inbox', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Inbox'|inboxRows|'Week'|'Tomorrow'/);
  assert.match(source, /el\('h2', 'next-head', 'Next'\)/);
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.next-when\.soon \{ color: var\(--must\); \}/);
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
