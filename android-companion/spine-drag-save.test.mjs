import test from 'node:test';
import assert from 'node:assert/strict';

/** Just enough DOM for Today's card drag, its knurl and the row's hold menu. */
class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attrs = {}; this.props = {};
    this.className = ''; this.textContent = ''; this.parent = null;
    const self = this;
    this.style = {setProperty(k, v) { self.props[k] = v; }, removeProperty(k) { delete self.props[k]; }, translate: ''};
    this.classList = {set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }};
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  fire(type, ev) {
    for (const fn of this.listeners[type] ?? []) {
      fn({stopPropagation() {}, preventDefault() {}, stopImmediatePropagation() {}, isPrimary: true, button: 0,
        target: this, timeStamp: performance.now(), ...ev});
    }
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...n) { for (const c of n) { c.parent = this; this.children.push(c); } }
  before() {} remove() {}
  setPointerCapture() {}
  closest(sel) { if (sel === '.spine-row') return this.row ?? this.parent?.closest(sel); return this.parent?.closest?.(sel) ?? null; }
  getBoundingClientRect() { return {top: 100, bottom: 160, left: 0, width: 300}; }
  get offsetWidth() { return 40; }
}
globalThis.document = {createElement: t => new Node(t), body: new Node('body'), activeElement: null, documentElement: new Node('html')};
globalThis.getComputedStyle = () => ({getPropertyValue: () => '0'});
globalThis.innerWidth = 384;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};

const {attachSpineDrag} = await import('./planner/spine-drag-ui.mjs');
const {rowActions} = await import('./planner/row-gestures.mjs');
const {cardHeight} = await import('./spine-model.mjs');
const {HOLD_LIFT} = await import('./spine-drag.mjs');
const {duration} = await import('./planner/format.mjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A planner whose commit, like app.commit (planner/app.mjs), saves nothing and returns undefined while another save runs. */
function fakeApp({savingFor = 0} = {}) {
  const ops = [];
  const app = {
    saving: savingFor > 0, ops, dom: {scroll: Object.assign(new Node('div'), {scrollTop: 0})},
    api: {native: () => Promise.resolve()}, notice() {}, actions: {},
    commit: async (op, opts) => {
      if (app.saving) return undefined;
      app.saving = true;
      await wait(5);
      ops.push({op, opts});
      app.saving = false;
      return op.id;
    },
  };
  if (savingFor) setTimeout(() => { app.saving = false; }, savingFor);
  return app;
}

function todayCard(app) {
  const spineRow = new Node('div');
  const card = new Node('div');
  card.row = spineRow;
  const task = {id: 7, title: 'Write', minutes: 30, planned: '2026-11-16T10:00:00'};
  attachSpineDrag(app, card, {task: {ref: task}, start: Date.parse(task.planned), minutes: 30, done: false, past: false},
    {dayStart: Date.parse('2026-11-16T00:00:00')});
  return {card, spineRow, knurl: card.children.find(n => n.className === 'spine-knurl')};
}

function dragKnurl(knurl) {
  knurl.fire('pointerdown', {clientY: 200, pointerId: 1});
  knurl.fire('pointermove', {clientY: 248, pointerId: 1}); // +48px = +60 min
  knurl.fire('pointerup', {clientY: 248, pointerId: 1});
}

test('a knurl let go while another save runs saves the new length once that save ends', async () => {
  const app = fakeApp({savingFor: 60});
  const {knurl} = todayCard(app);
  dragKnurl(knurl);
  await wait(200);
  assert.deepEqual(app.ops.map(({op}) => op), [{type: 'saveTask', id: 7, fields: {minutes: 90}}]);
  assert.equal(app.ops[0].opts.label, `Length ${duration(90)}`);
});

test('a knurl whose length was not saved puts the card back at its saved length', async () => {
  const app = fakeApp();
  app.commit = async () => undefined;
  const {knurl, spineRow} = todayCard(app);
  dragKnurl(knurl);
  assert.equal(spineRow.props['--h'], cardHeight(90) + 'px');
  await wait(20);
  assert.equal(spineRow.props['--h'], cardHeight(30) + 'px');
});

test('a card moved and let go while another save runs saves its new start once that save ends', async () => {
  const app = fakeApp({savingFor: HOLD_LIFT + 80});
  const {card} = todayCard(app);
  // Backdated: Node can fire the lift timer a little early, and the lift needs a full HOLD_LIFT since the press.
  card.fire('pointerdown', {clientX: 50, clientY: 200, pointerId: 2, timeStamp: performance.now() - 20});
  await wait(HOLD_LIFT + 30);
  assert.ok(card.classList.contains('lifted'), 'the card lifted');
  card.fire('pointermove', {clientX: 50, clientY: 248, pointerId: 2}); // +48px = +60 min
  card.fire('pointerup', {clientX: 50, clientY: 248, pointerId: 2});
  await wait(250);
  assert.equal(app.ops.length, 1);
  assert.equal(app.ops[0].op.type, 'saveTask');
  assert.equal(Date.parse(app.ops[0].op.fields.planned), Date.parse('2026-11-16T11:00:00'));
});

test('Must from the hold menu tapped while another save runs saves once that save ends', async () => {
  const app = fakeApp({savingFor: 60});
  const must = rowActions(app, {id: 7, title: 'Write'}, {}, {tick() {}}).find(a => a.id === 'must');
  must.run();
  await wait(200);
  assert.deepEqual(app.ops.map(({op, opts}) => [op, opts.label]),
    [[{type: 'saveTask', id: 7, fields: {must: true}}, 'Marked Must']]);
});
