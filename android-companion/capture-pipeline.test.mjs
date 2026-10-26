import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';

const now=new Date(2026,9,26,10,13);
function phone(model,seed=freshStore(),onEvent=()=>{}){
 const memory=createMemoryBackend(seed),counts={loads:0,saves:0},backend={load:()=>{counts.loads++;return memory.load();},save:(...args)=>{counts.saves++;return memory.save(...args);}},conversationId=seed.conversations[0].id;
 const service=createIntentService({backend,model,onEvent,changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 return {backend,counts,service,agent,conversationId,send:text=>agent.capture({messageId:'m',conversationId,text})};
}

for(const restored of [false,true])test(`three keep-note taps keep one idea and its ledger: restored=${restored}`,async()=>{
 const raw='What if I offer my Hermes agent for Rs 2000 a month?',note='Offer my Hermes agent for Rs 2000 a month';
 const seed=freshStore(),id=restored?editPlan(seed,{type:'saveTask',fields:{title:note}},now):1;
 if(restored)Object.assign(seed.entries[0],{source:'intent-v2-note',raw});
 const p=phone(async()=>turn(raw,[],{mode:'reflect',draftMode:'none',reply:'An idea to keep.',decisions:[{sourceId:'s0',disposition:'idea',note}]}),seed);
 await p.send(raw);
 const kept=await Promise.all(['one','two','three'].map(actionId=>p.service.keepNote({messageId:'m',sourceId:'s0',actionId})));
 assert.deepEqual(kept.map(r=>r.taskId),[id,id,id]);
 const data=await p.backend.load();assert.equal(data.entries.filter(e=>!e.archived).length,1);
 assert.equal(data.intentV2.captures.m.keptNotes.s0,id);assert.equal(data.entries[0].raw,raw);
 await p.service.keepNote({messageId:'m',sourceId:'s0',keep:false,actionId:'unkeep'});
 assert.equal((await p.backend.load()).entries[0].archived,true);
});

test('Already on your list cannot discard Exercise now when only Exercise today is saved',async()=>{
 const raw='Exercise now for 30 min',seed=freshStore();
 editPlan(seed,{type:'saveTask',fields:{title:'Exercise today'}},now);
 const p=phone(async()=>turn(raw,[],{draftMode:'none',reply:'',decisions:[{sourceId:'s0',disposition:'existing',note:'Already on your list: Exercise'}]}),seed);
 const result=await p.send(raw);assert.equal(result.applied.status,'applied');
 const data=await p.backend.load();assert.equal(data.entries.length,2);
 assert.equal(data.entries[1].title,'Exercise');assert.equal(data.entries[1].planned,now.toISOString());
 assert.equal(data.entries[1].minutes,30);assert.equal(data.entries[1].raw,raw);
 await p.agent.undo({draftId:result.draftId,conversationId:p.conversationId,actionId:'undo-exercise'});
 assert.equal((await p.backend.load()).entries.length,1);
});
for(const matchingDay of [false,true])test(`an existing note needs the exact title and stated day: matching=${matchingDay}`,async()=>{
 const raw='Exercise tomorrow',seed=freshStore();
 editPlan(seed,{type:'saveTask',fields:{title:'Exercise',plannedDate:matchingDay?'2026-10-27':'2026-10-26'}},now);
 const p=phone(async()=>turn(raw,[],{draftMode:'none',reply:'',decisions:[{sourceId:'s0',disposition:'existing',note:'Already on your list: Exercise'}]}),seed);
 await p.send(raw);const data=await p.backend.load();
 assert.equal(data.entries.length,matchingDay?1:2);
 if(!matchingDay)assert.equal(data.entries[1].plannedDate,'2026-10-27');
});

for(const [raw,delay] of [['set an alarm in the next 1 minute',1],['set alarm in 5 minutes',5],['alarm 5 min',5]])test(`short alarm saves without asking its subject: ${raw}`,async()=>{
 let calls=0;const p=phone(async()=>{calls++;return turn(raw,[],{draftMode:'none',reply:'What should it ring for?'});});
 const result=await p.send(raw);assert.equal(calls,0);assert.equal(result.applied.status,'applied');
 const data=await p.backend.load();assert.equal(data.entries[0].title,'Alarm');
 assert.equal(data.entries[0].planned,new Date(+now+delay*60000).toISOString());
 assert.equal(data.entries[0].alertIntent.type,'alarm');assert.equal(data.entries[0].raw,raw);
});

for(const [raw,title,time,minutes,planned] of [
 ['Meeting from 10am to 11am','Meeting','from 10am to 11am',47,now.toISOString()],
 ['Exercise now 30 min','Exercise','now',30,now.toISOString()],
 ['Task from 12 am to 1210','Task','from 12 am to 1210',10,new Date(2026,9,27).toISOString()],
])test(`the Capture receipt saves the supported range: ${raw}`,async()=>{
 const p=phone(async()=>turn(raw,[operation([field('title',title,title),field('time',time,time),field('minutes',minutes,raw)])]));
 const result=await p.send(raw);assert.equal(result.applied.status,'applied');
 const data=await p.backend.load();assert.equal(data.entries[0].planned,planned);
 assert.equal(data.entries[0].minutes,minutes);assert.equal(data.entries[0].raw,raw);
 await p.agent.undo({draftId:result.draftId,conversationId:p.conversationId,actionId:'undo-range'});
 assert.equal((await p.backend.load()).entries.length,0);
});

for(const modelNeeded of [false,true])test(`one capture loads the bridge once and preserves words and Undo: model=${modelNeeded}`,async()=>{
 const raw=modelNeeded?'Call mom because I miss her':'call mom at 8pm';
 const p=phone(async()=>turn(raw,[operation([field('title','Call mom','Call mom')]) ]));
 const result=await p.send(raw);
 assert.equal(result.applied.status,'applied');
 assert.equal(p.counts.loads,1);assert.equal(p.counts.saves,4);
 const saved=await p.backend.load();assert.equal(saved.intentV2.captures.m.raw,raw);assert.equal(saved.entries[0].raw,raw);
 await p.agent.undo({draftId:result.draftId,conversationId:p.conversationId,actionId:'undo-count'});
 assert.equal((await p.backend.load()).entries.length,0);
});

for(const valid of [false,true])test(`streamed partials never save before final validation: valid=${valid}`,async()=>{
 const raw='Call mom because I miss her',events=[];
 let p;p=phone(async(input,{onPartial})=>{
  const output=turn(raw,[operation([field('title','Call mom','Call mom')])]);
  const data=await p.backend.load();assert.equal(data.intentV2.captures.m.raw,raw);assert.equal(data.entries.length,0);
  const text=JSON.stringify(output);onPartial(text.slice(0,-2));onPartial(text);
  assert.equal((await p.backend.load()).entries.length,0);
  return valid?output:{};
 },freshStore(),e=>events.push(e));
 const result=await p.send(raw),data=await p.backend.load();
 assert.equal(events.filter(e=>e.type==='ready').length,valid?1:0);
 assert.ok(events.some(e=>e.type==='partial'));
 const first=events.find(e=>e.type==='partial');assert.deepEqual(Object.keys(first),['type','messageId','operations']);
 assert.equal(first.messageId,'m');assert.equal(first.operations[0].title,'Call mom');
 assert.equal(data.intentV2.captures.m.raw,raw);assert.equal(data.entries.length,valid?1:0);
 if(valid){assert.equal(result.applied.status,'applied');await p.agent.undo({draftId:result.draftId,conversationId:p.conversationId,actionId:'undo-stream'});assert.equal((await p.backend.load()).entries.length,0);}
 else assert.equal(result.status,'captured');
});
