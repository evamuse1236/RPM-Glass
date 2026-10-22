import test from 'node:test';
import fs from 'node:fs';
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

test('a Capture card list that overflows fades only the edge with more cards, so a cut card reads as scrollable',()=>{
  const css=fs.readFileSync(new URL('./capture-cards.css',import.meta.url),'utf8');
  assert.match(css,/@keyframes cards-edges\{from\{--fade-start:0px;--fade-end:24px\}.*to\{--fade-start:24px;--fade-end:0px\}\}/);
  assert.match(css,/\.cards\{animation:cards-edges linear both;animation-timeline:scroll\(self block\);mask-image:linear-gradient\(to bottom,transparent,#000 var\(--fade-start\),#000 calc\(100% - var\(--fade-end\)\),transparent\)\}/);
});
