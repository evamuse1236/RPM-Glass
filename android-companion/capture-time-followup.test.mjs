import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime} from '../cli/interpret.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';

const now=new Date('2026-10-19T04:30:00Z');
test('spoken clocks with a stated part of day need no preceding at',()=>{
 for(const [text,hour] of [['tomorrow seven in the evening',19],['eleven in the morning',11]]){
  const result=interpretTime(text,now);
  assert.equal(result.status,'parsed',text);
  assert.equal(new Date(result.planned).getHours(),hour);
 }
 assert.equal(interpretTime('eleven books in the morning',now).planned,null);
});

test('a spoken clock-only follow-up keeps a saved date without asking again',async()=>{
 const data=freshStore();editPlan(data,{type:'saveTask',fields:{title:'Email rent receipt',plannedDate:'2026-10-20'}},now);
 const raw='It needs to go at eleven in the morning',backend=createMemoryBackend(data);
 const service=createIntentService({backend,model:async()=>turn(raw,[operation([field('time','eleven in the morning','eleven in the morning')],{kind:'update',targetId:'1'})]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'ready',start:0,end:Date.parse('2027-01-01'),events:[]}),clock:()=>now});
 const traces=createTraceStore({storage:{getItem:()=>null,setItem:()=>{}}}),agent=createCaptureAgent({service,traces,clock:()=>now});
 const result=await agent.capture({messageId:'spoken-followup',conversationId:data.conversations[0].id,text:raw});
 assert.equal(result.applied.status,'applied');
 assert.equal((await backend.load()).entries[0].planned,'2026-10-20T05:30:00.000Z');
});

for(const [phrase,expected] of [
 ['this evening at 7','2026-10-19T13:30:00.000Z'],
 ['this morning at 11','2026-10-19T05:30:00.000Z'],
 ['tonight at 7','2026-10-19T13:30:00.000Z'],
 ['aaj shaam 7 baje','2026-10-19T13:30:00.000Z'],
 ['aaj subah 11 baje','2026-10-19T05:30:00.000Z'],
 ['in the evening at 7','2026-10-21T13:30:00.000Z'],
 ['in the morning at 11','2026-10-21T05:30:00.000Z'],
])test(`a saved future day respects the day choice in ${phrase}`,async()=>{
 const data=freshStore();editPlan(data,{type:'saveTask',fields:{title:'Email rent receipt',plannedDate:'2026-10-21'}},now);
 const raw='Move it to '+phrase,backend=createMemoryBackend(data);
 const service=createIntentService({backend,model:async()=>turn(raw,[operation([field('time',phrase,phrase)],{kind:'update',targetId:'1'})]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'ready',start:0,end:Date.parse('2027-01-01'),events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'current-day',conversationId:data.conversations[0].id,text:raw});
 assert.equal(result.applied?.status,'applied');
 const saved=await backend.load();assert.equal(saved.entries[0].planned,expected);assert.equal(saved.intentV2.captures['current-day'].raw,raw);
});

test('bare numeric and spoken clock corrections retain the saved future day',async()=>{
 for(const [phrase,time] of [['at 7','19:00'],['five thirty','17:30']]){
  const data=freshStore();editPlan(data,{type:'saveTask',fields:{title:'Email rent receipt',plannedDate:'2026-10-21'}},now);
  const raw='Move it to '+phrase,backend=createMemoryBackend(data);
  const service=createIntentService({backend,model:async()=>turn(raw,[operation([field('time',phrase,phrase)],{kind:'update',targetId:'1'})]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'ready',start:0,end:Date.parse('2027-01-01'),events:[]}),clock:()=>now});
  const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
  const result=await agent.capture({messageId:'bare-future',conversationId:data.conversations[0].id,text:raw});assert.equal(result.applied.status,'applied');
  assert.equal((await backend.load()).entries[0].planned,new Date(`2026-10-21T${time}:00+05:30`).toISOString(),phrase);
  const help=(await service.view()).captures[0].draft.nextStep;
  assert.ok(help.label.includes('AM'));assert.equal(help.action.at.slice(0,10),'2026-10-21');
  await agent.act(help.action,{actionId:actionIdFor(help.action)});
  assert.equal((await backend.load()).entries[0].planned,new Date(`2026-10-21T${phrase==='at 7'?'07:00':'05:30'}:00+05:30`).toISOString());
  await agent.undo({draftId:`draft-${actionIdFor(help.action)}`,conversationId:data.conversations[0].id,actionId:'undo-flip'});
  assert.equal((await backend.load()).entries[0].planned,new Date(`2026-10-21T${time}:00+05:30`).toISOString());
 }
});
