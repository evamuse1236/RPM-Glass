import test from 'node:test';
import assert from 'node:assert/strict';
import {setupTransport,SETUPS,setupsOptions,bridgeFetch} from './setups.mjs';
import {MODEL_ROUTES} from '../../intent-v2/src/model-policy.mjs';

const fakeNative=()=>{const sent=[];return {sent,native:async(type,{service,body})=>{if(type==='model')sent.push({service,body});return {missingKey:true};}};};
const send=async(setup,route)=>{const {native,sent}=fakeNative();await setupTransport(SETUPS[setup],{native,prompt:'p'})({text:'x'},{route}).catch(()=>{});return sent.map(s=>s.body.model);};

test('each setup sends first reads and redos to its own models', async()=>{
 assert.match((await send('haiku',MODEL_ROUTES.quick))[0],/haiku/);
 assert.match((await send('haiku',MODEL_ROUTES.hard))[0],/sonnet/);
 assert.equal((await send('terra',MODEL_ROUTES.quick))[0],'openai/gpt-6.1-terra');
 assert.equal((await send('terra',MODEL_ROUTES.hard))[0],'openai/gpt-6.1-terra');
 assert.match((await send('haiku+terra',MODEL_ROUTES.careful))[0],/haiku/);
 assert.equal((await send('haiku+terra',MODEL_ROUTES.hard))[0],'openai/gpt-6.1-terra');
});

test('a redo keeps the route effort', async()=>{
 const {native,sent}=fakeNative();
 await setupTransport(SETUPS.terra,{native,prompt:'p'})({text:'x'},{route:MODEL_ROUTES.hard}).catch(()=>{});
 assert.deepEqual(sent[0].body.reasoning,{effort:'high',exclude:true});
});

test('only non-Claude, non-OpenAI models get the simplified schema', async()=>{
 const seen=[];const f=bridgeFetch(async(_,init)=>{seen.push(JSON.parse(init.body).response_format.json_schema.schema);return new Response('{}');});
 const body=m=>({body:JSON.stringify({model:m,response_format:{json_schema:{schema:{marker:true}}}})});
 await f('u',body('openai/gpt-6.1-terra'));await f('u',body('minimax/minimax-m3'));
 assert.equal(seen[0].marker,true);assert.notEqual(seen[1].marker,true);
});

test('unknown setups are refused', ()=>{assert.throws(()=>setupsOptions(['--setups','opus']));});
