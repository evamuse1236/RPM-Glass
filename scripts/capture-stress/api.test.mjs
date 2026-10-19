import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {apiCall,apiCost,safeUsage,API_ENDPOINT,API_VERSION,API_TIMEOUT_MS} from './api.mjs';
import {targetModules,runCase} from './runtime.mjs';
import {parseOptions} from './run.mjs';
import {summarize,reportMarkdown} from './report.mjs';
import {turn,operation,field} from '../../intent-v2/test/helpers.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const adapters=await targetModules(repo),routes=adapters.policy.MODEL_ROUTES;
const key='stress-fixture-private-key';
const answer=(model,extra={})=>({model,stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify(turn())}],...extra});
const response=(body,status=200)=>({status,json:async()=>body});
const withKey=async fn=>{const previous=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY=key;try{return await fn();}finally{if(previous===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=previous;}};
const call=options=>apiCall({prompt:adapters.prompt.intentSystemPrompt,input:{sourceUnits:[]},route:routes.quick,adapters,...options});

test('API bodies match independently captured native Anthropic bodies for every production route',()=>withKey(async()=>{
 for(const [name,route] of Object.entries(routes)){
  const input={sourceUnits:[{id:'s0',text:'The exact input'}]},prompt=adapters.prompt.intentSystemPrompt;
  let nativeBody,fetchOptions;
  const native=adapters.transport.nativeModelTransport({prompt,model:route.model,requestIdFactory:()=>`parity:${name}`,native:async(_action,request)=>{
   assert.equal(request.service,'anthropic');nativeBody=request.body;return {status:200,body:answer(request.body.model)};
  }});
  const expected=await native(input,{route});
  const result=await call({prompt,input,route,fetchImpl:async(url,options)=>{
   assert.equal(url,API_ENDPOINT);fetchOptions=options;return response(answer(JSON.parse(options.body).model));
  }});
  assert.deepEqual(JSON.parse(fetchOptions.body),nativeBody,name);
  assert.deepEqual(result.output,expected);assert.equal(fetchOptions.redirect,'error');assert.equal(fetchOptions.method,'POST');
  assert.deepEqual(fetchOptions.headers,{'Content-Type':'application/json','x-api-key':key,'anthropic-version':API_VERSION});
  assert.equal(fetchOptions.body.includes(key),false);assert.equal(JSON.stringify(result).includes(key),false);
  assert.equal(nativeBody.max_tokens,route.maxTokens);assert.equal(result.record.transport,'API transport');assert.equal(result.record.status,200);
 }
}));

test('API endpoint, headers, maximum timeout and budgets stay aligned with Java limits',async()=>{
 const gateway=await readFile(path.join(repo,'app/src/main/java/com/rpm/prototype/ModelGateway.java'),'utf8');
 const limits=await readFile(path.join(repo,'app/src/main/java/com/rpm/prototype/ModelLimits.java'),'utf8');
 assert.ok(gateway.includes(API_ENDPOINT));assert.ok(gateway.includes(`"anthropic-version","${API_VERSION}"`));
 assert.ok(gateway.includes('"x-api-key",key'));assert.ok(gateway.includes('"Content-Type","application/json"'));
 assert.ok(gateway.includes('setInstanceFollowRedirects(false)'));assert.ok(gateway.includes('setConnectTimeout(8000)'));assert.ok(gateway.includes('setReadTimeout(readTimeout)'));
 const nativeLimits={};
 for(const [name,model] of [['HAIKU',adapters.policy.HAIKU_MODEL],['SONNET',adapters.policy.SONNET_MODEL]]){
  const match=limits.match(new RegExp(`${name}_LIMIT\\s*=\\s*new Limit\\((\\d+),(\\d+)\\)`));
  assert.ok(match,`the native ${name} limit is explicit`);
  nativeLimits[model]={maxTokens:Number(match[1]),timeoutMs:Number(match[2])};
  assert.equal(nativeLimits[model].maxTokens,16000,`${name} can carry the long output budget`);
  assert.equal(nativeLimits[model].timeoutMs,API_TIMEOUT_MS,`${name} read timeout matches the API transport ceiling`);
 }
 for(const [name,route] of Object.entries(routes)){
  const nativeLimit=nativeLimits[route.model];assert.ok(nativeLimit,`${name} has a native model limit`);
  assert.ok(route.maxTokens<=nativeLimit.maxTokens,`${name} output budget fits the native cap`);
  assert.ok(route.timeoutMs<=nativeLimit.timeoutMs,`${name} deadline fits the native read timeout`);
 }
 assert.deepEqual(Object.values(routes).map(r=>r.timeoutMs),[25000,35000,90000,90000]);
});

test('API records allowlisted response shapes without text, thinking, signatures or arbitrary type names',()=>withKey(async()=>{
 const text=JSON.stringify(turn()),thinking=`private thinking ${key}`,signature=`private signature ${key}`;
 const content=[{type:'thinking',thinking,signature},{type:'thinking',thinking:'more'},{type:'text',text},
  {type:'redacted_thinking',data:signature},{type:'tool_use',id:key,name:key,input:{secret:key}},
  {type:key,text:key,thinking:key},{type:'constructor',text:key},{type:'__proto__',thinking:key},null];
 const result=await call({fetchImpl:async()=>response(answer('claude-haiku-5-5',{content,usage:{input_tokens:100,output_tokens:6020,thinking_tokens:6000}}))});
 assert.deepEqual(result.record.responseShape,{contentTypes:{thinking:2,text:1,redacted_thinking:1,tool_use:1},textChars:text.length,thinkingChars:thinking.length+4});
 assert.deepEqual(result.record.usage,{input_tokens:100,output_tokens:6020});
 for(const secret of [text,thinking,signature,key])assert.equal(JSON.stringify(result.record).includes(secret),false);
}));

test('a truncated response retains safe thinking and text lengths before interpretation fails',()=>withKey(async()=>{
 const thinking=`hidden ${key}`,text=`{"partial":"${key}`;
 for(const hasText of [false,true]){
  const content=[{type:'thinking',thinking,signature:key},...(hasText?[{type:'text',text}]:[])];
  await assert.rejects(call({fetchImpl:async()=>response(answer('claude-haiku-5-5',{
   stop_reason:'max_tokens',content,usage:{input_tokens:100,output_tokens:16000},
  }))}),error=>{
   assert.equal(error.code,'INVALID_MODEL_RESPONSE');assert.equal(error.record.stopReason,'max_tokens');
   assert.deepEqual(error.record.responseShape,{contentTypes:{thinking:1,...(hasText?{text:1}:{})},textChars:hasText?text.length:0,thinkingChars:thinking.length});
   assert.deepEqual(error.record.usage,{input_tokens:100,output_tokens:16000});
   for(const secret of [text,thinking,key])assert.equal(JSON.stringify(error.record).includes(secret),false);
   return true;
  });
 }
}));

test('HTTP failures never read provider bodies, retry, or expose secrets and retain status',()=>withKey(async()=>{
 for(const status of [401,429,500,529]){
  let calls=0;
  await assert.rejects(call({fetchImpl:async()=>{calls++;return {status,json:()=>{throw new Error(key);}};}}),error=>{
   assert.equal(error.code,'TRANSPORT_ERROR');assert.equal(error.record.status,status);assert.equal(error.record.costUSD,null);
   assert.equal((error.message+JSON.stringify(error.record)).includes(key),false);return true;
  });assert.equal(calls,1);
 }
}));

test('API network, JSON and model failures are static and preserve safe usage before interpretation validation',()=>withKey(async()=>{
 for(const fetchImpl of [async()=>{throw new Error(key);},async()=>({status:200,json:async()=>{throw new Error(key);}})]){
  await assert.rejects(call({fetchImpl}),error=>{assert.equal(error.code,'TRANSPORT_ERROR');assert.ok(error.record);assert.ok(!error.message.includes(key));return true;});
 }
 for(const extra of [{content:[{type:'text',text:key}]},{stop_reason:'max_tokens'},{content:[{type:'text',text:'{}'}]}]){
  await assert.rejects(call({fetchImpl:async()=>response(answer('claude-haiku-5-5',extra))}),error=>{
   assert.equal(error.code,'INVALID_MODEL_RESPONSE');assert.equal(error.record.usage.input_tokens,100);assert.ok(error.record.costUSD>0);
   assert.equal(JSON.stringify(error.record).includes(key),false);assert.equal(error.message.includes(key),false);return true;
  });
 }
 for(const model of [key,'claude-haiku-5-5-'+key,'claude-sonnet-5-5']){
  await assert.rejects(call({fetchImpl:async()=>response(answer(model,{usage:{input_tokens:100,output_tokens:20,secret:key}}))}),error=>{
   assert.equal(error.code,'TRANSPORT_ERROR');assert.equal(error.record.servedModel,null);assert.equal(JSON.stringify(error.record).includes(key),false);return true;
  });
 }
 const dated=await call({fetchImpl:async()=>response(answer('claude-haiku-5-5-20261001'))});assert.equal(dated.record.servedModel,'claude-haiku-5-5-20261001');
}));

test('parent cancellation and total deadline abort fetch without leaking its rejection',()=>withKey(async()=>{
 for(const how of ['signal','deadline','route']){
  const controller=new AbortController();let seenSignal;
  const promise=call({signal:controller.signal,...(how==='deadline'?{deadline:Date.now()+5}:{}),...(how==='route'?{route:{...routes.quick,timeoutMs:5}}:{}),fetchImpl:async(_url,{signal})=>{
   seenSignal=signal;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error(key)),{once:true});});
  }});
  if(how==='signal')controller.abort();
  await assert.rejects(promise,error=>{assert.equal(error.code,'TRANSPORT_ERROR');assert.equal(error.record.status,null);assert.ok(!error.message.includes(key));return true;});assert.equal(seenSignal.aborted,true);
 }
 const controller=new AbortController();controller.abort();let fetched=false;
 await assert.rejects(call({signal:controller.signal,fetchImpl:async()=>{fetched=true;}}));assert.equal(fetched,false);
}));

