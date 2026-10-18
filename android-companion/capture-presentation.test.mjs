import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevealTracker} from './capture-presentation.mjs';

test('history and repeated renders do not replay a completed reveal',()=>{
 const t=createRevealTracker();t.observe('history');assert.equal(t.settle('history'),false);
 t.begin();assert.equal(t.settle('fresh'),true);assert.equal(t.settle('fresh'),false);
 t.begin();assert.equal(t.settle('fresh'),false);
});
test('a failed request leaves the eventual response eligible for one reveal',()=>{
 const t=createRevealTracker();t.begin();assert.equal(t.settle('answer',{failed:true}),false);
 t.begin();assert.equal(t.settle('answer'),true);assert.equal(t.settle('answer'),false);
});
test('an empty or missing reply cannot animate',()=>{
 const t=createRevealTracker();t.begin();assert.equal(t.settle(null),false);
 assert.equal(t.settle('unexpected'),false);
});
