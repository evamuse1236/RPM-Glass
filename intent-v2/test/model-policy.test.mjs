import test from 'node:test';
import assert from 'node:assert/strict';
import {intentModelPolicy,HAIKU_MODEL,SONNET_MODEL,CLAUDE_PROVIDERS,HARD_CHANGE_COUNT} from '../src/model-policy.mjs';
import {nativeModelTransport,providerSchema} from '../adapters/transport.mjs';
import {buildContext,sourceUnits} from '../src/context.mjs';
import {setup,turn,operation,field,captured,seed} from './helpers.mjs';
const input=raw=>({sourceUnits:sourceUnits(raw)});
const route=raw=>intentModelPolicy({input:input(raw)});
/** A phone with only an OpenRouter key: Claude reports no key, so these tests see the OpenRouter request. */
const openRouterOnly=fn=>async(action,p)=>action==='model'&&p.service==='anthropic'?{status:0,missingKey:true}:fn(action,p);
const transport=options=>nativeModelTransport({...options,native:openRouterOnly(options.native)});
const answer=(content,model=HAIKU_MODEL)=>({status:200,body:{model,provider:'Anthropic',usage:{prompt_tokens:900,completion_tokens:80,cost:0.001},choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}});

for(const raw of ['Buy milk','Read tomorrow from 2 to 3.','Move my run to 6 am','I am tired tonight.','Remind me to call mom at 6'])
 test(`everyday capture goes to Haiku without reasoning: ${raw}`,()=>{const r=route(raw);assert.equal(r.model,HAIKU_MODEL);assert.equal(r.effort,'none');});
for(const raw of ['What’s my timetable today?','Do I have a free hour at 5 pm?','How much water today?','What is next?'])
 test(`a quick question stays on Haiku: ${raw}`,()=>{const r=route(raw);assert.equal(r.model,HAIKU_MODEL);assert.equal(r.reason,'question');});
for(const raw of ['Re-plan my week around the exam','Sort my Inbox: place loose tasks into Blocks','Help me make Friday’s fractions lesson ready.','Suggest three steps','How should I prepare?','What should I do first tonight?','Plan my day tomorrow'])
 test(`a hard request goes to Sonnet at high effort: ${raw}`,()=>{const r=route(raw);assert.equal(r.model,SONNET_MODEL);assert.equal(r.effort,'high');assert.ok(r.timeoutMs>=route('Buy milk').timeoutMs*3);});
test('a repair attempt always uses Sonnet',()=>{const r=intentModelPolicy({input:input('Buy milk'),attempt:1});assert.equal(r.model,SONNET_MODEL);assert.equal(r.reason,'repair');});
test('more than three changes to saved items is a re-plan; three or fewer stay quick',()=>{
 const updates=n=>turn('Move them',Array.from({length:n},(_,i)=>operation([field('time','6am','Move them')],{opId:'u'+i,kind:'update',targetId:String(i+1)})));
 assert.equal(intentModelPolicy({input:input('Move them'),output:updates(HARD_CHANGE_COUNT+1)}).model,SONNET_MODEL);
 assert.equal(intentModelPolicy({input:input('Move them'),output:updates(HARD_CHANGE_COUNT)}).model,HAIKU_MODEL);
 const creates=turn('Buy milk eggs bread jam',Array.from({length:5},(_,i)=>operation([field('title','Buy milk','Buy milk')],{opId:'c'+i})));
 assert.equal(intentModelPolicy({input:input('Buy milk eggs bread jam'),output:creates}).model,HAIKU_MODEL);
});

