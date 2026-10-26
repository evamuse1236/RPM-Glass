import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {alsoHeard} from './capture-cards.mjs';

installFakeDom();
test('a kept idea offers Undo with a specific Inbox removal name',()=>{
 const note={sourceId:'s0',disposition:'idea',note:'Try a cooking class',keptTaskId:1},capture={notes:[note]},calls=[];
 const row=alsoHeard(capture,{keepNote:(...args)=>calls.push(args)}),button=row.querySelector('button');
 assert.equal(button.textContent,'Undo');assert.equal(button.getAttribute('aria-label'),'Take “Try a cooking class” out of the Inbox');
 assert.match(row.textContent,/In your Inbox/);button.click();assert.deepEqual(calls,[[capture,note,false]]);
});
