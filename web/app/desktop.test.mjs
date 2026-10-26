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
  for (const name of ['goTab', 'inbox', 'capture', 'add']) ui[name] = (...args) => calls.push([name, ...args]);
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

test('the sidebar holds Add task and Capture, then the four tabs and Inbox, and each one acts', () => {
  const nav = new FakeElement('nav');
  nav.hidden = true;
  const ui = fakeUi();
  const sidebar = mountSidebar(nav, new FakeElement('main'), ui);
  assert.equal(nav.hidden, false);
  const [top, tabs] = nav.children;
  const [add, capture] = top.children;
  assert.equal(labelOf(add), 'Add task');
  assert.equal(capture.getAttribute('aria-label'), 'Capture');
  assert.deepEqual(tabs.children.map(labelOf), [...DESTINATIONS.map(([, , label]) => label), 'Inbox']);
  add.click();
  capture.click();
  tabs.children[1].click();
  tabs.children.at(-1).click();
  assert.deepEqual(ui.calls, [['add'], ['capture'], ['goTab', DESTINATIONS[1][0]], ['inbox']]);
  const count = tabs.children.at(-1).querySelector('.side-count');
  sidebar.setInbox(3);
  assert.equal(count.textContent, '3');
  sidebar.setInbox(0);
  assert.equal(count.textContent, '');
});

test('the sidebar marks the open tab, and no tab while searching', () => {
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
  assert.deepEqual(current(), []);
});

test('denser rows apply only to a fine pointer', () => {
  const fine = css.slice(css.indexOf('@media (pointer: fine)'));
  assert.match(fine, /\.task-row \{ min-block-size: 40px; \}/);
  assert.match(fine, /\.spine-row \{ min-block-size: 40px; \}/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (pointer: fine)')), /\.task-row \{ min-block-size/);
});

test('a wide window anchors the planner to the sidebar and fills the width', () => {
  const wide = css.slice(css.indexOf(`@media ${WIDE}`));
  assert.match(wide, /\.planner-view \.page \{ max-width: none; margin-inline: 0; \}/);
  assert.match(wide, /column-gap: var\(--s6\)/);
  assert.match(wide, /\.planner-view:has\(> #agenda:not\(\[hidden\]\)\) \{ grid-template-columns: var\(--side\) minmax\(0, 1fr\) var\(--agenda\); \}/);
  assert.match(wide, /#sheet\[data-inline\]:not\(\[hidden\]\)\) > #agenda \{ display: none; \}/);
  assert.match(wide, /\[data-view=blocks\], \[data-view=projects\]\) \.page \{ display: grid; grid-template-columns: repeat\(auto-fill/);
});

test('a wide window shows Search in the top bar and only the sidebar opens Capture', () => {
  const wide = css.slice(css.indexOf(`@media ${WIDE}`));
  assert.match(wide, /\.top-actions \[aria-label=Capture\] \{ display: none; \}/);
  assert.doesNotMatch(wide, /aria-label=Search/);
});

test('Capture on a wide window sits on a full scrim and has no helper line', () => {
  const wide = css.slice(css.indexOf(`@media ${WIDE}`));
  assert.match(wide, /\.capture-sheet::backdrop \{[^}]*background: var\(--scrim\)/);
  assert.doesNotMatch(read('./index.html'), /capture-hint|capture-help/);
});