test('invalid-response repair hints match the phone and retain stop reason without secrets',()=>withKey(async()=>{
 const body=answer('claude-haiku-5-5',{stop_reason:'max_tokens'});
 let phoneError;try{adapters.claude.readClaudeResponse(body,{model:routes.quick.model});}catch(error){phoneError=error;}
 await assert.rejects(call({fetchImpl:async()=>response(body)}),error=>{
  assert.equal(error.message,phoneError.message);assert.equal(error.code,phoneError.code);assert.equal(error.record.stopReason,'max_tokens');return true;
 });
 await assert.rejects(call({fetchImpl:async()=>response(answer('claude-haiku-5-5',{content:[{type:'text',text:JSON.stringify({[key]:true})}]}))}),error=>{
  assert.ok(!error.message.includes(key));assert.ok(!error.stack.includes(key));return true;
 });
}));

test('missing environment key makes no request',async()=>{
 const previous=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;
 try{await assert.rejects(call({fetchImpl:async()=>assert.fail('no request without key')}),error=>error.code==='TRANSPORT_ERROR'&&error.record.costUSD===null);}
 finally{if(previous!==undefined)process.env.ANTHROPIC_API_KEY=previous;}
});

test('usage whitelist and pricing account for both cache TTLs and never call missing usage free',()=>{
 const usage=safeUsage({input_tokens:100,output_tokens:20,cache_read_input_tokens:50,cache_creation_input_tokens:30,cache_creation:{ephemeral_5m_input_tokens:10,ephemeral_1h_input_tokens:20,secret:key},secret:key});
 assert.equal(JSON.stringify(usage).includes(key),false);
 assert.equal(apiCost('claude-haiku-5-5',usage),(10+10+0.5+1.25+4)/1000000);
 assert.equal(apiCost('claude-sonnet-5-5',usage),(200+200+5+25+80)/1000000);
 assert.equal(apiCost('claude-haiku-5-5',{input_tokens:100001,output_tokens:0}),100001*0.1*5/1000000);
 assert.equal(apiCost('claude-haiku-5-5',{input_tokens:100000,output_tokens:0}),0.01);
 assert.equal(apiCost('claude-haiku-5-5',null),null);assert.equal(apiCost('claude-haiku-5-5',{input_tokens:2}),null);
 assert.deepEqual(safeUsage({input_tokens:key,output_tokens:-1,cache_creation_input_tokens:Infinity}),null);
});

