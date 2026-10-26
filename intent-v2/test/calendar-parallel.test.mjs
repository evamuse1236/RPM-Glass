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

for(const finishBeforeModel of [true,false])test(`the model sees the snapshot calendar copy, refresh before model=${finishBeforeModel}`,async()=>{
 const {planSnapshot}=await import('../../android-companion/capture-snapshot.mjs');
 const {NOW}=await import('./helpers.mjs');
 const seed=freshStore(),repository=createRepository(createMemoryBackend(seed)),now=new Date(NOW);
 const event=title=>({id:title,title,start:+now+3600000,end:+now+7200000});
 let calendar=[event('Cached dentist')],release,seen;
 const refresh=new Promise(r=>release=r).then(()=>{calendar=[event('Fresh dentist')];});
 const harness=new IntentHarness({repository,clock:()=>now,applyPlan:async()=>{},
  snapshot:async({data})=>{
   const plan={...planSnapshot(data,{now,events:calendar}),calendarReady:refresh};
   if(finishBeforeModel){release();await refresh;}
   return plan;
  },
  model:async input=>{seen=JSON.parse(JSON.stringify(input));release();return turn('What is on my calendar?',[],{mode:'query',draftMode:'none',reply:input.snapshot.calendarComing[0].title});}});
 await harness.capture({messageId:'copy',conversationId:seed.conversations[0].id,text:'What is on my calendar?'});
 assert.deepEqual(seen.snapshot.calendarComing.map(e=>e.title),['Cached dentist']);
 assert.deepEqual(calendar.map(e=>e.title),['Fresh dentist']);
 assert.equal((await repository.load()).intentV2.captures.copy.reply,'Cached dentist');
});
