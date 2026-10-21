import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime,normalizeReminderTime} from '../cli/interpret.mjs';
import {validateIntentTimes} from './intent-time-guard.mjs';
import {interpretTurn} from '../intent-v2/src/interpret.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {resolvePlannerTime} from './planner-tools.mjs';

const now=new Date('2026-10-19T04:30:00Z');
const cases=[['set a reminder in 5','in 5',5],['remind me in 5','in 5 minutes',5],['set a reminder in 5 mins to call mom','in 5 mins',5],['alarm in 10','in 10',10],['in 20 minutes remind me to drink water','in 20 minutes',20],['5 min baad yaad dilana','5 min baad',5],['set a reminder in 2 hours','in 2 hours',120]];
for(const [raw,time,minutes] of cases)test(`${raw} keeps its relative time through the real guard, preview and apply`,async()=>{
 const backend=createMemoryBackend(freshStore());
 const op=operation([field('title','Reminder',null,'suggested'),field('time',time,raw),field('alert',raw.startsWith('alarm')?'alarm':'reminder',raw)]);
 const model=async()=>turn(raw,[op]);
 const service=createIntentService({backend,model,changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'m',conversationId:(await backend.load()).conversations[0].id,text:raw});
 assert.equal(result.applied.status,'applied');
 const data=await backend.load();assert.equal(data.entries[0].planned,new Date(+now+minutes*60000).toISOString());
 assert.equal(data.intentV2.captures.m.raw,raw);
});
test('bare relative minutes are scoped to reminders and explicit units win',()=>{
 assert.equal(interpretTime(normalizeReminderTime('in 5'),now).planned,new Date(+now+5*60000).toISOString());
 assert.equal(interpretTime('in 5',now,{evidence:'finish this in 5'}).status,'none');
 for(const time of ['in 5 days','in 5 hours','in 5 weeks'])assert.ok(!interpretTime(time,now,{evidence:'remind me '+time}).normalized.includes('minutes'));
 assert.equal(interpretTime('at 6',now,{evidence:'remind me at 6',inferBareClock:true}).inference.rule,'next-12h');
});
test('relative provenance cannot authorize an invented clock or a different delay',()=>{
 const raw='remind me in 5',input={messageId:'m',sourceUnits:[{text:raw}],context:{now:now.toISOString(),entities:[]}};
 const parsed={mode:'capture',operations:[operation([field('time','in 10 minutes','in 5')])]};
 assert.throws(()=>validateIntentTimes(parsed,{input}),{code:'UNSUPPORTED_TIME'});
});
test('an absent or unresolved subject becomes a generic title without blocking its reminder',()=>{
 for(const alert of ['reminder','alarm']){
  const raw=`set a ${alert} in 5`,op=operation([field('title',null,null,'stated','unknown'),field('time','in 5','in 5'),field('alert',alert,alert)]);
  const output=turn(raw,[op],{question:{opId:op.opId,field:'title',prompt:'What is it for?',options:[]}});
  const parsed=interpretTurn(output,{units:[{id:'s0',text:raw}],messageId:'m',visibleEntities:[]});
  assert.equal(parsed.operations[0].fields.find(f=>f.name==='title').value,alert==='alarm'?'Alarm':'Reminder');assert.equal(parsed.question,null);
 }
});
test('tomorrow morning remains a day without inventing a clock',()=>{
 const time=interpretTime('tomorrow morning',now);assert.equal(time.status,'date_only');assert.equal(time.plannedDate,'2026-10-20');assert.equal(time.planned,null);
});
test('another action cannot authorize bare relative minutes on a task without an alert',()=>{
 const raw='finish report in 5. Set a reminder at 6pm',data=freshStore();
 const preview=resolvePlannerTime(data,{title:'finish report',time:'in 5',evidence:['in 5']},{raw,conversationId:data.conversations[0].id,now});
 assert.equal(preview.status,'review');
});
test('moving a saved reminder also reads bare in 5 as minutes from now',async()=>{
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Call Mom',planned:'2026-10-20T13:00:00Z',alert:'reminder'}},now);
 const targetId=String(seed.entries[0].id),raw='move Call Mom to in 5';
 const backend=createMemoryBackend(seed),service=createIntentService({backend,model:async()=>turn(raw,[operation([field('time','in 5','in 5')],{kind:'update',targetId})]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'move',conversationId:seed.conversations[0].id,text:raw});assert.equal(result.applied.status,'applied');
 assert.equal((await backend.load()).entries[0].planned,new Date(+now+5*60000).toISOString());
});
test('Undo of an overlapping reminder never restores the adapter approval as a pending user proposal',async()=>{
 const seed=freshStore(),raw='alarm in 10';
 editPlan(seed,{type:'saveTask',fields:{title:'Reminder',planned:new Date(+now+5*60000).toISOString(),minutes:30}},now);
 const backend=createMemoryBackend(seed),service=createIntentService({backend,model:async input=>turn(input.sourceUnits.map(u=>u.text).join(' '),[]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now}),conversationId=seed.conversations[0].id;
 const result=await agent.capture({messageId:'alarm',conversationId,text:raw});assert.equal(result.applied.status,'applied');
 await agent.undo({draftId:result.draftId,conversationId,actionId:'undo-alarm'});
 assert.equal((await backend.load()).pending,null);
 await agent.capture({messageId:'next',conversationId,text:'remind me at 6'});
 const card=(await service.view()).captures[0];assert.equal(card.draft.status,'committed');assert.equal(card.draft.question,null);
 const data=await backend.load();assert.equal(data.pending,null);assert.equal(data.entries.length,2);
});
