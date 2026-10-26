import test from 'node:test';
import assert from 'node:assert/strict';
import {IntentHarness} from '../src/harness.mjs';
import {createRepository,createMemoryBackend} from '../src/repository.mjs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {turn} from './helpers.mjs';

test('calendar reading overlaps the model and finishes before ready',async()=>{
 const seed=freshStore(),events=[];let release;
 const calendarReady=new Promise(r=>release=r);
 const harness=new IntentHarness({repository:createRepository(createMemoryBackend(seed)),applyPlan:async()=>{},
  snapshot:()=>{events.push('calendar-start');return {summary:{},entities:[],calendarReady};},
  model:async()=>{events.push('model');return turn('Call mom because I miss her',[],{draftMode:'none'});},
  onEvent:e=>events.push(e.type)});
 const pending=harness.capture({messageId:'parallel',conversationId:seed.conversations[0].id,text:'Call mom because I miss her'});
 await new Promise(r=>setImmediate(r));
 assert.ok(events.indexOf('model')>events.indexOf('calendar-start'));assert.ok(!events.includes('ready'));
 release();await pending;assert.ok(events.includes('ready'));
});
