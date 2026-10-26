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
function phone(model,seed=freshStore()){
 const backend=createMemoryBackend(seed),conversationId=seed.conversations[0].id;
 const service=createIntentService({backend,model,changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 return {backend,service,agent,conversationId,send:text=>agent.capture({messageId:'m',conversationId,text})};
}

for(const restored of [false,true])test(`three keep-note taps keep one idea and its ledger: restored=${restored}`,async()=>{
 const raw='What if I offer my Hermes agent for Rs 2000 a month?',note='Offer my Hermes agent for Rs 2000 a month';
 const seed=freshStore(),id=restored?editPlan(seed,{type:'saveTask',fields:{title:note}},now):1;
 if(restored)Object.assign(seed.entries[0],{source:'intent-v2-note',sourceMessageId:'m',raw});
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
 const result=await p.send(raw);let data=await p.backend.load();
 assert.equal(data.entries.length,1);
 if(!matchingDay){
  assert.equal(result.applied.status,'needs-check');assert.equal(data.entries[0].plannedDate,'2026-10-26');
  const draft=(await p.service.view()).captures[0].draft;assert.match(draft.reply,/review/i);
  await p.agent.act(draft.actions.find(a=>a.action.kind==='commit').action,{actionId:'review-day'});
  data=await p.backend.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].plannedDate,'2026-10-27');
 }
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

test('keep-note reuse stays inside its original message',async()=>{
 const raw='What if I offer tutoring?',note='Offer tutoring';
 const p=phone(async()=>turn(raw,[],{mode:'reflect',draftMode:'none',reply:'An idea to keep.',decisions:[{sourceId:'s0',disposition:'idea',note}]}));
 await p.send(raw);const first=await p.service.keepNote({messageId:'m',sourceId:'s0',actionId:'keep-a'});
 await p.agent.capture({messageId:'b',conversationId:p.conversationId,text:raw});
 const second=await p.service.keepNote({messageId:'b',sourceId:'s0',actionId:'keep-b'});
 assert.notEqual(first.taskId,second.taskId);assert.equal((await p.backend.load()).entries.length,2);
 await p.service.keepNote({messageId:'b',sourceId:'s0',keep:false,actionId:'unkeep-b'});
 const data=await p.backend.load();assert.equal(data.entries.find(e=>e.id===first.taskId).archived,false);
 assert.equal(data.entries.find(e=>e.id===second.taskId).archived,true);
 const captures=(await p.service.view()).captures;
 assert.equal(captures.find(c=>c.messageId==='m').notes[0].keptTaskId,first.taskId);
 assert.equal(captures.find(c=>c.messageId==='b').notes[0].keptTaskId,null);
});

for(const [raw,time,title,minutes] of [
 ['Task tomorrow from 11am to 1230','tomorrow from 11am to 1230','Task',90],
 ['Task tomorrow from 11pm to 1230','tomorrow from 11pm to 1230','Task',90],
])test(`Capture saves and shows the shortest range: ${raw}`,async()=>{
 const p=phone(async()=>turn(raw,[operation([field('title',title,title),field('time',time,time)])]));
 const result=await p.send(raw),data=await p.backend.load();assert.equal(result.applied.status,'applied');
 assert.equal(data.entries[0].minutes,minutes);assert.equal(data.entries[0].raw,raw);
 const card=(await p.service.view()).captures[0];assert.match(card.reply,/90 min/);assert.equal(card.draft.lines[0].title,title);
});
for(const evidence of ['source','now'])for(const raw of ['Keep it in the inbox for now','From now on drink more water','Not now','Until now I forgot to call'])test(`Capture cannot save idiomatic now as a start: ${raw} / ${evidence}`,async()=>{
 const p=phone(async()=>turn(raw,[operation([field('title','Thought',raw),field('time','now',evidence==='source'?raw:'now')])]));
 const result=await p.send(raw),data=await p.backend.load();assert.equal(result.applied.status,'applied');
 assert.equal(data.entries[0].planned,null);assert.equal(data.entries[0].raw,raw);
 const card=(await p.service.view()).captures[0];assert.match(card.reply+' '+card.draft.applied.warning,/time.*not applied/i);
});
