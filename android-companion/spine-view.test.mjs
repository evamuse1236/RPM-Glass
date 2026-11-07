import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
import {buildSpine} from './spine-model.mjs';

installFakeDom();
Object.defineProperty(FakeElement.prototype, 'style', {get() { return this.styles ??= {setProperty() {}}; }});
const {spineList, focusCard} = await import('./planner/spine-view.mjs');

const DAY = '2026-10-19';
const at = time => +new Date(`${DAY}T${time}`);
const model = buildSpine({day: DAY, now: at('14:45'), meals: [],
  tasks: [
    {id: 'Call', title: 'Call', start: at('17:00'), minutes: 0, done: true, tone: 'area-1'},
    {id: 'Cycle', title: 'Cycle', start: at('20:00'), minutes: 30, result: 'The exercise habit', tone: 'area-3'},
    {id: 'Read', title: 'Read', start: at('15:30'), minutes: 60, result: 'Pass the exam', tone: 'area-2'},
  ],
  events: [{id: 'Sync', title: 'Sync', start: at('16:00'), end: at('16:30')}]});
const on = new Proxy({}, {get: () => () => {}});
/** Every row Today draws: the Now card's, then the timeline's. */
const drawn = day => [...(focusCard(day, on)?.children ?? []), ...spineList(day, on).children];
const rows = drawn(model);
const byKey = key => rows.find(row => row.dataset.key === key);
const all = (node, cls) => [node, ...node.children.flatMap(child => all(child, cls))].filter(n => n.classList?.contains(cls));
const text = node => node.textContent;

test('every timed row has exactly one marker on the rail: a ring to tick or log, or a disc for an event', () => {
  for (const row of rows.filter(r => r.querySelector?.('.spine-card'))) {
    const card = all(row, 'spine-card')[0];
    const markers = card.children.filter(c => c.classList.contains('spine-check') || c.classList.contains('spine-disc'));
    assert.equal(markers.length, 1, `${row.dataset.key} has one marker`);
    assert.equal(card.children.indexOf(markers[0]), 1, 'the marker follows the tone bar, before the words');
  }
  assert.equal(all(byKey('event:Sync'), 'spine-disc').length, 1);
  assert.equal(all(byKey('task:Read'), 'spine-check').length, 1);
});

test('the time shows once, in the gutter: the words never repeat a plain clock time', () => {
  const read = byKey('task:Read');
  assert.equal(all(read, 'spine-when').length, 1, 'the next task keeps its countdown');
  assert.match(text(all(read, 'spine-when')[0]), /^in /);
  const cycle = byKey('task:Cycle');
  assert.equal(all(cycle, 'spine-when').length, 0, 'a later task shows no "8 PM to 8:30 PM" beside the gutter');
  assert.equal(text(all(cycle, 'spine-meta')[0]), 'The exercise habit');
});

test('two rows at the same time both show it in the gutter', () => {
  const same = buildSpine({day: DAY, now: at('09:00'), meals: [], tasks: [{id: 'Cycle', title: 'Cycle', start: at('20:00'), minutes: 0}]});
  const view = drawn(same);
  const times = view.filter(r => ['task:Cycle', 'meal:dinner'].includes(r.dataset.key)).map(r => text(all(r, 'spine-time')[0]));
  assert.deepEqual(times, ['8 PM', '8 PM']);
});

test('an unlogged meal has no "Not logged" line; its spoken name still says it', () => {
  const meal = byKey('meal:dinner');
  assert.equal(all(meal, 'spine-meta').length, 0);
  assert.match(all(meal, 'spine-open')[0].getAttribute('aria-label'), /Not logged/);
});

test('free time has words only where its + offers to plan in it; past and short gaps are bare rail', () => {
  const day = buildSpine({day: DAY, now: at('12:00'), meals: [],
    tasks: [{id: 'A', title: 'A', start: at('09:00'), minutes: 30}, {id: 'B', title: 'B', start: at('13:00'), minutes: 30},
      {id: 'C', title: 'C', start: at('13:50'), minutes: 30}]});
  const gaps = spineList(day, on).children.filter(r => r.classList.contains('spine-gap'));
  for (const gap of gaps) {
    const row = day.rows.find(r => r.key === gap.dataset.key);
    assert.equal(all(gap, 'spine-free-label').length, row.plan == null ? 0 : 1, `${row.label}${row.past ? ' (past)' : ''}`);
  }
  assert.ok(day.rows.some(r => r.kind === 'gap' && r.plan == null && !r.past), 'a short future gap is in the fixture');
});

