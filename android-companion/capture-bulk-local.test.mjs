import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
const now=new Date('2026-10-19T04:30:00Z');

test('after five uses the complete store, excludes the boundary and preserves clocks, words and Undo',async()=>{
 const seed=freshStore();seed.entries=[];
 for(const [title,time,extra] of [['Before','16:59',{}],['Boundary','17:00',{alert:'alarm'}],['After','17:01',{}],['Evening','20:00',{}],['Done','21:00',{done:true}],['Tomorrow','18:00',{tomorrow:true}]]){
  const id=editPlan(seed,{type:'saveTask',fields:{title,planned:`2026-10-${extra.tomorrow?'20':'19'}T${time}:00+05:30`,minutes:20,...(extra.alert?{alert:extra.alert}:{})}},now);
  if(extra.done)seed.entries.find(e=>e.id===id).done=true;
 }
 // Distractors outrank the actual selection in the normal bounded retrieval.
 for(let n=0;n<20;n++)editPlan(seed,{type:'saveTask',fields:{title:'Push everything after 5 today '+n}},now);
 const before=structuredClone(seed.entries),backend=createMemoryBackend(seed);
 let calls=0;
 const service=createIntentService({backend,model:async()=>{calls++;throw new Error('Must be local');},changePlanner,editPlan,undo,readCalendar:async()=>({status:'ready',start:0,end:Date.parse('2027-01-01'),events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const conversationId=seed.conversations[0].id,text='push everything after 5 today to tomorrow';
 const result=await agent.capture({messageId:'bulk',conversationId,text});
 assert.equal(calls,0);assert.equal(result.applied?.status,'applied');
 const saved=await backend.load();
 for(const title of ['Before','Boundary','Done','Tomorrow'])assert.equal(saved.entries.find(e=>e.title===title).planned,before.find(e=>e.title===title).planned,title);
 for(const [title,time] of [['After','17:01'],['Evening','20:00']])assert.equal(saved.entries.find(e=>e.title===title).planned,new Date(`2026-10-20T${time}:00+05:30`).toISOString());
 assert.equal(saved.intentV2.captures.bulk.raw,text);assert.ok(result.applied.undoId);
 await agent.undo({draftId:result.draftId,conversationId,actionId:'undo-bulk'});
 assert.deepEqual((await backend.load()).entries,before);
});

test('bulk selection abstains above the transaction bound and for recurring tasks',async()=>{
 const {readBulkMove}=await import('../intent-v2/src/bulk-move.mjs');
 const input={sourceUnits:[{id:'s0',text:'push everything after 5 today to tomorrow'}],context:{now:now.toISOString(),nowLocal:'2026-10-19 10:00',timezone:'Asia/Kolkata'}};
 const entry=n=>({id:n,title:'Task '+n,kind:'plan',planned:'2026-10-19T14:30:00Z'});
 assert.equal(readBulkMove(input,{data:{entries:Array.from({length:31},(_,n)=>entry(n))}}),null);
 assert.equal(readBulkMove(input,{data:{entries:[{...entry(1),recurrence:'daily'}]}}),null);
 assert.equal(readBulkMove({...input,openQuestion:{id:'q'}},{data:{entries:[entry(1)]}}),null);
});

test('the after-five selection also works after five, with original capitalization',async()=>{
 const {readBulkMove}=await import('../intent-v2/src/bulk-move.mjs');
 const {interpretTurn}=await import('../intent-v2/src/interpret.mjs');
 const {sourceUnits}=await import('../intent-v2/src/context.mjs');
 const raw='Push everything after 5 today to Tomorrow';
 const input={messageId:'m',sourceUnits:sourceUnits(raw),context:{now:'2026-10-19T14:30:00Z',nowLocal:'2026-10-19 20:00',timezone:'Asia/Kolkata'}};
 const data={entries:[{id:1,title:'Boundary',planned:'2026-10-19T11:30:00Z'},{id:2,title:'Later',planned:'2026-10-19T14:30:00Z'}]};
 const local=readBulkMove(input,{data});assert.ok(local);
 assert.deepEqual(local.turn.operations.map(o=>o.targetId),['2']);
 assert.doesNotThrow(()=>interpretTurn(local.turn,{units:input.sourceUnits,messageId:'m',visibleEntities:local.entities}));
});