test('Haiku requests leave reasoning out, use strict structured output and Claude providers',async()=>{
 let request,payload;const model=transport({model:HAIKU_MODEL,prompt:'prompt',providerNames:CLAUDE_PROVIDERS,native:async(action,p)=>{payload=p;request=p.body;return answer(turn());}});
 await model(input('Buy milk'),{route:route('Buy milk')});
 assert.equal(request.model,HAIKU_MODEL);assert.equal(request.reasoning,undefined);assert.equal(request.max_tokens,4000);
 assert.deepEqual(request.provider,{require_parameters:true,allow_fallbacks:true,only:[...CLAUDE_PROVIDERS]});
 assert.equal(request.response_format.json_schema.strict,true);assert.ok(payload.timeoutMs>25000);
 const text=JSON.stringify(request.response_format.json_schema.schema);
 assert.equal(/maxLength|maxItems/.test(text),false);assert.equal(/"type":\[/.test(text),false);
});
test('Sonnet requests ask for high reasoning and a larger token budget',async()=>{
 let request;const model=transport({model:HAIKU_MODEL,prompt:'p',providerNames:CLAUDE_PROVIDERS,native:async(_,p)=>{request=p.body;return answer(turn(),SONNET_MODEL);}});
 await model(input('Re-plan my week'),{route:route('Re-plan my week')});
 assert.equal(request.model,SONNET_MODEL);assert.deepEqual(request.reasoning,{effort:'high',exclude:true});assert.equal(request.max_tokens,16000);
});
test('the provider schema keeps every key, enum and nullable shape of the local schema',()=>{
 const schema={type:'object',properties:{a:{type:'string',maxLength:5},b:{type:['string','null']},c:{type:'array',items:{type:'string',enum:['x']},maxItems:2}},required:['a','b','c'],additionalProperties:false};
 assert.deepEqual(providerSchema(schema),{type:'object',properties:{a:{type:'string'},b:{anyOf:[{type:'string'},{type:'null'}]},c:{type:'array',items:{type:'string',enum:['x']}}},required:['a','b','c'],additionalProperties:false});
});
test('a dated model snapshot is accepted and usage lands on the run record',async()=>{
 const run={};const model=transport({model:HAIKU_MODEL,prompt:'p',providerNames:CLAUDE_PROVIDERS,native:async()=>answer(turn(),HAIKU_MODEL+'-20261001')});
 await model(input('Plan the lesson'),{route:route('Plan the lesson'),run});
 assert.equal(run.provider,'Anthropic');assert.equal(run.inputTokens,900);assert.equal(run.outputTokens,80);assert.match(run.requestId,/^intent-model:/);
});

test('a faulty title gets exactly one Sonnet repair with the real local error',async()=>{
 const models=[];let second;const s=setup(async(i,o)=>{models.push(o.route.model);if(models.length===1)return turn('Read',[operation([field('title',null,null,'stated','unknown')])]);second=i;return turn('Read',[operation([field('title','Read','Read')])]);},{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 const {result}=await captured(s,'Read');assert.equal(result.status,'interpreted');assert.deepEqual(models,[HAIKU_MODEL,SONNET_MODEL]);assert.match(second.repair.validationError,/title/);assert.equal((await s.repository.load()).entries.length,0);
});
test('a fast interpretation that turns out to be a plan is rerun on Sonnet, without an intermediate draft',async()=>{
 const efforts=[];const s=setup(async(i,o)=>{efforts.push(o.route.effort);assert.equal(Object.keys((await s.repository.load()).intentV2.drafts).length,0);return turn('Get the lesson ready',[operation([field('title','Get the lesson ready','Get the lesson ready')])],{mode:'plan'});},{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 const {result}=await captured(s,'Get the lesson ready');assert.deepEqual(efforts,['none','high']);
 const runs=(await s.repository.load()).intentV2.captures.m1.modelRuns;
 assert.deepEqual(runs.map(r=>[r.model,r.ok]),[[HAIKU_MODEL,true],[SONNET_MODEL,true]]);assert.equal(runs[0].escalated,'interpreted_hard');assert.ok(runs.every(r=>Number.isInteger(r.ms)));assert.equal(result.modelRuns.length,2);
});
test('when the Sonnet follow-up fails, the valid Haiku reading is kept',async()=>{
 let calls=0;const s=setup(async()=>{if(++calls===2){const e=new Error('Connection failed');e.code='TRANSPORT_ERROR';throw e;}return turn('Get the lesson ready',[operation([field('title','Get the lesson ready','Get the lesson ready')])],{mode:'plan'});},{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 const {result,draft}=await captured(s,'Get the lesson ready');
 assert.equal(result.status,'interpreted');assert.equal(draft.operations.length,1);
 const runs=(await s.repository.load()).intentV2.captures.m1.modelRuns;assert.equal(runs[1].error,'TRANSPORT_ERROR');assert.equal(runs[1].fellBack,true);
});
test('transport outage is not a paid repair loop and keeps the original',async()=>{
 let calls=0;const model=transport({model:HAIKU_MODEL,prompt:'p',native:async()=>{calls++;throw new Error('Connection failed');}});const s=setup(model,{modelPolicy:intentModelPolicy,maxRepairCalls:1});
 const {result}=await captured(s,'Read');assert.equal(result.status,'captured');assert.equal(calls,1);assert.equal((await s.repository.load()).intentV2.captures.m1.raw,'Read');assert.equal(result.modelRuns[0].error,'TRANSPORT_ERROR');
});
test('invalid JSON can be repaired but an unexpected model or provider cannot',async()=>{
 for(const bad of ['json','model','provider']){
  let calls=0;const models=[];const model=transport({model:HAIKU_MODEL,prompt:'p',providerNames:CLAUDE_PROVIDERS,native:async(_,p)=>{models.push(p.body.model);calls++;return {status:200,body:{model:bad==='model'?'wrong':p.body.model,provider:bad==='provider'?'other':'Anthropic',choices:[{finish_reason:'stop',message:{content:bad==='json'&&calls===1?'{':JSON.stringify(turn('Read',[operation([field('title','Read','Read')])]))}}]}};}});
  const s=setup(model,{modelPolicy:intentModelPolicy,maxRepairCalls:1}),{result}=await captured(s,'Read');assert.equal(calls,bad==='json'?2:1);assert.equal(result.status,bad==='json'?'interpreted':'captured');if(bad==='json')assert.deepEqual(models,[HAIKU_MODEL,SONNET_MODEL]);
 }
});
test('stage deadlines abort native work and ignore a late valid response',async()=>{
 let resolve;const requests=[];const model=transport({model:HAIKU_MODEL,prompt:'p',native:async(a,p)=>{requests.push([a,p.requestId]);if(a==='cancelModel')return {};return new Promise(r=>resolve=r);}});
 const s=setup(model,{modelPolicy:()=>({model:HAIKU_MODEL,effort:'none',timeoutMs:15}),maxRepairCalls:1}),{result}=await captured(s,'Read');assert.equal(result.code,'TIMEOUT');assert.equal(requests.filter(([a])=>a==='model').length,1);assert.ok(requests.some(([a,id])=>a==='cancelModel'&&id===requests[0][1]));resolve(answer(turn()));await new Promise(r=>setTimeout(r,5));assert.equal((await s.repository.load()).intentV2.captures.m1.status,'captured');
});
test('local schedule context includes saved dates and computed endpoints, with no claim of calendar coverage',()=>{
 const d=seed();d.entries=[{id:41,kind:'plan',title:'Evening walk',planned:'2026-09-17T13:30:00.000Z',minutes:20},{id:42,kind:'plan',title:'Read',plannedDate:'2026-09-18'}];
 const c=buildContext(d,{raw:'What is planned?',conversationId:'c1',now:new Date('2026-09-17T04:00:00Z'),timezone:'Asia/Kolkata'});
 assert.equal(c.entities[0].startLocal,'2026-09-17 19:00');assert.equal(c.entities[0].endLocal,'2026-09-17 19:20');assert.equal(c.entities[1].savedLocalDate,'2026-09-18');assert.equal(c.entities[1].startLocal,null);assert.equal(c.scheduleCoverage.canAssertFreeTime,false);
});
