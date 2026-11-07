import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
import {buildSpine} from './spine-model.mjs';

installFakeDom();
Object.defineProperty(FakeElement.prototype, 'style', {get() { return this.styles ??= {setProperty() {}}; }});
const {spineList} = await import('./planner/spine-view.mjs');

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
const list = spineList(model, on);
const rows = list.children;
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
  const view = spineList(same, on).children;
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

test('a clash is one chip under the words that opens Resolve; the meta line does not repeat it', () => {
  const clash = buildSpine({day: DAY, now: at('09:00'), meals: [], tasks: [{id: 'Call', title: 'Call', start: at('12:00'), minutes: 15}],
    events: [{id: 'Session', title: 'Session', start: at('11:30'), end: at('13:30')}]});
  const call = spineList(clash, on).children.find(r => r.dataset.key === 'task:Call');
  const chips = all(call, 'spine-resolve');
  assert.equal(chips.length, 1);
  assert.equal(chips[0].getAttribute('aria-label'), 'Resolve the clash with Session');
  assert.doesNotMatch(all(call, 'spine-open').map(text).join(), /Clash/);
});
