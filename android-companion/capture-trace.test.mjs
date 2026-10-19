import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {nativeModelTransport} from '../intent-v2/adapters/transport.mjs';
import {HAIKU_MODEL} from '../intent-v2/src/model-policy.mjs';
import {turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {planSnapshot} from './capture-snapshot.mjs';

const NOW=new Date('2026-09-16T04:00:00.000Z');
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
const reflection=raw=>turn(raw,[],{mode:'reflect',draftMode:'none',reply:'Noted.',decisions:[{sourceId:'s0',disposition:'reflection',note:raw}]});

test('the trace tells apart two different requests that cost the same number of tokens',async()=>{
 const bodies=[];
 const native=async(action,payload)=>{
  if(action!=='model')throw new Error('unexpected '+action);
  bodies.push(payload.body);
  const words=JSON.parse(payload.body.messages[0].content).sourceUnits[0].text;
  return {status:200,body:{model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:13761,output_tokens:40,cache_read_input_tokens:0},content:[{type:'text',text:JSON.stringify(reflection(words))}]}};
 };
 const model=nativeModelTransport({native,model:HAIKU_MODEL,prompt:'SYSTEM PROMPT',effort:'none'});
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Dinner',alert:'alarm'}},NOW);
 const backend=createMemoryBackend(seed);
 const service=createIntentService({backend,model,changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,snapshot:async({data})=>planSnapshot(data,{now:NOW,timezone:'Asia/Kolkata'}),clock:()=>NOW,timezone:'Asia/Kolkata'});
 const traces=createTraceStore({storage:memoryStorage(),clock:()=>NOW});
 const agent=createCaptureAgent({service,traces,clock:()=>NOW});
 const conversationId=(await backend.load()).conversations[0].id;
 await agent.capture({messageId:'m-both-1',conversationId,text:'Both'});
 await agent.capture({messageId:'m-both-2',conversationId,text:'Both'});
 const [first,second]=['m-both-1','m-both-2'].map(id=>traces.get(id).models[0]);
 assert.equal(first.inputTokens,13761);assert.equal(second.inputTokens,13761);
 assert.equal(first.cacheReadTokens,0);
 assert.notEqual(first.requestHash,second.requestHash);
 assert.notEqual(first.input.hash,second.input.hash);
 assert.equal(first.input.messageCount,0);assert.equal(second.input.messageCount,2);
 assert.equal(first.requestBytes,JSON.stringify(bodies[0]).length);
 assert.ok(first.requestBytes>first.input.bytes,'request size counts the system prompt and schema');
 assert.ok(first.input.entityIds.includes('task:1'));
 const text=JSON.stringify(traces.list().map(t=>t.models));
 assert.equal(/Both|Dinner|SYSTEM PROMPT/.test(text),false);
 assert.equal(/Bearer|sk-ant|sk-or-|api[_-]?key/i.test(JSON.stringify(traces.list())),false);
});
