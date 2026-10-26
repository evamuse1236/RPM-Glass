import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeElement, installFakeDom} from '../../android-companion/fake-dom.mjs';
import {quickMenu, rowActions} from '../../android-companion/planner/row-gestures.mjs';
import {closeMenu} from '../../android-companion/planner/menu.mjs';
import {FINE, TOOLS, actionRow, mountRowTools} from './pointer.mjs';

const css = readFileSync(new URL('./web.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');

Object.defineProperty(FakeElement.prototype, 'style', {get() { return this._style ??= {setProperty() {}}; }});
FakeElement.prototype.remove = function () { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; };
installFakeDom();
document.body = new FakeElement('body');
document.documentElement = new FakeElement('html');
Object.assign(globalThis, {innerWidth: 1440, innerHeight: 900});

function fakeApp() {
  const calls = [];
  const app = {calls, commit: async (op, meta) => calls.push(['commit', op, meta.label]), actions: {}};
  for (const name of ['scheduleTask', 'movePicker', 'deleteTask']) app.actions[name] = (...args) => calls.push([name, ...args]);
  return app;
}

function listRow(app, task, options = {}) {
  const row = new FakeElement('div');
  row.className = 'task-row';
  const opener = new FakeElement('button');
  opener.className = 'task-main';
  const title = new FakeElement('span');
  opener.append(title);
  row.append(opener);
  row.rowActions = rowActions(app, task, row, {tick: target => app.calls.push(['tick', target]), ...options});
  row.rowTitle = task.title;
  return {row, opener, title};
}

const labels = menu => menu.children.map(node => node.tagName === 'hr' ? '—' : node.children.at(-1).textContent);
const openedMenu = () => document.body.children.find(node => node.getAttribute('role') === 'menu');

test('one action list per row: Complete, Schedule, Move to Block, Must, Delete', () => {
  const app = fakeApp();
  const task = {id: 't1', title: 'Call the bank'};
  const {row} = listRow(app, task, {inbox: true});
  assert.deepEqual(row.rowActions.map(action => action.id), ['done', 'schedule', 'move', 'must', 'delete']);
  row.rowActions.forEach(action => action.run());
  assert.deepEqual(app.calls.map(([name]) => name), ['tick', 'scheduleTask', 'movePicker', 'commit', 'deleteTask']);
  assert.equal(app.calls[0][1], row);
  assert.deepEqual(app.calls[1].slice(1), [task, row, {moveToBlock: true}]);
  assert.deepEqual(app.calls[3][1], {type: 'saveTask', id: 't1', fields: {must: true}});
});

test('the row tools follow the mouse and keyboard focus, and each tool runs its action once', () => {
  const app = fakeApp();
  const root = new FakeElement('main');
  const first = listRow(app, {id: 'a', title: 'First'});
  const second = listRow(app, {id: 'b', title: 'Second'});
  root.append(first.row, second.row);
  const tools = mountRowTools(root);

  first.title.dispatch('pointerover', {pointerType: 'touch'});
  assert.equal(tools.parentNode, null);
  first.title.dispatch('pointerover', {pointerType: 'mouse'});
  assert.equal(tools.parentNode, first.row);
  assert.equal(tools.getAttribute('role'), 'toolbar');
  assert.equal(tools.getAttribute('aria-label'), 'First');
  assert.deepEqual(tools.children.map(node => node.getAttribute('aria-label')), ['Complete', 'Schedule', 'Move to Block']);
  assert.deepEqual(TOOLS, ['done', 'schedule', 'move']);

  second.opener.dispatch('focusin');
  assert.equal(tools.parentNode, second.row);
  let stopped = 0;
  tools.children.forEach(node => node.dispatch('click', {stopPropagation: () => stopped++}));
  assert.equal(stopped, 3);
  assert.deepEqual(app.calls.map(([name]) => name), ['tick', 'scheduleTask', 'movePicker']);
  assert.equal(app.calls[0][1], second.row);

  let swipeStopped = false;
  tools.dispatch('pointerdown', {stopPropagation: () => { swipeStopped = true; }});
  assert.ok(swipeStopped);
});

test('a right click on a row opens every row action, Delete set apart, and focus returns to the row', () => {
  const app = fakeApp();
  const root = new FakeElement('main');
  const {row, opener, title} = listRow(app, {id: 'a', title: 'Pay rent'});
  const plain = new FakeElement('p');
  root.append(row, plain);
  mountRowTools(root);

  const ignored = plain.dispatch('contextmenu', {clientX: 5, clientY: 5, stopPropagation() {}});
  assert.equal(ignored.defaultPrevented, false);
  assert.equal(openedMenu(), undefined);

  const event = title.dispatch('contextmenu', {clientX: 300, clientY: 120, stopPropagation() {}});
  assert.ok(event.defaultPrevented);
  const menu = openedMenu();
  assert.equal(menu.getAttribute('aria-label'), 'Actions for Pay rent');
  assert.deepEqual(labels(menu), ['Complete', 'Schedule', 'Move to Block', 'Mark as Must', '—', 'Delete']);
  menu.children[1].click();
  assert.deepEqual(app.calls.map(([name]) => name), ['scheduleTask']);
  assert.equal(FakeElement.focused, opener);
  assert.equal(actionRow(title), row);
});

test('the phone hold menu is unchanged: Must, Move to Block, then Delete', () => {
  const app = fakeApp();
  const anchor = new FakeElement('div');
  anchor.getBoundingClientRect = () => ({top: 100, bottom: 140, left: 0, right: 400, width: 400, height: 40});
  quickMenu(app, {id: 'a', title: 'Gym', must: true}, anchor);
  const menu = openedMenu();
  assert.equal(menu.getAttribute('aria-label'), 'Quick actions for Gym');
  assert.deepEqual(labels(menu), ['Remove Must', 'Move to Block', '—', 'Delete']);
  closeMenu();
});

test('the row tools exist only for a mouse or trackpad', () => {
  assert.match(main, /if \(matchMedia\(FINE\)\.matches\) mountRowTools\(document\);/);
  assert.equal(FINE, '(hover: hover) and (pointer: fine)');
  const outside = css.slice(0, css.indexOf('.row-tools { display: none; }'));
  assert.doesNotMatch(outside, /row-tools/);
  const fine = css.slice(css.indexOf('.row-tools { display: none; }'));
  assert.match(fine, new RegExp(`^\\.row-tools \\{ display: none; \\}\\n@media ${FINE.replace(/[()]/g, '\\$&')} \\{`));
  assert.match(fine, /:is\(\.task-row, \.spine-card\):is\(:hover, :focus-within\) > \.row-tools \{ display: flex; \}/);
});
