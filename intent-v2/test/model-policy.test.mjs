import test from 'node:test';
import assert from 'node:assert/strict';
import {intentModelPolicy,LUNA_MODEL} from '../src/model-policy.mjs';
import {nativeModelTransport} from '../adapters/transport.mjs';
import {buildContext,sourceUnits} from '../src/context.mjs';
import {setup,turn,operation,field,captured,seed} from './helpers.mjs';
const input=raw=>({sourceUnits:sourceUnits(raw)});
for(const raw of ['Buy milk','Read tomorrow from 2 to 3.','Move my run to 6 am','I am tired tonight.'])test(`fast extraction: ${raw}`,()=>assert.equal(intentModelPolicy({input:input(raw)}).effort,'none'));
for(const raw of ['Help me make Friday’s fractions lesson ready.','Do I have a free hour at 5 pm?','Suggest three steps','How should I prepare?'])test(`reasoning: ${raw}`,()=>assert.equal(intentModelPolicy({input:input(raw)}).effort,'high'));
test('none request is pinned to the evaluated model, provider and explicit reasoning mode',async()=>{
 let request;const model=nativeModelTransport({model:LUNA_MODEL,prompt:'prompt',providerNames:['OpenAI'],effort:'none',native:async(action,payload)=>{request=payload.body;return {status:200,body:{model:LUNA_MODEL,provider:'OpenAI',choices:[{finish_reason:'stop',message:{content:JSON.stringify(turn())}}]}};}});
 await model(input('Buy milk'));assert.equal(request.model,LUNA_MODEL);assert.deepEqual(request.reasoning,{effort:'none',exclude:true});assert.deepEqual(request.provider,{require_parameters:true,allow_fallbacks:false,only:['OpenAI']});assert.equal(request.response_format.json_schema.strict,true);
});
test('a faulty title gets exactly one high repair with the real local error',async()=>{
 const efforts=[];let second;const s=setup(async(i,o)=>{efforts.push(o.route.effort);if(efforts.length===1)return turn('Read',[operation([field('title',null,null,'stated','unknown')])]);second=i;return turn('Read',[operation([field('title','Read','Read')])]);},{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 const {result}=await captured(s,'Read');assert.equal(result.status,'interpreted');assert.deepEqual(efforts,['none','high']);assert.match(second.repair.validationError,/title/);assert.equal((await s.repository.load()).entries.length,0);
});
test('a fast interpretation that identifies planning is rerun at high, without an intermediate draft',async()=>{
 const efforts=[];const s=setup(async(i,o)=>{efforts.push(o.route.effort);assert.equal(Object.keys((await s.repository.load()).intentV2.drafts).length,0);return turn('Get the lesson ready',[operation([field('title','Get the lesson ready','Get the lesson ready')])],{mode:'plan'});},{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 await captured(s,'Get the lesson ready');assert.deepEqual(efforts,['none','high']);
});
test('transport outage is not a paid repair loop and keeps the original',async()=>{
 let calls=0;const model=nativeModelTransport({model:LUNA_MODEL,prompt:'p',native:async()=>{calls++;throw new Error('Connection failed');}});const s=setup(model,{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 const {result}=await captured(s,'Read');assert.equal(result.status,'captured');assert.equal(calls,1);assert.equal((await s.repository.load()).intentV2.captures.m1.raw,'Read');
});
test('invalid JSON can be repaired but unexpected model/provider cannot',async()=>{
 for(const bad of ['json','model','provider']){
  let calls=0;const efforts=[];const model=nativeModelTransport({model:LUNA_MODEL,prompt:'p',providerNames:['OpenAI'],native:async(_,p)=>{efforts.push(p.body.reasoning.effort);calls++;return {status:200,body:{model:bad==='model'?'wrong':LUNA_MODEL,provider:bad==='provider'?'other':'OpenAI',choices:[{finish_reason:'stop',message:{content:bad==='json'&&calls===1?'{':JSON.stringify(turn('Read',[operation([field('title','Read','Read')])]))}}]}};}});
  const s=setup(model,{modelPolicy:intentModelPolicy,maxRepairCalls:1}),{result}=await captured(s,'Read');assert.equal(calls,bad==='json'?2:1);assert.equal(result.status,bad==='json'?'interpreted':'captured');if(bad==='json')assert.deepEqual(efforts,['none','high']);
 }
});
test('stage deadlines abort native work and ignore a late valid response',async()=>{
 let resolve;const requests=[];const model=nativeModelTransport({model:LUNA_MODEL,prompt:'p',native:async(a,p)=>{requests.push([a,p.requestId]);if(a==='cancelModel')return {};return new Promise(r=>resolve=r);}});
 const s=setup(model,{modelPolicy:()=>({effort:'high',timeoutMs:15}),maxRepairCalls:1}),{result}=await captured(s,'Read');assert.equal(result.code,'TIMEOUT');assert.equal(requests.filter(([a])=>a==='model').length,1);assert.ok(requests.some(([a,id])=>a==='cancelModel'&&id===requests[0][1]));resolve({status:200,body:{model:LUNA_MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify(turn())}}]}});await new Promise(r=>setTimeout(r,5));assert.equal((await s.repository.load()).intentV2.captures.m1.status,'captured');
});
test('local schedule context includes saved dates and computed endpoints, with no claim of calendar coverage',()=>{
 const d=seed();d.entries=[{id:41,kind:'plan',title:'Evening walk',planned:'2026-09-17T13:30:00.000Z',minutes:20},{id:42,kind:'plan',title:'Read',plannedDate:'2026-09-18'}];
 const c=buildContext(d,{raw:'What is planned?',conversationId:'c1',now:new Date('2026-09-17T04:00:00Z'),timezone:'Asia/Kolkata'});
 assert.equal(c.entities[0].startLocal,'2026-09-17 19:00');assert.equal(c.entities[0].endLocal,'2026-09-17 19:20');assert.equal(c.entities[1].savedLocalDate,'2026-09-18');assert.equal(c.entities[1].startLocal,null);assert.equal(c.scheduleCoverage.canAssertFreeTime,false);
});
