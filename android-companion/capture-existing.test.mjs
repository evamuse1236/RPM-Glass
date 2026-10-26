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
function phone(raw,title,{note=`Already on your list: ${title}`,reply='',mode='capture',sourceId='s0',operations=[],decisions=null}={}){
 const seed=freshStore();for(const t of Array.isArray(title)?title:title?[title]:[])editPlan(seed,{type:'saveTask',fields:typeof t==='string'?{title:t}:t},now);
 const backend=createMemoryBackend(seed),conversationId=seed.conversations[0].id;let calls=0;
 const model=async()=>{calls++;return turn(raw,operations,{mode,draftMode:operations.length?'new':'none',reply,decisions:decisions??[{sourceId,disposition:'existing',note},...(operations.length?[{sourceId:'s1',disposition:'action',note:null}]:[])]});};
 const service=createIntentService({backend,model,changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 return {backend,service,agent,conversationId,get calls(){return calls;},send:()=>agent.capture({messageId:'m',conversationId,text:raw})};
}
for(const [raw,title,options] of [
 ['Call mom about Diwali tickets','Call mom about the Diwali tickets',{note:'Already on your list: Call mom',reply:'Already saved.'}],
 ['Is buy milk on my list?','Buy milk and eggs',{mode:'query',note:'Already on your list: Buy milk',reply:'Yes, Buy milk and eggs is saved.'}],
 ['Is buy milk on my list?',null,{note:'Already on your list: Buy milk',reply:'I could not find it.'}],
 ['Is buying milk tomorrow a good idea',null,{note:'Already on your list: Is buying milk',reply:''}],
 ['I paid the electricity bill','Pay electricity bill',{mode:'reflect',note:'Already done: Pay electricity bill',reply:'That one is already done.'}],
 ['Exercise','Exercise',{note:null,reply:'Already on your list.'}],
])test(`an existing-item answer saves no duplicate or question: ${raw} / ${title}`,async()=>{
 const p=phone(raw,title,options);await p.send();const data=await p.backend.load();
 assert.equal(data.entries.length,title?1:0);assert.equal(p.calls,1);
 assert.equal((await p.service.view()).captures[0].reply,options.reply);
 assert.equal(data.intentV2.captures.m.draftId,null);
});

test('a duration mismatch reviews an update without saving a duplicate',async()=>{
 const p=phone('Exercise for 30 min','Exercise');const result=await p.send();
 let data=await p.backend.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].minutes,null);
 assert.equal(result.applied.status,'needs-check');const card=(await p.service.view()).captures[0];
 assert.match(card.reply,/review/i);assert.equal(card.draft.operations[0].kind,'update');
 const save=card.draft.actions.find(a=>a.action.kind==='commit');assert.ok(save);
 await p.agent.act(save.action,{actionId:'save-review'});data=await p.backend.load();
 assert.equal(data.entries.length,1);assert.equal(data.entries[0].minutes,30);
 await p.agent.undo({draftId:result.draftId,conversationId:p.conversationId,actionId:'undo'});
 assert.equal((await p.backend.load()).entries[0].minutes,null);
});

test('a missing existing source keeps words with a readable error and no repair',async()=>{
 const p=phone('Exercise','Exercise',{sourceId:'s9'});const result=await p.send();
 const data=await p.backend.load();assert.equal(data.entries.length,1);assert.equal(data.intentV2.captures.m.raw,'Exercise');
 assert.equal(p.calls,1);assert.match(result.error,/source/i);assert.doesNotMatch(result.error,/Something went wrong|TypeError/);
});

test('one existing unit leaves another action and its receipt intact',async()=>{
 const raw='Exercise today. Also buy bread.',p=phone(raw,'Exercise daily',{note:'Already on your list: Exercise',operations:[operation([field('title','Buy bread','buy bread')],{sourceId:'s1'})]});
 const result=await p.send(),data=await p.backend.load();assert.equal(result.applied.status,'applied');
 assert.deepEqual(data.entries.map(e=>e.title),['Exercise daily','Buy bread']);
 assert.ok((await p.service.view()).captures[0].draft.lines.some(l=>l.title==='Buy bread'));
});

for(const [raw,titles,note,expectedCount] of [
 ['Gym tomorrow',['Gym'],'Gym',1],
 ['Gym tomorrow at 6pm',['Gym class'],'Gym class',2],
 ['Gym at 6pm',['Gym','Gym'],'Gym',3],
 ['Exercise for 30 min',['Exercise'],'Exercise',1],
 ['Gym at 6pm',['Gym'],null,1],
])test(`existing answer retains stated schedule and length: ${raw} / ${titles}`,async()=>{
 const p=phone(raw,titles,{note:note?`Already on your list: ${note}`:null,reply:'Already saved.'});
 const result=await p.send();let data=await p.backend.load();
 assert.equal(p.calls,1);const card=(await p.service.view()).captures[0];
 assert.doesNotMatch(card.reply,/already saved/i);assert.ok(card.draft);
 if(expectedCount===1){
  assert.equal(result.applied.status,'needs-check');assert.equal(data.entries[0].planned,null);
  await p.agent.act(card.draft.actions.find(a=>a.action.kind==='commit').action,{actionId:'keep-new-details'});
 }else assert.equal(result.applied.status,'applied');
 data=await p.backend.load();assert.equal(data.entries.length,expectedCount);
 const saved=data.entries.at(-1);
 if(raw.includes('tomorrow'))assert.equal(saved.plannedDate??saved.planned?.slice(0,10),'2026-10-27');
 if(raw.includes('6pm'))assert.equal(new Date(saved.planned).getHours(),18);
 if(raw.includes('30 min'))assert.equal(saved.minutes,30);
});

test('a model create for a bare saved title does not duplicate it beside a new action',async()=>{
 const raw='Buy milk. Clear the table',p=phone(raw,'Buy milk',{reply:'Added both.',operations:[operation([field('title','Buy milk','Buy milk')]),operation([field('title','Clear the table','Clear the table')],{opId:'clear',sourceId:'s1'})],decisions:[{sourceId:'s0',disposition:'action',note:null},{sourceId:'s1',disposition:'action',note:null}]});
 const result=await p.send(),data=await p.backend.load();assert.equal(p.calls,1);assert.equal(result.applied.status,'applied');
 assert.deepEqual(data.entries.map(e=>e.title),['Buy milk','Clear the table']);
 const card=(await p.service.view()).captures[0];assert.doesNotMatch(card.reply,/added both/i);assert.equal(card.notes[0].disposition,'existing');
});

test('duplicate prevention keeps an explicitly requested second task',async()=>{
 const raw='Add another Gym tomorrow',p=phone(raw,[{title:'Gym',plannedDate:'2026-10-27'}],{operations:[operation([field('title','Gym','Gym'),field('time','tomorrow','tomorrow')])],decisions:[{sourceId:'s0',disposition:'action',note:null}]});
 const result=await p.send();assert.equal(result.applied.status,'applied');assert.equal((await p.backend.load()).entries.length,2);
 assert.equal((await p.backend.load()).entries[1].plannedDate,'2026-10-27');
});
