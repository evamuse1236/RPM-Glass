import test from 'node:test';
import assert from 'node:assert/strict';
import {intentModelPolicy,HAIKU_MODEL,SONNET_MODEL,LUNA_MODEL,CLAUDE_PROVIDERS} from '../src/model-policy.mjs';
import {nativeModelTransport} from '../adapters/transport.mjs';
import {sourceUnits} from '../src/context.mjs';
import {turn} from './helpers.mjs';

const input=raw=>({sourceUnits:sourceUnits(raw)});
const route=raw=>intentModelPolicy({input:input(raw)});
const claudeAnswer=(body)=>({status:200,body:{model:body.model,stop_reason:'end_turn',usage:{input_tokens:700,output_tokens:60},content:[{type:'text',text:JSON.stringify(turn())}]}});
const openRouterAnswer=(body)=>({status:200,body:{model:body.model,provider:'Anthropic',usage:{prompt_tokens:900,completion_tokens:80,cost:0.001},choices:[{finish_reason:'stop',message:{content:JSON.stringify(turn())}}]}});
/** A fake phone: {anthropic, openrouter} say what each service does (an answer, a status, 'missing' key, or 'down'). */
function phone({anthropic=claudeAnswer,openrouter=openRouterAnswer}={}){
 const calls=[];
 const native=async(action,p)=>{
  if(action==='cancelModel'){calls.push({action,requestId:p.requestId});return {};}
  calls.push({action,service:p.service,requestId:p.requestId,body:p.body});
  const how=p.service==='anthropic'?anthropic:openrouter;
  if(how==='missing')return {status:0,missingKey:true,service:p.service};
  if(how==='down')throw new Error('Connection failed');
  if(typeof how==='number')return {status:how,body:{},service:p.service};
  return how(p.body);
 };
 return {native,calls,models:()=>calls.filter(c=>c.action==='model')};
}
const transport=native=>nativeModelTransport({model:HAIKU_MODEL,prompt:'the prompt',providerNames:CLAUDE_PROVIDERS,native,requestIdFactory:()=>'intent-model:t1'});

test('with a Claude key, an everyday capture goes to the Anthropic API on Haiku 5.5 with thinking off',async()=>{
 const p=phone(),run={};
 assert.deepEqual(await transport(p.native)(input('Buy milk'),{route:route('Buy milk'),run}),turn());
 const [call]=p.models();assert.equal(p.models().length,1);
 assert.equal(call.service,'anthropic');assert.equal(call.body.model,'claude-haiku-5-5');assert.deepEqual(call.body.system,[{type:'text',text:'the prompt',cache_control:{type:'ephemeral'}}]);
 assert.deepEqual(call.body.thinking,{type:'disabled'});assert.equal(call.body.output_config.format.type,'json_schema');assert.equal(call.body.output_config.effort,undefined);
 assert.equal(/maxLength|maxItems/.test(JSON.stringify(call.body.output_config.format.schema)),false);
 assert.equal(call.body.response_format,undefined);assert.equal(call.body.provider,undefined);
 assert.deepEqual({service:run.service,serviceFallback:run.serviceFallback,inputTokens:run.inputTokens,outputTokens:run.outputTokens,servedModel:run.servedModel},{service:'anthropic',serviceFallback:null,inputTokens:700,outputTokens:60,servedModel:'claude-haiku-5-5'});
});

test('a hard request goes to Sonnet 5.5 at high effort on the Anthropic API',async()=>{
 const p=phone();await transport(p.native)(input('Re-plan my week'),{route:route('Re-plan my week')});
 const [call]=p.models();assert.equal(call.body.model,'claude-sonnet-5-5');assert.equal(call.body.output_config.effort,'high');assert.equal(call.body.thinking,undefined);assert.equal(call.body.max_tokens,16000);
});

for(const failure of ['down',401,403,429,500,503,529])
 test(`Claude ${failure==='down'?'unreachable':failure} falls back once to OpenRouter with the same model`,async()=>{
  const p=phone({anthropic:failure}),run={};
  assert.deepEqual(await transport(p.native)(input('Buy milk'),{route:route('Buy milk'),run}),turn());
  const [first,second]=p.models();assert.equal(p.models().length,2);
  assert.deepEqual([first.service,second.service],['anthropic','openrouter']);
  assert.equal(second.body.model,HAIKU_MODEL);assert.notEqual(first.requestId,second.requestId);
  assert.deepEqual(second.body.messages[0].content,first.body.system);
  assert.equal(run.service,'openrouter');assert.equal(run.serviceFallback,`anthropic ${failure==='down'?'unreachable':failure}`);assert.equal(run.requestId,second.requestId);
 });

test('a bad request or an unusable Claude answer does not fall back',async()=>{
 for(const anthropic of [400,body=>({status:200,body:{model:body.model,stop_reason:'refusal',content:[]}})]){
  const p=phone({anthropic});
  await assert.rejects(transport(p.native)(input('Buy milk'),{route:route('Buy milk')}));
  assert.deepEqual(p.models().map(c=>c.service),['anthropic']);
 }
});

test('with no Claude key, Capture goes straight to OpenRouter and records no fallback',async()=>{
 const p=phone({anthropic:'missing'}),run={};
 await transport(p.native)(input('Buy milk'),{route:route('Buy milk'),run});
 assert.deepEqual(p.models().map(c=>c.service),['anthropic','openrouter']);assert.equal(run.service,'openrouter');assert.equal(run.serviceFallback,null);
});

