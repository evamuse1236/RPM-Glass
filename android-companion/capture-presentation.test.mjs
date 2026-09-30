import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevealTracker,menuGeometry} from './capture-presentation.mjs';

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
test('menu stays eight pixels above growing composer and inside panel',()=>{
 for(const height of [260,460,760])for(const composerHeight of [104,156]){
  const panel={bottom:height+50,height},composer={top:height+50-composerHeight};
  const g=menuGeometry(panel,composer);
  assert.equal(g.bottom,composerHeight+8);assert.ok(g.maxHeight>=0);
  assert.equal(height-g.bottom-g.maxHeight,8);
 }
});
test('no negative menu height when keyboard leaves too little room',()=>{
 assert.equal(menuGeometry({bottom:200,height:100},{top:90}).maxHeight,0);
});
