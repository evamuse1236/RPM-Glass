import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installFakeDom} from './fake-dom.mjs';
import {showCountdown,stopCountdown} from './capture-cards.mjs';

installFakeDom();

// CI 2026-10-31: a tap on the Time chip cleared "Closing in 6s", the Undo row unwrapped,
// the card slid 42px down mid-tap and the tap opened the title instead.
test('a touch hides the countdown but keeps its words, so the card keeps its size', () => {
 const node=document.createElement('span');
 showCountdown(node,6);
 assert.equal(node.textContent,'Closing in 6s');
 stopCountdown(node);
 assert.equal(node.textContent,'Closing in 6s','the words stay and hold their space');
 assert.ok(node.classList.contains('stopped'));
 showCountdown(node,5);
 assert.ok(!node.classList.contains('stopped'),'a new countdown shows again');
});

test('a stopped countdown is hidden with visibility, never removed from layout', () => {
 const css=readFileSync(new URL('./capture-cards.css',import.meta.url),'utf8');
 assert.match(css,/\.countdown\.stopped\{visibility:hidden\}/);
 const app=readFileSync(new URL('./capture-app.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(app,/countdown[^;]*textContent=''/,'Capture never empties the countdown on a touch');
});
