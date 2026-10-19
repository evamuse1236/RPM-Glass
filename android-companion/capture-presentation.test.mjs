import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevealTracker,choicesScrollTop} from './capture-presentation.mjs';

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
test('choices below the visible edge scroll up just enough to show them',()=>{
 assert.equal(choicesScrollTop({top:100,bottom:400},{top:380,bottom:500},0),100);
 assert.equal(choicesScrollTop({top:100,bottom:400},{top:200,bottom:300},40),40);
});
test('choices taller than the box keep their first row at the top',()=>{
 assert.equal(choicesScrollTop({top:100,bottom:300},{top:350,bottom:700},10),260);
});
test('choices scrolled above the box come back into view',()=>{
 assert.equal(choicesScrollTop({top:100,bottom:400},{top:60,bottom:120},80),40);
});
