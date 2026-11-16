// Quick add keeps an unsent task as a draft. A day or #Block read from the title is the words' doing: deleting those
// words after the draft is restored gives back what was there before them, as it does in a sheet never closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';

installFakeDom();
const store = new Map();
globalThis.localStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.getComputedStyle = () => ({transform: 'none', getPropertyValue: () => ''});
globalThis.matchMedia = () => ({matches: true, addEventListener() {}});
globalThis.DOMMatrixReadOnly = class { constructor() { this.m42 = 0; } };
document.getElementById = () => null;
document.querySelector = () => null;
document.querySelectorAll = () => [];
document.activeElement = null;
document.body = new FakeElement('body');
const proto = FakeElement.prototype;
proto.animate ??= function () { return {finished: Promise.resolve(), cancel() {}, onfinish: null}; };
proto.getBoundingClientRect ??= () => ({height: 100, width: 100, top: 0, left: 0, bottom: 100, right: 100});
proto.setSelectionRange ??= function () {};
proto.toggleAttribute ??= function () {};
proto.before ??= function () {};
proto.contains ??= function () { return false; };
proto.scrollIntoView ??= function () {};
if (!('style' in proto)) Object.defineProperty(proto, 'style', {get() { return this._st ??= {setProperty() {}, removeProperty() {}}; }, set() {}});
if (!Object.getOwnPropertyDescriptor(proto, 'parentElement')) Object.defineProperty(proto, 'parentElement', {get() { return this.parentNode; }});
if (!Object.getOwnPropertyDescriptor(proto, 'lastChild')) Object.defineProperty(proto, 'lastChild', {get() { return this.children.at(-1) ?? {}; }});

const {taskEditor} = await import('./planner/quick-add.mjs');
const BLOCK = {id: 'b1', title: 'Garden', purpose: ''};
const KEY = 'rpm-planner-draft:task:new';

function mkApp(blocks = []) {
  const sheet = new FakeElement('div');
  sheet.hidden = true;
  return {
    dom: {sheet, planner: new FakeElement('div'), scrim: new FakeElement('div')},
    sheet: {epoch: 0}, saving: false,
    data: () => ({version: 1, entries: [], blocks}),
    activeBlocks: () => blocks,
    api: {wide: () => false, native: async () => {}, label: l => l, getPhone: () => ({})},
    state: {}, current: () => ({kind: 'today'}),
  };
}
const find = (n, cls) => {
  if (n.classList?.contains(cls)) return n;
  for (const c of n.children ?? []) { const f = find(c, cls); if (f) return f; }
  return null;
};
const type = (app, value) => {
  const name = find(app.dom.sheet, 'quick-input');
  name.value = value;
  name.dispatch('input');
};
const draft = () => JSON.parse(store.get(KEY));

test('deleting a day word after the draft is restored gives back No date, as in a fresh sheet', () => {
  store.clear();
  const first = mkApp();
  taskEditor(first, null);
  type(first, 'Call mum tomorrow');
  assert.equal(find(first.dom.sheet, 'quick-input').value, 'Call mum tomorrow');

  const reopened = mkApp();
  taskEditor(reopened, null);
  assert.equal(find(reopened.dom.sheet, 'quick-input').value, 'Call mum tomorrow', 'the draft is restored');
  type(reopened, 'Call mum');
  assert.equal(draft().Date, '', 'the day read from "tomorrow" leaves with the word');
  assert.equal(draft().Time, '');
});

test('deleting a #Block word after the draft is restored gives back the Inbox, as in a fresh sheet', () => {
  store.clear();
  const first = mkApp([BLOCK]);
  taskEditor(first, null);
  type(first, 'Water roses #garden');

  const reopened = mkApp([BLOCK]);
  taskEditor(reopened, null);
  type(reopened, 'Water roses');
  assert.equal(draft().Block, null, 'the Block named by "#garden" leaves with the word');
  assert.equal(draft().BlockPicked, false);
});

test('a day chosen by chip while words are read is still kept in the draft', () => {
  store.clear();
  const first = mkApp();
  taskEditor(first, null);
  type(first, 'Call mum tomorrow');
  const today = find(first.dom.sheet, 'quick-days').children.find(c => c.classList?.contains('choice-chip'));
  today.dispatch('click');
  assert.equal(draft().Date, today.dataset.value);
});
