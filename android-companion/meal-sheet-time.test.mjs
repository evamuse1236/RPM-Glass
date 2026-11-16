// A new meal from the Log a meal sheet is stamped when it is saved, not when the sheet opened: a sheet left open
// across midnight logs the meal on the day it is saved, as logMealNow does.
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
proto.before ??= function (node) { this.parentNode?.insertBefore(node, this); };
proto.after ??= function (node) { this.parentNode?.insertBefore(node, this.nextSibling); };
proto.contains ??= function () { return false; };
proto.scrollIntoView ??= function () {};
if (!('style' in proto)) Object.defineProperty(proto, 'style', {get() { return this._st ??= {setProperty() {}, removeProperty() {}}; }, set() {}});
if (!Object.getOwnPropertyDescriptor(proto, 'parentElement')) Object.defineProperty(proto, 'parentElement', {get() { return this.parentNode; }});
if (!Object.getOwnPropertyDescriptor(proto, 'lastChild')) Object.defineProperty(proto, 'lastChild', {get() { return this.children.at(-1) ?? {}; }});
const {openMealSheet} = await import('./planner/meals.mjs');

const find = (n, pred) => { if (pred(n)) return n; for (const c of n.children ?? []) { const f = find(c, pred); if (f) return f; } return null; };
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

function harness(meals = []) {
  const sheet = new FakeElement('div');
  sheet.hidden = true;
  const clock = {now: new Date('2026-11-15T23:50:00')};
  const saved = [];
  const app = {dom: {sheet, planner: new FakeElement('div'), scrim: new FakeElement('div')}, sheet: {epoch: 0},
    data: () => ({version: 1}), api: {wide: () => false, native: async () => {}, label: l => l}, state: {}, render() {}, p: () => ({})};
  const body = {now: () => clock.now, meals: () => meals, meal: () => null, mealTimes: () => [], estimate: () => Promise.resolve(),
    saveMeal: async m => { saved.push(m); return {id: `m${saved.length}`, ...m}; }};
  return {sheet, clock, saved, app, body};
}

test('a meal sheet opened at 23:50 and saved at 08:40 next day logs the meal at 08:40 on the save day', async () => {
  const {sheet, clock, saved, app, body} = harness();
  openMealSheet(app, body, {slot: 'breakfast'});
  clock.now = new Date('2026-11-16T08:40:00');
  const input = find(sheet, n => ['input', 'textarea'].includes(n.tagName?.toLowerCase?.()));
  input.value = 'Oats';
  input.dispatch('input');
  find(sheet, n => n.textContent === 'Save' && n.className?.includes?.('filled-btn')).click();
  await settle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].slot, 'breakfast');
  assert.equal(saved[0].at, new Date('2026-11-16T08:40:00').toISOString());
});

test('a usual-food chip tapped after the clock moved saves at the tap, not when the sheet opened', async () => {
  const {sheet, clock, saved, app, body} = harness([{id: 'old', name: 'Oats', slot: 'breakfast', state: 'logged', at: new Date('2026-11-14T08:30:00').toISOString()}]);
  openMealSheet(app, body, {slot: 'breakfast'});
  clock.now = new Date('2026-11-16T08:40:00');
  find(sheet, n => n.tagName?.toLowerCase?.() === 'button' && n.className?.split?.(' ').includes('usual-chip')).click();
  await settle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Oats');
  assert.equal(saved[0].at, new Date('2026-11-16T08:40:00').toISOString());
});
