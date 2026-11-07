import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {comingUp, groupName} from './agenda.mjs';

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

test('Coming up groups by day after the shown day: one row per deadline, its Must leading and its Result under it, empty days skipped', () => {
  const {d, review} = seed();
  const later = block(d, {title: 'Workbook uploaded', purpose: 'Done early'});
  task(d, {title: 'Upload the workbook', blockId: later, plannedDate: '2026-10-08', must: true});
  block(d, {title: 'No date yet', purpose: 'Someday'});
  task(d, {title: 'Pay the fees', plannedDate: '2026-10-06', must: true});
  task(d, {title: 'Book the hall', planned: '2026-10-06T03:30:00.000Z', must: true});
  task(d, {title: 'Today Must', plannedDate: '2026-10-03', must: true});
  task(d, {title: 'Plain later', plannedDate: '2026-10-06'});
  const groups = comingUp(d, SATURDAY_10_AM_KOLKATA);
  assert.deepEqual(groups.map(g => g.day), ['2026-10-04', '2026-10-06', '2026-10-08'], 'today (shown) and empty days are left out');
  const [sunday, tuesday, thursday] = groups;
  assert.deepEqual(sunday.items.map(i => [i.kind, i.id]), [['result', review]]);
  assert.equal(sunday.items[0].left, 3);
  assert.ok(sunday.items[0].when, 'a timed deadline says its time once');
  assert.ok(!sunday.items.some(i => ['Draft', 'Read'].includes(i.title)), 'Draft and Read are on the shown day, so the centre holds them');
  assert.deepEqual(tuesday.items.map(i => i.title), ['Book the hall', 'Pay the fees'], 'timed first, then untimed');
  assert.deepEqual(thursday.items.map(i => [i.kind, i.title, i.block, i.left]), [['must', 'Upload the workbook', 'Workbook uploaded', 1]],
    'the deadline is one row: its Must leads, its Result and what is left on the line under it');
  assert.equal(tuesday.items[1].block, undefined, 'a Must with no Result has no second line');
  const ids = groups.flatMap(g => g.items.map(i => i.id));
  assert.equal(new Set(ids).size, ids.length, 'each item once');
});

test('the shown day moves with the centre: Coming up leaves out whichever day it shows', () => {
  const {d} = seed();
  task(d, {title: 'Pay the fees', plannedDate: '2026-10-06', must: true});
  task(d, {title: 'Today Must', plannedDate: '2026-10-03', must: true});
  const days = comingUp(d, SATURDAY_10_AM_KOLKATA, '2026-10-06').map(g => g.day);
  assert.ok(!days.includes('2026-10-06'));
  assert.ok(days.includes('2026-10-03'), 'today shows when another day is in the centre');
});

test('every item sits under its own day: a Must of another day leaves its Result, and a missed one goes under Overdue', () => {
  const d = freshStore();
  const exam = block(d, {title: 'Exam passed', purpose: 'Calm'});
  task(d, {title: 'Sit the exam', blockId: exam, planned: '2026-10-06T04:30:00.000Z'});
  task(d, {title: 'Past paper', blockId: exam, planned: '2026-10-03T12:00:00.000Z', must: true});
  task(d, {title: 'Revise', blockId: exam, planned: '2026-10-03T03:30:00.000Z', must: true});
  const groups = comingUp(d, SATURDAY_10_AM_KOLKATA, '2026-10-04');
  const where = Object.fromEntries(groups.flatMap(g => g.items.map(i => [i.title, g.day])));
  assert.deepEqual(where, {'Revise': 'overdue', 'Past paper': '2026-10-03', 'Exam passed': '2026-10-06'});
  assert.deepEqual(groups.map(g => g.day), ['overdue', '2026-10-03', '2026-10-06'], 'Overdue first, then the days in order');
  assert.equal(groups[0].items[0].when.replace(/\s/g, ' '), '9:00 AM', 'a Must missed today shows only its time, as other rows do; the day is not said twice');
  task(d, {title: 'Older', planned: '2026-09-30T03:30:00.000Z', must: true});
  task(d, {title: 'Oldest', planned: '2026-09-26T03:30:00.000Z', must: true});
  const when = Object.fromEntries(comingUp(d, SATURDAY_10_AM_KOLKATA, '2026-10-04')[0].items.map(i => [i.title, i.when.replace(/\s/g, ' ')]));
  assert.equal(when.Older, 'Wednesday, 9:00 AM', 'this past week names its weekday');
  assert.equal(when.Oldest, 'Sat 26 September, 9:00 AM', 'older names its full date');
  assert.doesNotMatch(groups[1].items[0].when, /Oct/, 'under its own day a Must says only its time');
  assert.equal(groups[0].items[0].block, 'Exam passed', 'a Must away from its deadline still names its Result');
  assert.equal(groups[2].items[0].kind, 'result', 'a deadline with no Must that day leads with the Result');
});

test('an overdue Result heads the list as Overdue; only it reads in the Must amber', () => {
  const d = freshStore();
  const late = block(d, {title: 'Form sent', purpose: 'Calm'});
  task(d, {title: 'Send', blockId: late, plannedDate: '2026-10-01'});
  const [first] = comingUp(d, SATURDAY_10_AM_KOLKATA);
  assert.equal(first.day, 'overdue');
  assert.deepEqual(first.items.map(i => i.title), ['Form sent']);
});

test('the side panel is one Coming up list, no Inbox, no "No Musts" rows; amber marks only what is overdue', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Inbox'|inboxRows/);
  assert.doesNotMatch(source, /No Musts|'This week'|'Next'/);
  assert.match(source, /el\('h2', 'soon-head', 'Coming up'\)/);
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.soon-name\.overdue, \.soon-time\.overdue \{ color: var\(--must\); \}/);
  const soon = css.slice(css.indexOf('/* Coming up:'), css.indexOf('@media (width >= 1080px)'));
  assert.doesNotMatch(soon, /\.soon-(result|must|day) \{[^}]*border-radius/, 'a rounded row would bend its divider');
  assert.doesNotMatch(soon, /border-inline-start/, 'no side rule that stops short of the column');
  assert.doesNotMatch(soon, /text-overflow: ellipsis/, 'nothing in Coming up is cut short');
  assert.match(soon, /\.soon-what \{[^}]*overflow-wrap: anywhere/, 'a long title wraps in full, never clipped');
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

test('a day heading is its full date, and Today or Tomorrow names only the real today and tomorrow', () => {
  assert.equal(groupName('overdue', SATURDAY_10_AM_KOLKATA), 'Overdue');
  assert.equal(groupName('2026-10-03', SATURDAY_10_AM_KOLKATA), 'Today · Sat 3 October');
  assert.equal(groupName('2026-10-04', SATURDAY_10_AM_KOLKATA), 'Tomorrow · Sun 4 October');
  assert.equal(groupName('2026-10-06', SATURDAY_10_AM_KOLKATA), 'Tue 6 October');
});
