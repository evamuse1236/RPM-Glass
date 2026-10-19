import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {PROMPT_VERSION} from '../intent-v2/prompts/capture-agent.mjs';
import {HAIKU_MODEL} from '../intent-v2/src/model-policy.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {planSnapshot} from './capture-snapshot.mjs';

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