test('a clash is one small marker under the words that names the event to TalkBack and opens Resolve', () => {
  const clash = buildSpine({day: DAY, live: false, now: at('09:00'), meals: [], tasks: [{id: 'Call', title: 'Call', start: at('12:00'), minutes: 15}],
    events: [{id: 'Session', title: 'Session', start: at('11:30'), end: at('13:30')}]});
  const call = drawn(clash).find(r => r.dataset.key === 'task:Call');
  const chips = all(call, 'spine-resolve');
  assert.equal(chips.length, 1);
  assert.equal(chips[0].getAttribute('aria-label'), 'Resolve the clash with Session');
  assert.match(text(chips[0]), /Clash · Session$/);
  assert.doesNotMatch(all(call, 'spine-open').map(text).join(), /Clash/);
});

test('a clash names its event on the row, even when the Now card shows it', () => {
  const clash = buildSpine({day: DAY, now: at('09:00'), meals: [], tasks: [{id: 'Call', title: 'Call', start: at('12:00'), minutes: 15}],
    events: [{id: 'Session', title: 'Session', start: at('11:30'), end: at('13:30')}]});
  assert.match(text(focusCard(clash, on)), /Session/);
  const call = drawn(clash).find(r => r.dataset.key === 'task:Call');
  const [chip] = all(call, 'spine-resolve');
  assert.match(text(chip), /Clash · Session$/);
  assert.equal(chip.getAttribute('aria-label'), 'Resolve the clash with Session');
});

test('the Now card holds only the item in progress, with a progress line; a missed task is not in it', () => {
  const day = buildSpine({day: DAY, now: at('11:40'), meals: [],
    tasks: [{id: 'Draft', title: 'Draft', start: at('10:00'), minutes: 30, must: true}, {id: 'Read', title: 'Read', start: at('13:00'), minutes: 30}],
    events: [{id: 'Session', title: 'Session', start: at('11:30'), end: at('12:30')}]});
  const card = focusCard(day, on);
  assert.deepEqual(card.children.map(r => r.dataset.key), ['event:Session']);
  assert.equal(card.getAttribute('aria-label'), 'Now');
  assert.equal(all(card.children[0], 'spine-progress').length, 1);
  assert.doesNotMatch(text(card), /ago/);
  const list = spineList(day, on).children.map(r => r.dataset.key);
  assert.ok(!list.includes('event:Session'), 'what the card shows is not repeated below');
  assert.ok(list.includes('now'), 'the Now line still splits the timeline');
  assert.equal(focusCard(buildSpine({day: DAY, live: false, now: at('09:00'), tasks: [{id: 'A', title: 'A', start: at('13:00'), minutes: 30}]}), on), null);
});

test('the done past folds behind one quiet Show done line at the top of the rail that opens it in place', () => {
  const day = buildSpine({day: DAY, now: at('11:40'), meals: [],
    tasks: [{id: 'Stretch', title: 'Stretch', start: at('08:00'), minutes: 15, done: true}, {id: 'Read', title: 'Read', start: at('13:00'), minutes: 30}]});
  const shut = spineList(day, on).children;
  assert.equal(shut[0].dataset.key, 'earlier');
  assert.equal(text(shut[0]), 'Show 1 done');
  assert.equal(all(shut[0], 'spine-fold-open')[0].getAttribute('aria-label'), 'Show earlier: 1 done, 1 more', 'Stretch, and Breakfast opens with it');
  assert.equal(all(shut[0], 'spine-fold-open')[0].getAttribute('aria-expanded'), 'false');
  assert.equal(all(shut[0], 'spine-check').length, 0, 'the line has no ring');
  assert.equal(shut.find(r => r.dataset.key === 'task:Stretch').hidden, true);
  const open = spineList(day, on, {open: {earlier: true}}).children;
  assert.equal(open.find(r => r.dataset.key === 'task:Stretch').hidden, false);
  assert.equal(text(open[0]), 'Hide 1 done');
});