test('API options, skipped CLI probe reporting, route percentiles and incomplete costs are explicit',()=>{
 assert.equal(parseOptions([]).transport,'cli');assert.equal(parseOptions(['--transport','api']).transport,'api');
 for(const args of [['--transport','other'],['--transport'],['--transport','api','--judge'],['--transport','api','--probe-only']])assert.throws(()=>parseOptions(args));
 const results=[{ms:1,pass:true,failures:[],turns:[{calls:[10,20,30,40].map((ms,i)=>({routeUsed:'long',record:{ms,status:200,usage:{input_tokens:1,output_tokens:2},costUSD:i?0.01:null}}))}]}];
 const summary=summarize(results);assert.deepEqual(summary.routeLatencyMs.long,{count:4,measured:4,p50:20,p95:40});assert.equal(summary.usage.costUSD,null);assert.equal(summary.costComplete,false);
 const report=reportMarkdown({transport:'api',summary,results,probe:{skipped:true},wallMs:1});
 assert.match(report,/API transport/);assert.match(report,/CLI version and isolation probe skipped/);assert.match(report,/Cost incomplete/);assert.doesNotMatch(report,/Strict custom-prompt-only|CLI startup|StructuredOutput framing/);
});

test('API runtime saves receipts and failure records without credentials in artifacts',()=>withKey(async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-stress-api-'));
 const expect={created:[],forbidden:[],changes:[],unchanged:[101,102,103,104,105,106],maxNew:0,question:'forbidden',health:{waterDelta:2,mealSkipped:'lunch'}};
 const text='Log two glasses of water and mark lunch skipped.';
 let paidCalls=0;
 try{
  const result=await runCase({id:'body-receipts',tags:[],turns:[{text}],expect},{modules:adapters,directory:path.join(directory,'body'),transport:'api',fetchImpl:async(_url,options)=>{
   paidCalls++;const body=JSON.parse(options.body),input=JSON.parse(body.messages[0].content);
   const output=turn(text,[operation([field('title','Water',null,'suggested'),field('count',2,'two glasses')],{opId:'water1',entity:'water'}),operation([field('title','lunch skipped','lunch skipped'),field('slot','lunch','lunch'),field('state','skipped','skipped')],{opId:'lunch1',entity:'meal'})]);
   output.decisions=input.sourceUnits.map(u=>({sourceId:u.id,disposition:'action',note:null}));return response(answer(body.model,{content:[{type:'text',text:JSON.stringify(output)}]}));
  }});
  assert.deepEqual(result.failures,[]);assert.equal(paidCalls,1);assert.deepEqual(result.turns[0].receiptLines.map(l=>l.verb),['Logged','Skipped']);assert.ok(result.turns[0].undoId);assert.equal(result.turns[0].calls[0].routeUsed,'quick');
  assert.equal((await readFile(path.join(directory,'body','turn-1.json'),'utf8')).includes(key),false);
  const failure=await runCase({id:'http-failure',tags:[],turns:[{text:'Buy milk'}],expect:{...expect,health:undefined}},{modules:adapters,directory:path.join(directory,'failure'),transport:'api',fetchImpl:async()=>response({error:{message:key}},429)});
  assert.ok(failure.turns[0].calls.length);for(const c of failure.turns[0].calls){assert.equal(c.record.status,429);assert.equal(c.record.isError,true);}
  assert.equal((await readFile(path.join(directory,'failure','turn-1.json'),'utf8')).includes(key),false);
 }finally{await rm(directory,{recursive:true,force:true});}
}));
