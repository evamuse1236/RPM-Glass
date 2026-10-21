import test from 'node:test';
import assert from 'node:assert/strict';
import {mercuryCall,comparisonSummary,OPENROUTER_ENDPOINT,SPEED_CASE_IDS} from './compare-models.mjs';
import {targetModules} from './runtime.mjs';
import {loadCorpus} from './run.mjs';
import {turn} from '../../intent-v2/test/helpers.mjs';

const adapters=await targetModules(process.cwd());
const route={model:'inception/mercury-3',effort:'none',timeoutMs:15000,maxTokens:4000};
const privateKey='private-openrouter-fixture';
async function withKey(fn){
 const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY=privateKey;
 try{await fn();}finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
}
const call=options=>mercuryCall({prompt:'production prompt',input:{sourceUnits:[]},route,adapters,...options});
const answer=extra=>({model:route.model,usage:{prompt_tokens:100,completion_tokens:25,cost:0.001},choices:[{finish_reason:'stop',message:{content:JSON.stringify(turn())}}],...extra});

test('Mercury comparison uses the production OpenRouter request and local parser',()=>withKey(async()=>{
 const result=await call({fetchImpl:async(url,init)=>{
  assert.equal(url,OPENROUTER_ENDPOINT);assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,`Bearer ${privateKey}`);
  assert.deepEqual(JSON.parse(init.body),adapters.transport.structuredRequest({model:route.model,prompt:'production prompt',input:{sourceUnits:[]},maxTokens:4000,effort:'none'}));
  return {status:200,json:async()=>answer()};
 }});
 assert.deepEqual(result.output,turn());assert.equal(result.record.costUSD,0.001);assert.equal(result.record.servedModel,route.model);
 assert.equal(JSON.stringify(result).includes(privateKey),false);
}));

test('Mercury failures retain static errors and safe usage without provider content',()=>withKey(async()=>{
 for(const [status,body,code] of [[429,{},'TRANSPORT_ERROR'],[200,answer({model:privateKey}),'TRANSPORT_ERROR'],[200,answer({choices:[{finish_reason:'length',message:{content:privateKey}}]}),'INVALID_MODEL_RESPONSE']]){
  await assert.rejects(call({fetchImpl:async()=>({status,json:async()=>body})}),error=>{
   assert.equal(error.code,code);assert.equal(error.record.status,status);assert.equal(JSON.stringify(error.record).includes(privateKey),false);assert.equal(error.message.includes(privateKey),false);return true;
  });
 }
}));

test('Mercury parent cancellation reaches fetch',()=>withKey(async()=>{
 const controller=new AbortController();
 const pending=call({signal:controller.signal,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error(privateKey)),{once:true}))});
 controller.abort();await assert.rejects(pending,error=>error.code==='TRANSPORT_ERROR'&&!error.message.includes(privateKey));
}));

test('the comparison uses ten real mixed cases and counts schema validity separately from saved-state checks',async()=>{
 const {cases}=await loadCorpus(),selected=SPEED_CASE_IDS.map(id=>cases.find(c=>c.id===id));
 assert.equal(selected.length,10);assert.ok(selected.every(Boolean));assert.ok(selected.some(c=>c.turns[0].text.length>1500));assert.ok(selected.some(c=>c.turns[0].text.length<50));
 assert.deepEqual(comparisonSummary([{pass:false,turns:[{calls:[{record:{ms:20},output:{}},{record:{ms:10,isError:true}}]}]},{pass:true,turns:[{calls:[]}]}]),{
  cases:2,checksPassed:1,checksPassRate:0.5,calls:2,validOutputs:1,validOutputRate:0.5,callMs:{p50:10,p95:20},
 });
});
