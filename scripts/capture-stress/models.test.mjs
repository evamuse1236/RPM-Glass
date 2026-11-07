import test from 'node:test';
import assert from 'node:assert/strict';
import {swappedTransport,modelOptions,summarize} from './models.mjs';
import {MODEL_ROUTES} from '../../intent-v2/src/model-policy.mjs';

const fakeNative=()=>{
 const sent=[];
 const native=async(type,{service,body})=>{
  if(type!=='model')return {};
  sent.push({service,body});
  return {missingKey:true};
 };
 return {native,sent};
};

test('a Haiku route goes to the tested model and a Sonnet route stays on Sonnet', async()=>{
 const {native,sent}=fakeNative();
 const model=swappedTransport('minimax/minimax-m3',{native,prompt:'p'});
 const run={};
 await model({text:'x'},{route:MODEL_ROUTES.quick,run}).catch(()=>{});
 await model({text:'x'},{route:MODEL_ROUTES.hard}).catch(()=>{});
 assert.equal(sent[0].body.model,'minimax/minimax-m3');
 assert.deepEqual(sent[0].body.reasoning,{effort:'none',exclude:true});
 assert.equal(run.model,'minimax/minimax-m3');
 assert.match(sent.at(-1).body.model,/sonnet/);
});

test('a model that cannot turn reasoning off is sent no reasoning setting', async()=>{
 const {native,sent}=fakeNative();
 await swappedTransport('liquid/lfm-2.5-2.6b',{native,prompt:'p'})({text:'x'},{route:MODEL_ROUTES.quick}).catch(()=>{});
 assert.equal(sent[0].body.model,'liquid/lfm-2.5-2.6b');
 assert.equal('reasoning' in sent[0].body,false);
});

test('haiku keeps the phone transport', async()=>{
 const {native,sent}=fakeNative();
 await swappedTransport('haiku',{native,prompt:'p'})({text:'x'},{route:MODEL_ROUTES.quick}).catch(()=>{});
 assert.match(sent[0].body.model,/haiku/);
});

test('options and summary', ()=>{
 assert.deepEqual(modelOptions(['--models','a/b,c/d','--runs','2']).models,['a/b','c/d']);
 assert.throws(()=>modelOptions(['--runs','0']));
 const [s]=summarize([{model:'m',read:true,ms:1000,sonnet:false,runs:[{cost:0.01}]},{model:'m',read:false,ms:null,sonnet:true,runs:[]}]);
 assert.deepEqual([s.read,s.notRead,s.sonnet,s.medianMs],[1,1,1,1000]);
});
