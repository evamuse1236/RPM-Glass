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

test('the Today side panel counts the whole Inbox and lists the first four not already on Today', () => {
  const {d} = seed();
  const {inbox} = agendaModel(d, SATURDAY_10_AM_KOLKATA);
  assert.equal(inbox.count, inboxRows(d).length);
  assert.equal(inbox.count, 8);
  assert.deepEqual(inbox.tasks, inboxRows(d).filter(t => t.title !== 'Call the bank').slice(0, 4));
});

const ids = model => [
  ...model.inbox.tasks, ...model.blocks.flatMap(card => card.tasks),
  ...(model.tomorrow?.tasks ?? []), ...model.week.flatMap(day => day.tasks),
];

test('the next Block is the one due soonest, and lists only its open tasks no other card shows', () => {
  const {d, review} = seed();
  task(d, {title: 'Outline', blockId: review});
  const model = agendaModel(d, SATURDAY_10_AM_KOLKATA);
  assert.equal(model.blocks[0].block.id, review);
  assert.ok(model.blocks[0].due);
  assert.deepEqual(model.blocks[0].tasks.map(t => t.title), ['Outline']);
  assert.equal('musts' in model, false);
});

test('no task shows twice across Inbox, Block, Tomorrow and Week, at any width', () => {
  const {d} = seed();
  for (const split of [false, true]) {
    const list = ids(agendaModel(d, SATURDAY_10_AM_KOLKATA, {split})).map(t => t.id);
    assert.equal(new Set(list).size, list.length);
    assert.equal(ids(agendaModel(d, SATURDAY_10_AM_KOLKATA, {split})).filter(t => t.title === 'Submit').length, 1);
  }
});

test('the week lists only the next six days that hold tasks, with their counts', () => {
  const {week} = agendaModel(seed().d, SATURDAY_10_AM_KOLKATA);
  assert.ok(week.every(day => day.count > 0 && day.day > '2026-10-03' && day.day <= '2026-10-09'));
  assert.equal(week[0].day, '2026-10-04');
  assert.equal(week[0].count, 1);
  assert.deepEqual(week[0].tasks.map(t => t.title), ['Submit']);
});

test('a Week day shows at most two tasks, one per line by time, then +N for the rest', () => {
  const {d} = seed();
  for (const [title, at] of [['Late', '12:30'], ['Early', '02:30'], ['Noon', '06:30']]) task(d, {title, planned: `2026-10-05T${at}:00.000Z`});
  const monday = agendaModel(d, SATURDAY_10_AM_KOLKATA).week.find(day => day.day === '2026-10-05');
  assert.equal(monday.count, 4);
  assert.deepEqual(monday.tasks.map(t => t.title), ['Early', 'Noon']);
  assert.equal(monday.more, 1, 'Buy stamps already shows in the Inbox card, so +N leaves it out');
  assert.equal(agendaModel(seed().d, SATURDAY_10_AM_KOLKATA).week.some(day => day.day === '2026-10-05'), false,
    'a day whose only task shows in another card is not listed');
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /join\(', '\)/);
  assert.match(source, /button\(`\+\$\{day\.more\}`, open, 'agenda-more'\)/);
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.agenda-line \.list-headline \{ overflow: clip; text-overflow: ellipsis; white-space: nowrap; \}/);
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

test('a very wide window gives Tomorrow and the Week their own column beside Inbox and the Blocks, and Week then starts the day after', () => {
  const {d} = seed();
  task(d, {title: 'Stretch', planned: '2026-10-04T02:30:00.000Z'});
  const {tomorrow, week} = agendaModel(d, SATURDAY_10_AM_KOLKATA, {split: true});
  assert.equal(tomorrow.day, '2026-10-04');
  assert.equal(tomorrow.count, 2);
  assert.deepEqual(tomorrow.tasks.map(t => t.title), ['Stretch', 'Submit']);
  assert.ok(week.every(day => day.day >= '2026-10-05'));
  assert.equal(agendaModel(d, SATURDAY_10_AM_KOLKATA).tomorrow, null);
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.match(source, /split \? \[column\(ahead, week\), column\(inbox, \.\.\.blocks\)\] : \[column\(inbox, \.\.\.blocks, week\)\]/);
  assert.match(source, /const WEEK = 6;/);
  assert.match(source, /const ahead = tomorrow\?\.tasks\.length \? section\(/, 'Tomorrow hides when every task it has is already on screen');
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /--agenda: clamp\(400px, 100% - var\(--side\) - 720px, 440px\);/);
  assert.match(css, /@media \(width >= 1680px\) \{\n  \.planner-view \{ --agenda: clamp\(440px, 100% - var\(--side\) - 760px, 880px\); \}/,
    'at 1920 the two columns use the width the timeline leaves');
  assert.ok(css.indexOf('@media (width >= 1680px)') > css.indexOf('@media (width >= 1080px)'), 'the split width overrides the wide one');
});

test('a Block head keeps its name on one line and its due date on a short line under it', () => {
  const source = readFileSync(new URL('./agenda.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(due\) words\.append\(el\('span', 'agenda-due', due\)\);/);
  const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
  assert.match(css, /\.agenda-head h2 \{ overflow: clip; margin: 0; font: var\(--title-small\); text-overflow: ellipsis; white-space: nowrap; \}/);
});

test('on wide the timeline drops its Inbox footer while the side panel counts the Inbox', () => {
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
