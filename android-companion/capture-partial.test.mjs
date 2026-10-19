import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';

const NOW=new Date('2026-09-16T04:00:00.000Z');
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
function agentFor(model,{seed=freshStore(),snapshot=null}={}){
 const backend=createMemoryBackend(seed),emitted=[];
 const service=createIntentService({backend,model,changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,snapshot,clock:()=>NOW,timezone:'Asia/Kolkata'});
 const traces=createTraceStore({storage:memoryStorage(),emit:t=>emitted.push(structuredClone(t)),clock:()=>NOW});
 return {backend,service,traces,emitted,agent:createCaptureAgent({service,traces,clock:()=>NOW})};
}
const latest=async backend=>intentViewFromData(await backend.load(),{now:NOW}).captures[0];
const conversationOf=async backend=>(await backend.load()).conversations[0].id;
const withTask=(fields)=>{const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Run',...fields}},NOW);return seed;};

test('a rejected time keeps valid actions, names the unapplied time on the receipt, and Undo restores everything',async()=>{
 const raw='Read tomorrow at nine and buy milk';
 const output=()=>turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow 9pm','tomorrow at nine')]),operation([field('title','Buy milk','buy milk')],{opId:'milk'})]);
 const s=agentFor(async()=>output()),conversationId=await conversationOf(s.backend);
 const result=await s.agent.capture({messageId:'partial-time',conversationId,text:raw});
 assert.equal(result.applied.status,'applied');
 const data=await s.backend.load(),card=await latest(s.backend);
 assert.deepEqual(data.entries.map(e=>e.title),['Read','Buy milk']);
 assert.equal(data.entries[0].planned,null);
 assert.match(card.draft.applied.warning,/Read.*time.*not applied/i);
 assert.equal(data.intentV2.captures['partial-time'].unapplied[0].field,'time');
 assert.equal(data.intentV2.captures['partial-time'].raw,raw);
 await s.agent.undo({draftId:result.draftId,conversationId,actionId:'undo-partial'});
 assert.equal((await s.backend.load()).entries.length,0);
});

test('a repair timeout retains the checked parts of the earlier response',async()=>{
 const raw='Read tomorrow at nine and buy milk';let calls=0;
 const s=agentFor(async()=>{
  if(++calls===2)return new Promise(()=>{});
  return turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow 9pm','tomorrow at nine')]),operation([field('title','Buy milk','buy milk')],{opId:'milk'})]);
 });
 s.service.harness.modelPolicy=()=>({timeoutMs:20});
 const result=await s.agent.capture({messageId:'repair-timeout',conversationId:await conversationOf(s.backend),text:raw});
 assert.equal(calls,2);assert.equal(result.applied.status,'applied');
 const card=await latest(s.backend);
 assert.match(card.draft.applied.warning,/time was not applied/);
 assert.deepEqual((await s.backend.load()).entries.map(e=>e.title),['Read','Buy milk']);
});

test('an unsupported time-only update leaves the saved time unchanged and explains the unapplied change',async()=>{
 const seed=withTask({planned:'2026-09-17T12:30:00.000Z'}),raw='Move Run tomorrow at nine';
 const s=agentFor(async()=>turn(raw,[operation([field('time','tomorrow 9pm','tomorrow at nine')],{kind:'update',targetId:'1'})]),{seed});
 const result=await s.agent.capture({messageId:'only-time',conversationId:await conversationOf(s.backend),text:raw});
 assert.equal(result.draftId,null);
 const card=await latest(s.backend);
 assert.match(card.reply,/Run: time was not applied/);
 assert.equal((await s.backend.load()).entries[0].planned,seed.entries[0].planned);
});

test('a rejected amendment preserves the draft\'s earlier time and its provenance',async()=>{
 const raw='Read tomorrow at 7 pm',reply='Move it to nine';let calls=0;
 const s=agentFor(async()=>++calls===1
  ?turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow 7pm','7 pm')])])
  :turn(reply,[operation([field('time','tomorrow 9pm','nine')])],{draftMode:'amend'}));
 const conversationId=await conversationOf(s.backend);
 const first=await s.service.capture({messageId:'before-time',conversationId,text:raw});
 const earlier=(await s.backend.load()).intentV2.drafts[first.draftId].operations[0].fields.find(f=>f.name==='time');
 await s.service.capture({messageId:'bad-amend',conversationId,text:reply,focusDraftId:first.draftId});
 const after=(await s.backend.load()).intentV2.drafts[first.draftId].operations[0].fields.find(f=>f.name==='time');
 assert.deepEqual(after,earlier);
});

