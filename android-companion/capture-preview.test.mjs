import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';

const NOW=new Date('2026-10-20T04:30:00.000Z');
const WORDS='Past paper section B on Thursday at 5 pm, must';
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
function agentFor(model){
 const backend=createMemoryBackend(freshStore()),emitted=[];
 const service=createIntentService({backend,model,changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,clock:()=>NOW,timezone:'Asia/Kolkata'});
 const traces=createTraceStore({storage:memoryStorage(),emit:t=>emitted.push(structuredClone(t)),clock:()=>NOW});
 return {backend,traces,emitted,agent:createCaptureAgent({service,traces,clock:()=>NOW})};
}
const reading=()=>{
 let calls=0;
 const model=async(input,{run}={})=>{calls++;if(run)Object.assign(run,{requestId:`intent-model:r${calls}`,service:'anthropic',inputTokens:900});
  return turn(WORDS,[operation([field('title','Past paper section B',WORDS),field('time','Thursday at 5 pm','Thursday at 5 pm'),field('must',true,'must')])]);};
 return {model,get calls(){return calls;}};
};

test('a preview shows the rows its receipt will show, saves nothing, and its model call leaves a trace without words',async()=>{
 const m=reading(),s=agentFor(m.model),conversationId=(await s.backend.load()).conversations[0].id;
 const before=JSON.stringify(await s.backend.load());
 const read=await s.agent.preview({conversationId,text:WORDS});
 assert.equal(read.status,'read');
 assert.deepEqual(read.rows.map(r=>[r.title,r.where,r.must,!!r.when]),[['Past paper section B','Inbox',true,true]]);
 assert.equal(JSON.stringify(await s.backend.load()),before,'nothing saved');
 const [trace]=s.traces.list();
 assert.equal(trace.kind,'preview');
 assert.equal(trace.words,null);
 assert.equal(trace.applied.status,'preview');
 assert.equal(trace.models[0].preview,true);
 assert.equal(trace.models[0].requestId,'intent-model:r1');
 assert.doesNotMatch(JSON.stringify(s.emitted),/Past paper/,'the trace never carries the words');
});

test('Enter on the previewed words applies with no second model call, and its trace names the reused read',async()=>{
 const m=reading(),s=agentFor(m.model),conversationId=(await s.backend.load()).conversations[0].id;
 await s.agent.preview({conversationId,text:WORDS});
 const result=await s.agent.capture({messageId:'m-paper',conversationId,text:WORDS});
 assert.equal(m.calls,1);
 assert.equal(result.applied.status,'applied');
 const saved=(await s.backend.load()).entries.find(e=>e.title==='Past paper section B');
 assert.equal(saved.must,true);
 const trace=s.traces.get('m-paper');
 assert.equal(trace.words,WORDS);
 assert.deepEqual([trace.models[0].reused,trace.models[0].requestId],['preview','intent-model:r1']);
 assert.equal(trace.models[0].inputTokens,undefined,'the tokens are counted once, on the preview trace');
});
