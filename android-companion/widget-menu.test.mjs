import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoldGesture} from './widget-menu.mjs';
function fixture(){let timer,opened=0;const g=createHoldGesture(()=>opened++,{setTimer:fn=>(timer=fn,1),clearTimer:()=>timer=null});return {g,fire:()=>timer?.(),opened:()=>opened};}
test('short tap remains a single send click',()=>{const {g,fire,opened}=fixture();g.down(0,0);g.up();fire();assert.equal(opened(),0);assert.equal(g.consumeClick(),false);});
test('hold opens options and suppresses release click',()=>{const {g,fire,opened}=fixture();g.down(0,0);fire();g.up();assert.equal(opened(),1);assert.equal(g.consumeClick(),true);assert.equal(g.consumeClick(),false);});
test('drag away cancels hold and prevents accidental send',()=>{const {g,fire,opened}=fixture();g.down(0,0);g.move(20,0);fire();g.up();assert.equal(opened(),0);assert.equal(g.consumeClick(),true);});
test('cancelled touch cannot open menu or send',()=>{const {g,fire,opened}=fixture();g.down(0,0);g.cancel();fire();assert.equal(opened(),0);assert.equal(g.consumeClick(),true);});
test('next intentional tap works after a hold',()=>{const {g,fire}=fixture();g.down(0,0);fire();g.up();g.consumeClick();g.down(0,0);g.up();assert.equal(g.consumeClick(),false);});
