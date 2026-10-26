import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeElement, installFakeDom} from '../../android-companion/fake-dom.mjs';
import {DESTINATIONS} from '../../android-companion/planner/shell.mjs';
import {WIDE} from './desktop.mjs';
import {activeEntry, mountSidebar} from './sidebar.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('./web.css');
const sheet = read('../../android-companion/planner/sheet.mjs');
const main = read('./main.mjs');

FakeElement.prototype.removeAttribute = function (k) { this.attrs.delete(k); };
installFakeDom();
const observers = [];
globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe(node, options) { this.node = node; this.options = options; } };

function fakeUi() {
  const calls = [];
  const ui = {state: {tab: 'today', current: null}, calls};
  ui.tab = () => ui.state.tab;
  ui.current = () => ui.state.current;
  for (const name of ['goTab', 'inbox', 'openSearch', 'capture', 'add']) ui[name] = (...args) => calls.push([name, ...args]);
  return ui;
}
const labelOf = node => node.querySelector('.side-label')?.textContent;

test('the wide layout in CSS uses the same query the script reads', () => {
  assert.ok(css.includes(`@media ${WIDE} {`));
  assert.match(main, /inlineSheet: isWide/);
  assert.match(main, /onWidthChange\(\(\) => ui\.closeSheet\(\)\)/);
});

test('only the website asks for the inline pane; the phone keeps the modal sheet', () => {
  assert.match(sheet, /const inline = Boolean\(app\.api\.inlineSheet\?\.\(\)\);/);
  assert.match(sheet, /node\.setAttribute\('aria-modal', String\(!inline\)\);/);
  assert.match(sheet, /scrim\.hidden = inline;/);
  assert.match(sheet, /app\.dom\.planner\.inert = !inline;/);
  for (const path of ['../../android-companion/planner.html', '../../android-companion/index.html']) {
    assert.match(read(path), /id="sheet"[^>]*aria-modal="true"/);
  }
  const phone = read('../../android-companion/runtime.mjs');
  assert.match(phone, /mountPlanner\(/);
  assert.doesNotMatch(phone, /inlineSheet/);
});

test('the inline pane has no drag, no motion and a visible close', () => {
  assert.match(sheet, /const still = node => reducedMotion\(\) \|\| inlinePane\(node\);/);
  assert.match(sheet, /if \(!isSheetOpen\(app\) \|\| inlinePane\(node\)\) return;/);
  const wide = css.slice(css.indexOf(`@media ${WIDE}`));
  assert.match(wide, /#sheet\[data-inline\] \.sheet-handle \{ display: none; \}/);
  assert.match(wide, /#sheet\[data-inline\] \.sheet-close \{[^}]*clip-path: none;/);
  assert.match(wide, /#nav-bar, #dock \.fab/);
});

test('the sidebar holds Add, the four tabs, Inbox, Search and Capture, and each one acts', () => {
  const nav = new FakeElement('nav');
  nav.hidden = true;
  const ui = fakeUi();
  mountSidebar(nav, new FakeElement('main'), ui);
  assert.equal(nav.hidden, false);
  const [add, tabs, tools] = nav.children;
  assert.equal(labelOf(add), 'Add task');
  assert.deepEqual(tabs.children.map(labelOf), DESTINATIONS.map(([, , label]) => label));
  assert.deepEqual(tools.children.map(labelOf), ['Inbox', 'Search', 'Capture']);
  add.click();
  tabs.children[1].click();
  tools.children.forEach(node => node.click());
  assert.deepEqual(ui.calls, [['add'], ['goTab', DESTINATIONS[1][0]], ['inbox'], ['openSearch'], ['capture']]);
});

test('the sidebar marks the open tab, and Search while searching', () => {
  const nav = new FakeElement('nav');
  const planner = new FakeElement('main');
  const ui = fakeUi();
  mountSidebar(nav, planner, ui);
  const observer = observers.at(-1);
  assert.equal(observer.node, planner);
  assert.deepEqual(observer.options.attributeFilter, ['data-view', 'data-detail']);
  const current = () => [...nav.querySelectorAll('[aria-current=page]')].map(labelOf);
  assert.deepEqual(current(), ['Today']);
  assert.ok(nav.children[1].children[0].querySelector('.ms').classList.contains('fill'));
  ui.state.tab = 'blocks';
  observer.fn();
  assert.deepEqual(current(), ['Blocks']);
  assert.equal(nav.children[1].children[0].querySelector('.ms').classList.contains('fill'), false);
  ui.state.current = {kind: 'search'};
  assert.equal(activeEntry(ui), 'search');
  observer.fn();
  assert.deepEqual(current(), ['Search']);
});

test('denser rows apply only to a fine pointer', () => {
  const fine = css.slice(css.indexOf('@media (pointer: fine)'));
  assert.match(fine, /\.task-row \{ min-block-size: 40px; \}/);
  assert.match(fine, /\.spine-row \{ min-block-size: 40px; \}/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (pointer: fine)')), /\.task-row \{ min-block-size/);
});
