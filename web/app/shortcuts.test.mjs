import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeElement, installFakeDom} from '../../android-companion/fake-dom.mjs';
import {KEYS, handleKey, mountShortcuts} from './shortcuts.mjs';

const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
installFakeDom();

function node(tag, cls = '', attrs = {}) {
  const n = new FakeElement(tag);
  n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function setup() {
  const calls = [];
  const ui = {};
  for (const name of ['add', 'openSearch', 'capture', 'goTab']) ui[name] = (...args) => calls.push([name, ...args]);
  const root = node('body');
  root.documentElement = {dataset: {}};
  const work = node('div');
  const sheet = node('section');
  sheet.hidden = true;
  const snackbar = node('div', '', {id: 'snackbar'});
  const undo = node('button', 'snackbar-action');
  undo.addEventListener('click', () => calls.push(['undo']));
  snackbar.append(undo);
  const dialog = node('dialog');
  const close = node('button', 'keys-close');
  dialog.append(close, node('dl', 'keys-list'));
  dialog.showModal = () => calls.push(['help']);
  dialog.close = () => calls.push(['close']);
  root.append(work, sheet, snackbar, dialog);
  const rows = ['a', 'b', 'c'].map(id => {
    const row = node('div', 'task-row');
    const opener = node('button', 'task-main');
    opener.focus = () => { root.activeElement = opener; };
    opener.addEventListener('click', () => calls.push(['open', id]));
    row.append(opener);
    row.rowActions = [{id: 'done', run: () => calls.push(['done', id])}, {id: 'delete', run: () => calls.push(['delete', id])}];
    work.append(row);
    return {row, opener};
  });
  root.activeElement = root;
  mountShortcuts(root, ui, {work, sheet, dialog});
  const press = (key, init = {}, target = root) => target.dispatch('keydown', {key, ...init});
  return {calls, root, rows, sheet, dialog, close, press};
}

test('one key map covers new, search, Capture, the four tabs, moving, complete, open, Undo, help and back', () => {
  assert.deepEqual(KEYS.map(entry => entry.key), ['n', '/', 'c', '1', '2', '3', '4', 'j', 'k', 'x', 'e', 'z', '?', 'Escape']);
  assert.deepEqual(KEYS.slice(3, 7).map(entry => entry.label), ['Today', 'Blocks', 'Projects', 'Life']);
});

test('each key runs its planner action and claims the key', () => {
  const {calls, press} = setup();
  for (const key of ['n', '/', 'c', '1', '2', '3', '4', '?']) assert.ok(press(key).defaultPrevented, key);
  assert.deepEqual(calls, [['add'], ['openSearch'], ['capture'], ['goTab', 'today'], ['goTab', 'blocks'], ['goTab', 'projects'], ['goTab', 'life'], ['help']]);
});

test('j and k move focus through the rows and stop at the ends; x completes and e opens the focused row', () => {
  const {calls, root, rows, press} = setup();
  press('k');
  assert.equal(root.activeElement, rows[2].opener);
  assert.equal(root.documentElement.dataset.keyboardNav, 'true');
  press('j');
  assert.equal(root.activeElement, rows[2].opener);
  press('k');
  press('k');
  press('k');
  assert.equal(root.activeElement, rows[0].opener);
  press('j');
  assert.equal(root.activeElement, rows[1].opener);
  press('x');
  press('e');
  assert.deepEqual(calls, [['done', 'b'], ['open', 'b']]);
});

test('x and e do nothing without a focused row; z presses the snackbar Undo', () => {
  const {calls, press} = setup();
  press('x');
  press('e');
  press('z');
  assert.deepEqual(calls, [['undo']]);
});

test('keys typed into a field, with a modifier, or under an open dialog or menu are left alone', () => {
  const {calls, root, press} = setup();
  for (const tag of ['input', 'textarea', 'select']) {
    const field = node(tag);
    root.append(field);
    assert.equal(press('n', {}, field).defaultPrevented, false, tag);
  }
  const editable = node('div', '', {contenteditable: 'true'});
  const inside = node('span');
  editable.append(inside);
  root.append(editable);
  press('n', {}, inside);
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) press('n', {[mod]: true});
  const menu = node('div', 'menu');
  root.append(menu);
  press('n');
  menu.parentNode.children.splice(menu.parentNode.children.indexOf(menu), 1);
  const open = node('dialog', '', {open: ''});
  root.append(open);
  press('n');
  assert.deepEqual(calls, []);
});

test('Esc goes back through the planner, but leaves an open sheet to close itself', () => {
  const {sheet, press} = setup();
  let backs = 0;
  globalThis.rpmHandleBack = () => { backs++; return backs === 1; };
  assert.ok(press('Escape').defaultPrevented);
  assert.equal(press('Escape').defaultPrevented, false);
  sheet.hidden = false;
  press('Escape');
  assert.equal(backs, 2);
  delete globalThis.rpmHandleBack;
});

test('the shortcut list shows every key from the map and closes from its button', () => {
  const {calls, dialog, close} = setup();
  const list = dialog.querySelector('.keys-list');
  const pairs = [];
  for (let i = 0; i < list.children.length; i += 2) pairs.push([list.children[i].textContent, list.children[i + 1].textContent]);
  assert.deepEqual(pairs, KEYS.map(({key, label}) => [key === 'Escape' ? 'Esc' : key, label]));
  close.click();
  assert.deepEqual(calls, [['close']]);
});

test('the website mounts the shortcuts on the planner and has the shortcut dialog', () => {
  assert.match(main, /mountShortcuts\(document, ui, \{work: \$\('workspace'\), sheet: \$\('sheet'\), dialog: \$\('keys-sheet'\)\}\);/);
  assert.match(html, /<dialog id="keys-sheet"[^>]*aria-labelledby="keys-title">/);
  assert.match(html, /<dl class="keys-list"><\/dl>/);
});