test('what is owed sits in one group at the top: clock order, "N h late", three rows, then one line opens the rest and the done past; each keeps its swipe', () => {
  const swiped = [];
  const spy = new Proxy({}, {get: (_, name) => (name === 'gestures' ? (node, row) => swiped.push(row.key) : () => {})});
  const owedTask = (id, time, extra) => ({id, title: id, start: at(time), minutes: 15, ...extra});
  const day = buildSpine({day: DAY, now: at('21:30'), meals: [],
    tasks: [owedTask('Call', '10:30'), owedTask('Draft', '16:00', {must: true}), owedTask('Group', '17:00'), owedTask('Review', '18:00'),
      owedTask('Stretch', '08:00', {done: true}), {id: 'Read', title: 'Read', start: at('22:00'), minutes: 30}]});
  const shut = spineList(day, spy).children;
  const keys = shut.map(r => r.dataset.key);
  assert.deepEqual(keys.slice(0, 6), ['owed', 'task:Call', 'task:Draft', 'task:Group', 'task:Review', 'earlier'],
    'header, the rows in clock order, then one fold line');
  assert.ok(!keys.includes('owed-more'), 'never two expander lines');
  assert.equal(text(all(shut[0], 'spine-owed-label')[0]), 'Still to do · 4');
  assert.equal(text(all(shut[0], 'spine-owed-hint')[0]), 'Swipe left to plan', 'a quiet hint names the swipe');
  assert.equal(shut[0].getAttribute('role'), 'heading');
  const draft = shut[2];
  assert.ok(draft.classList.contains('owed') && draft.classList.contains('late') && draft.classList.contains('must'), 'a Must is marked for its error tone');
  assert.ok(!shut[1].classList.contains('must'), 'other late rows stay neutral');
  assert.equal(all(draft, 'spine-must').length, 1, 'a Must keeps its star');
  assert.match(text(draft), /5 h late/);
  assert.doesNotMatch(text(draft), /Missed|ago/);
  assert.deepEqual(shut.slice(1, 5).map(r => !!r.hidden), [false, false, false, true], 'three rows show, the fourth waits');
  assert.equal(text(shut[5]), 'Show 1 more · 1 done');
  assert.equal(all(shut[5], 'spine-fold-open')[0].getAttribute('aria-expanded'), 'false');
  assert.equal(shut.find(r => r.dataset.key === 'task:Stretch').hidden, true);
  assert.equal(keys.filter(k => k === 'task:Call').length, 1, 'an owed row is drawn once');
  assert.ok(keys.indexOf('now') > keys.indexOf('earlier'), 'the rest of the day follows the group');
  assert.deepEqual(swiped.filter(k => k !== 'task:Read' && k !== 'task:Stretch'), ['task:Call', 'task:Draft', 'task:Group', 'task:Review'],
    'an owed row still swipes left to schedule');
  const open = spineList(day, on, {open: {earlier: true}}).children;
  assert.equal(open.find(r => r.dataset.key === 'task:Review').hidden, false);
  assert.equal(open.find(r => r.dataset.key === 'task:Stretch').hidden, false);
  assert.equal(text(open.find(r => r.dataset.key === 'earlier')), 'Show less');
  const few = spineList(buildSpine({day: DAY, now: at('11:40'), meals: [], tasks: [owedTask('Call', '10:30')]}), on).children;
  assert.ok(!few.some(r => r.dataset.key === 'earlier' && /more/.test(text(r))), 'no more count for three or fewer');
});

test('tasks with no time are rows at the end of the timeline; only the first says Any time', () => {
  const day = buildSpine({day: DAY, live: false, now: at('11:40'), meals: [],
    tasks: [{id: 'Loose', title: 'Loose', start: null}, {id: 'Other', title: 'Other', start: null}]});
  const list = spineList(day, on).children;
  const loose = list.at(-2), other = list.at(-1);
  assert.deepEqual([loose.dataset.key, other.dataset.key], ['task:Loose', 'task:Other']);
  assert.equal(text(all(loose, 'spine-gutter')[0]), 'Any time');
  assert.equal(text(all(other, 'spine-gutter')[0]), '');
  assert.equal(all(loose, 'spine-check').length, 1, 'a ring ticks it like any task');
});

test('with nothing timed live or next there is no Now card; Any-time tasks stay rows under the timeline', () => {
  const evening = buildSpine({day: DAY, now: at('21:40'), meals: [], tasks: [{id: 'Loose', title: 'Loose', start: null}, {id: 'Key', title: 'Key', start: null, must: true}]});
  assert.equal(focusCard(evening, on), null);
  const list = spineList(evening, on).children.map(r => r.dataset.key);
  assert.ok(list.includes('task:Key') && list.includes('task:Loose'));
});
