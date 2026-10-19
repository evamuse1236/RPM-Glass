/** Drives the built page like a person: tick, undo, capture, walk rooms, drag, open a task. Fails loudly. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {openChrome, wait} from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(path.join(here, '..', 'dist', 'rpm-pixel.html')).href;
const dir = path.join(here, '..', 'evidence', 'pixel');
const shot = (tab, name) => tab.shot(path.join(dir, `flow-${name}.png`)).then(f => console.log(f));
const PHONE_MS = 3600;

const tab = await openChrome({port: 9334});
await tab.size(1440, 900);
await tab.open(`${page}?now=2026-10-19T10:05:00%2B05:30`);
const state = expr => tab.eval(`(() => { const s = window.rpm.store.state; return ${expr}; })()`);
const task = id => state(`s.snapshot.tasks.find(t => t.id === ${id})`);
const pointAt = async selector => tab.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
async function mouse(type, [x, y]) {
  await tab.send('Input.dispatchMouseEvent', {type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse'});
}

console.log('1. Tick "Call the bank" done, see it pending, then saved by the demo phone');
await tab.eval(`document.querySelector('.agenda .plate[data-task="33"] .tick').click()`);
await wait(200);
assert.equal(await tab.eval(`document.querySelector('.agenda .plate[data-task="33"]').dataset.state`), 'pending');
await shot(tab, '01-tick-pending');
await wait(PHONE_MS);
assert.equal((await task(33)).done, true);
assert.equal(await tab.eval(`document.querySelector('.agenda .plate[data-task="33"]').dataset.state`), 'done');
await shot(tab, '02-tick-saved');

console.log('2. Press Z inside six seconds: the phone undoes it');
await tab.eval('document.activeElement.blur()');
await tab.key('z', 'KeyZ', {text: 'z'});
await wait(PHONE_MS);
assert.equal((await task(33)).done, false);
await shot(tab, '03-undo-applied');

console.log('3. Capture: type, Ctrl+Enter, receipt, Undo');
const before = await state('s.snapshot.tasks.filter(t => !t.archived).length');
await tab.eval(`document.getElementById('capture-text').focus()`);
await tab.send('Input.insertText', {text: 'call Amma tomorrow and buy ink'});
await tab.key('Enter', 'Enter', {modifiers: 2, windowsVirtualKeyCode: 13});
await wait(300);
assert.equal(await tab.eval(`document.getElementById('capture-text').value`), '');
await tab.eval(`document.querySelector('[data-room="capture"]').scrollIntoView()`);
await shot(tab, '04-capture-sent');
await wait(PHONE_MS);
assert.equal(await state('s.snapshot.tasks.filter(t => !t.archived).length'), before + 2);
assert.match(await tab.eval(`document.querySelector('.receipt .receipt-title').textContent`), /2 tasks added/);
await shot(tab, '05-capture-receipt');
await tab.eval(`[...document.querySelectorAll('.receipt .key')].find(k => k.textContent.includes('Undo')).click()`);
await wait(PHONE_MS);
assert.equal(await state('s.snapshot.tasks.filter(t => !t.archived).length'), before);
await shot(tab, '06-capture-undone');

console.log('4. Arrow keys walk the map: Today → Week → Inbox');
await tab.eval('window.scrollTo(0, 0); document.activeElement.blur(); window.rpm.app.goRoom("today")');
await tab.key('ArrowLeft', 'ArrowLeft');
await wait(400);
assert.equal(await tab.eval('window.rpm.app.room'), 'week');
await tab.key('ArrowDown', 'ArrowDown');
await wait(400);
assert.equal(await tab.eval('window.rpm.app.room'), 'inbox');
await shot(tab, '07-walked-to-inbox');

console.log('5. Drag an Inbox plate up to the top edge, let the map scroll, drop it on Wednesday in the Week');
const from = await pointAt('[data-room="inbox"] .plate[data-task="24"] .plate-title');
await mouse('mousePressed', from);
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', [from[0], from[1] - (from[1] - 40) * i / 6]);
await wait(2500);
const to = await pointAt('.day[data-drop-day="2026-10-21"]');
assert.ok(to[1] > 120, 'the Week scrolled into view while dragging');
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', [from[0] + (to[0] - from[0]) * i / 6, 40 + (to[1] - 40) * i / 6]);
assert.equal(await tab.eval(`document.querySelector('.day[data-drop-day="2026-10-21"]').hasAttribute('data-drop-hover')`), true);
await shot(tab, '08-dragging');
await mouse('mouseReleased', to);
await wait(PHONE_MS);
assert.equal((await task(24)).plannedDate, '2026-10-21');
await shot(tab, '09-dropped-on-wednesday');

console.log('6. Enter opens the task; Esc closes it');
await tab.eval(`document.querySelector('.lead .plate-open').focus()`);
await tab.key('Enter', 'Enter', {windowsVirtualKeyCode: 13, text: '\r'});
await wait(300);
assert.equal(await tab.eval(`document.getElementById('sheet').matches(':popover-open')`), true);
await shot(tab, '10-task-sheet');
await tab.key('Escape', 'Escape', {windowsVirtualKeyCode: 27});
await wait(300);
assert.equal(await tab.eval(`document.getElementById('sheet').matches(':popover-open')`), false);

if (tab.problems.length) console.log('Console problems:\n' + tab.problems.join('\n'));
assert.equal(tab.problems.length, 0, 'no console errors or warnings');
console.log('Flow passed.');
await tab.close();
