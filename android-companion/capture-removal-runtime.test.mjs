import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {sourceUnits} from '../intent-v2/src/context.mjs';
import {turn} from '../intent-v2/test/helpers.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';

for(const [raw,title,source,allowed=false] of [
 ["Don't remove the dentist task",'Dentist',0],
 ['Do not delete Buy milk','Buy milk',0],
 ['Never cancel the dentist task','Dentist',0],
 ['Buy milk. Clear the table','Buy milk',0],
 ['Buy milk. Clear the table','Buy milk',1],
 ['Dentist at 5. Cancel the gym','Dentist',0],
 ['Dentist at 5. Cancel the gym','Dentist',1],
 ['Buy milk and also remove the dentist task','Buy milk',0],
 ['Dentist is not happening, remove it','Dentist',0,true],
 ['Cancel my workout tomorrow the early one','Gym morning',0,true],
])test(`archive checks its own unnegated source: ${raw} / s${source}`,async()=>{
 const now=new Date(2026,9,26,10,13),seed=freshStore();
 const id=editPlan(seed,{type:'saveTask',fields:{title}},now),backend=createMemoryBackend(seed);let calls=0;
 const service=createIntentService({backend,model:async()=>{calls++;return turn(raw,[{opId:'remove',sourceId:sourceUnits(raw)[source].id,kind:'archive',entity:'task',targetId:String(id),fields:[]}]);},changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'m',conversationId:seed.conversations[0].id,text:raw});
 const data=await backend.load(),card=(await service.view()).captures[0];
 assert.equal(data.entries[0].archived,allowed);assert.equal(data.intentV2.captures.m.raw,raw);assert.equal(calls,1);
 if(allowed){assert.equal(result.applied.status,'applied');assert.ok(card.draft.lines.some(l=>l.title===title));}
 else{assert.equal(data.intentV2.captures.m.draftId??null,null);assert.match(result.error,/remove/i);assert.match(card.lastError.message,/remove/i);}
});

test('an open removal question cannot authorize a directly negated archive',async()=>{
 const now=new Date(2026,9,26,10,13),seed=freshStore(),id=editPlan(seed,{type:'saveTask',fields:{title:'Dentist'}},now);
 const other=editPlan(seed,{type:'saveTask',fields:{title:'Gym'}},now),backend=createMemoryBackend(seed);let calls=0;
 const raw="Don't remove the dentist task",service=createIntentService({backend,model:async()=>++calls===1
  ?turn('Remove one',[],{draftMode:'none',clarification:{prompt:'Which one?',action:'remove',choices:[{label:'Dentist',targets:[{entity:'task',id:String(id)}]},{label:'Gym',targets:[{entity:'task',id:String(other)}]}]}})
  :turn(raw,[{opId:'remove',sourceId:'s0',kind:'archive',entity:'task',targetId:String(id),fields:[]}]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now}),conversationId=seed.conversations[0].id;
 await agent.capture({messageId:'question',conversationId,text:'Remove one'});
 const result=await agent.capture({messageId:'m',conversationId,text:raw}),data=await backend.load();
 assert.equal(calls,2);assert.equal(data.entries[0].archived,false);assert.equal(data.intentV2.captures.m.raw,raw);assert.match(result.error,/remove/i);
});
