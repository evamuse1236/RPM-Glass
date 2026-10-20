import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';

const NOW=new Date('2026-10-19T04:30:00Z');
const calendar={status:'ready',start:+NOW-86400000,end:+NOW+86400000,events:[]};
async function setup(raw,operations,{calendarValue=calendar,seed=freshStore()}={}){
 const backend=createMemoryBackend(seed);let calls=0,currentCalendar=calendarValue;
 const service=createIntentService({backend,model:async input=>{
  calls++;
  if(input.activeDraft?.question?.field==='title')return turn(input.sourceUnits.map(u=>u.text).join(' '),[operation([field('title','Call Mom','Call Mom')],{opId:'next',kind:'update',targetId:input.activeDraft.operations[0].targetId})],{draftMode:'amend'});
  return turn(raw,operations);
 },changePlanner,editPlan,undo,readCalendar:async()=>currentCalendar,clock:()=>NOW});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>NOW});
 const conversationId=(await backend.load()).conversations[0].id;
 await agent.capture({messageId:'m',conversationId,text:raw});
 return {backend,service,agent,conversationId,get calls(){return calls;},setCalendar:value=>{currentCalendar=value;},card:async()=> (await service.view()).captures[0]};
}
test('Name it follows a saved reminder, binds its ID, and never replays the original create',async()=>{
 const raw='remind me in 5',s=await setup(raw,[operation([field('title','Reminder',null,'suggested'),field('time','in 5','in 5'),field('alert','reminder','remind me')])]);
 let c=await s.card();assert.equal(c.draft.status,'committed');assert.equal(c.draft.question,null);assert.equal(c.draft.nextStep.label,'Name it');
 const action=c.draft.nextStep.action,id=actionIdFor(action);assert.ok(id.length<160);
 await s.agent.act(action,{actionId:id});assert.equal(s.calls,0);
 c=await s.card();assert.equal(c.raw,'Name it');assert.equal(c.draft.question.field,'title');
 assert.equal((await s.backend.load()).entries.length,1);
 await s.agent.capture({messageId:'name',conversationId:s.conversationId,text:'Call Mom'});
 const data=await s.backend.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].title,'Call Mom');assert.equal(data.entries[0].alertIntent.type,'reminder');
 await s.agent.undo({draftId:(await s.card()).draft.id,conversationId:s.conversationId,actionId:'undo-name'});
 assert.equal((await s.backend.load()).entries[0].title,'Reminder');
});
test('next free slot changes only time on tap and still uses canonical Undo',async()=>{
 const raw='Buy apples',s=await setup(raw,[operation([field('title',raw,raw)])]);
 const c=await s.card(),a=c.draft.nextStep.action,callsBeforeTap=s.calls;
 assert.equal(a.step,'schedule');assert.equal((await s.backend.load()).entries[0].planned,null);
 await s.agent.act(a,{actionId:actionIdFor(a)});
 const data=await s.backend.load();assert.equal(data.entries[0].planned,a.at);assert.equal(data.entries[0].minutes,null);assert.equal(data.entries.length,1);assert.equal(s.calls,callsBeforeTap);
 assert.equal(Object.values(data.intentV2.captures).at(-1).raw,`Schedule Buy apples at ${a.at}`);
 await s.agent.undo({draftId:(await s.card()).draft.id,conversationId:s.conversationId,actionId:'undo-slot'});
 assert.equal((await s.backend.load()).entries[0].planned,null);
 assert.equal((await s.service.view()).captures.find(c=>c.messageId==='m').draft.nextStep,null);
 await assert.rejects(s.agent.act(a,{actionId:actionIdFor(a)}),/changed/);
});
test('an invented or stale next-step tap changes nothing',async()=>{
 const raw='Buy apples for 30 minutes',s=await setup(raw,[operation([field('title','Buy apples','Buy apples'),field('minutes',30,'for 30 minutes')])]);
 const a=(await s.card()).draft.nextStep.action,before=await s.backend.load();
 await assert.rejects(s.agent.act({...a,targetId:'999'},{actionId:'fake'}),/changed/);
 assert.deepEqual(await s.backend.load(),before);
 s.setCalendar({...calendar,events:[{title:'New meeting',start:Date.parse(a.at),end:Date.parse(a.at)+3600000}]});
 await assert.rejects(s.agent.act(a,{actionId:'stale'}),/no longer available/);
 assert.deepEqual(await s.backend.load(),before);
});
test('unknown calendar coverage never produces a claimed free slot',async()=>{
 const raw='Buy apples',s=await setup(raw,[operation([field('title',raw,raw)])],{calendarValue:{status:'unavailable',events:[]}});
 assert.equal((await s.card()).draft.nextStep,null);
});
test('water receipt shows the saved count and next due time without another task or chip',async()=>{
 const raw='drank water',s=await setup(raw,[operation([field('title','Water',null,'suggested'),field('count',1,raw)],{entity:'water'})]);
 const card=await s.card();assert.match(card.draft.nextStep.text,/1 of 8 glasses today.*11:30 AM/);assert.equal(card.draft.nextStep.action,null);assert.equal((await s.backend.load()).entries.length,0);
});
test('drank water logs one glass even when the model asks for a count in prose',async()=>{
 const s=await setup('drank water',[]),card=await s.card();
 assert.equal(card.draft.status,'committed');assert.equal(card.draft.question,null);
 assert.match(card.draft.nextStep.text,/1 of 8 glasses today.*11:30 AM/);
});
test('water receipt still reads the calendar before naming the next nudge',async()=>{
 const busy={...calendar,events:[{title:'Busy',start:Date.parse('2026-10-19T11:00:00+05:30'),end:Date.parse('2026-10-19T13:00:00+05:30')}]};
 const s=await setup('drank water',[],{calendarValue:busy});
 assert.match((await s.card()).draft.nextStep.text,/Next nudge at 1:00 PM/);
});