test('with no key at all, the error says to add one; with both keys refused, it says to replace them',async()=>{
 await assert.rejects(transport(phone({anthropic:'missing',openrouter:'missing'}).native)(input('Buy milk'),{route:route('Buy milk')}),e=>/Connect a Claude or OpenRouter key/.test(e.message)&&e.code==='TRANSPORT_ERROR');
 await assert.rejects(transport(phone({anthropic:401,openrouter:401}).native)(input('Buy milk'),{route:route('Buy milk')}),/refused your key/);
 await assert.rejects(transport(phone({anthropic:401,openrouter:'missing'}).native)(input('Buy milk'),{route:route('Buy milk')}),/refused your key/);
 await assert.rejects(transport(phone({anthropic:'down',openrouter:'missing'}).native)(input('Buy milk'),{route:route('Buy milk')}),/Connection failed/);
});

test('a model with no Claude API ID only goes to OpenRouter',async()=>{
 const p=phone();await transport(p.native)(input('Buy milk'),{route:{model:LUNA_MODEL,effort:'none',timeoutMs:20000,maxTokens:3000}}).catch(()=>{});
 assert.deepEqual(p.models().map(c=>c.service),['openrouter']);
});

test('cancelling during the Claude call cancels that request and never tries OpenRouter',async()=>{
 let release;const p=phone({anthropic:()=>new Promise(r=>release=r)});const controller=new AbortController();
 const pending=transport(p.native)(input('Buy milk'),{route:route('Buy milk'),signal:controller.signal});
 await new Promise(r=>setTimeout(r,1));controller.abort();release({status:503,body:{}});
 await assert.rejects(pending,e=>e.name==='AbortError');
 assert.deepEqual(p.calls.map(c=>[c.action,c.service??null,c.requestId]),[['model','anthropic','intent-model:t1'],['cancelModel',null,'intent-model:t1']]);
});

test('Sonnet with thinking off uses between_tools, which Sonnet 5.5 accepts',async()=>{
 const p=phone();await transport(p.native)(input('x'),{route:{model:SONNET_MODEL,effort:'none',timeoutMs:20000,maxTokens:3000}});
 assert.deepEqual(p.models()[0].body.thinking,{type:'between_tools'});
});

test('the capture trace records which service answered and why it fell back, and nothing else from the call',async()=>{
 const {modelRun}=await import('../../android-companion/capture-trace.mjs');
 const p=phone({anthropic:503}),run={model:HAIKU_MODEL,effort:'none'};
 await transport(p.native)(input('Buy milk'),{route:route('Buy milk'),run});
 const traced=modelRun(run);
 assert.equal(traced.service,'openrouter');assert.equal(traced.serviceFallback,'anthropic 503');
 assert.equal(/key|authorization|sk-/i.test(JSON.stringify(traced)),false);
});

for(const missingClaude of [false,true])test(`medium chat effort reaches the provider: OpenRouter=${missingClaude}`,async()=>{
 const p=phone(missingClaude?{anthropic:'missing'}:{});
 const r=intentModelPolicy({input:{...input('Keep that thought'),activeDraft:{id:'d0'}}});
 await transport(p.native)(input('Keep that thought'),{route:r});
 const body=p.models().at(-1).body;
 assert.equal(missingClaude?body.reasoning.effort:body.output_config.effort,'medium');
});

for(const mode of ['stream','plain','unsupported'])test(`streaming phone keeps the validated final transport contract: ${mode}`,async()=>{
 const partials=[],calls=[],run={};
 const native=async(action,p,callbacks)=>{
  calls.push(structuredClone(p));
  if(mode==='unsupported'&&p.body.stream)return {status:400,body:{}};
  if(mode==='stream'){
   const text=JSON.stringify(turn());callbacks.onChunk(text.slice(0,20));callbacks.onChunk(text.slice(20));
  }
  return claudeAnswer(p.body);
 };
 native.supportsStreaming=true;
 assert.deepEqual(await transport(native)(input('A reason-bearing thought'),{run,onPartial:t=>partials.push(t)}),turn());
 assert.equal(run.requestBytes,JSON.stringify(calls.at(-1).body).length);
 assert.equal(calls[0].body.stream,true);
 assert.equal(partials.length,mode==='stream'?2:0);
 if(mode==='stream')assert.deepEqual(JSON.parse(partials.at(-1)),turn());
 if(mode==='unsupported'){assert.equal(calls.length,2);assert.equal(calls[1].body.stream,undefined);assert.notEqual(calls[0].requestId,calls[1].requestId);assert.equal(run.requestId,calls[1].requestId);}
});

for(const status of [400,422])test(`a rejected stream retries with a fresh cancellable request ID: ${status}`,async()=>{
 const held=new Set(),calls=[],controller=new AbortController(),run={};let release;
 const native=async(action,p)=>{
  calls.push({action,...structuredClone(p)});
  if(action==='cancelModel')return {};
  if(held.has(p.requestId))throw new Error('That model request is already running.');
  held.add(p.requestId);
  if(p.body.stream)return {status,body:{}};
  await new Promise(r=>release=r);return claudeAnswer(p.body);
 };
 native.supportsStreaming=true;
 const pending=transport(native)(input('Call mom because I miss her'),{signal:controller.signal,onPartial:()=>{},run});
 await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,2);assert.notEqual(calls[0].requestId,calls[1].requestId);
 controller.abort();release();await assert.rejects(pending,e=>e.name==='AbortError');
 assert.equal(calls.at(-1).action,'cancelModel');assert.equal(calls.at(-1).requestId,calls[1].requestId);
});
