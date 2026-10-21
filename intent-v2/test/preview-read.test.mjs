import test from 'node:test';
import assert from 'node:assert/strict';
import {intentModelPolicy} from '../src/model-policy.mjs';
import {READ_TTL_MS} from '../src/preview-read.mjs';
import {setup,turn,operation,field,seed,NOW} from './helpers.mjs';

const WORDS='Past paper section B on Thursday at 5 pm, must';
const answer=raw=>turn(raw,[operation([field('title','Past paper section B',raw),field('must',true,'must')])]);
function counted(reply=answer,{delay=0}={}){
 const calls=[];
 const model=async(input,{signal}={})=>{
  calls.push(input);
  if(delay)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,delay);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('cancelled','AbortError'));});});
  return reply(input.sourceUnits.map(u=>u.text).join(' '));
 };
 return {model,calls};
}
const make=(model,opts={})=>setup(model,{modelPolicy:intentModelPolicy,...opts});

test('a preview reads the typed words once and saves nothing',async()=>{
 const {model,calls}=counted(),set=make(model);
 const before=structuredClone(await set.repository.load());
 const read=await set.harness.preview({conversationId:'c1',text:WORDS});
 assert.equal(read.status,'read');
 assert.equal(calls.length,1);
 assert.equal(read.parsed.operations[0].fields.find(f=>f.name==='title').value,'Past paper section B');
 assert.equal(read.run.preview,true);
 assert.equal(read.run.reason,'capture');
 assert.deepEqual(await set.repository.load(),before,'no capture, draft or version change');
 assert.equal((await set.harness.preview({conversationId:'c1',text:WORDS})).run,null,'the same words again reuse the read');
 assert.equal(calls.length,1);
});

test('Enter on the same words reuses the preview: one model call in all',async()=>{
 const {model,calls}=counted(),set=make(model);
 await set.harness.preview({conversationId:'c1',text:WORDS});
 const result=await set.harness.capture({messageId:'m1',conversationId:'c1',text:WORDS});
 assert.equal(calls.length,1);
 const capture=(await set.repository.load()).intentV2.captures.m1;
 assert.equal(capture.raw,WORDS,'the exact words are saved');
 assert.equal(capture.calls,0);
 assert.equal(capture.modelRuns[0].reused,'preview');
 assert.equal(capture.modelRuns[0].ok,true);
 assert.ok(result.draftId);
 const draft=(await set.repository.load()).intentV2.drafts[result.draftId];
 assert.equal(draft.operations[0].fields.find(f=>f.name==='must').value,true);
});

test('Enter while the preview is still reading waits for it instead of asking again',async()=>{
 const {model,calls}=counted(answer,{delay:30}),set=make(model);
 const preview=set.harness.preview({conversationId:'c1',text:WORDS});
 await new Promise(r=>setTimeout(r,5));
 await set.harness.capture({messageId:'m1',conversationId:'c1',text:WORDS});
 assert.equal((await preview).status,'read');
 assert.equal(calls.length,1);
});

test('changed words, a changed plan or an old read each get their own model call',async()=>{
 let now=+new Date(NOW);
 const {model,calls}=counted(),set=make(model,{clock:()=>new Date(now)});
 await set.harness.preview({conversationId:'c1',text:WORDS});
 await set.harness.capture({messageId:'m1',conversationId:'c1',text:WORDS+' please'});
 assert.equal(calls.length,2,'other words');
 await set.harness.preview({conversationId:'c1',text:'Past paper section C on Friday, must'});
 now+=READ_TTL_MS+1;
 await set.harness.capture({messageId:'m2',conversationId:'c1',text:'Past paper section C on Friday, must'});
 assert.equal(calls.length,4,'a read older than two minutes is not reused');
});

test('the stale answer is dropped when the words change before it arrives',async()=>{
 const {model,calls}=counted(answer,{delay:30}),set=make(model);
 const controller=new AbortController();
 const preview=set.harness.preview({conversationId:'c1',text:WORDS},{signal:controller.signal});
 await new Promise(r=>setTimeout(r,5));
 controller.abort();
 const read=await preview;
 assert.notEqual(read.status,'read');
 assert.equal(read.parsed,undefined);
 assert.equal(set.harness.reads.size,0);
 await set.harness.capture({messageId:'m1',conversationId:'c1',text:WORDS});
 assert.equal(calls.length,2,'Enter reads again rather than use a cancelled read');
});

test('words the phone reads itself, questions, replies and heavy requests are never previewed',async()=>{
 const {model,calls}=counted(),set=make(model);
 assert.equal((await set.harness.preview({conversationId:'c1',text:'call mom tomorrow at 6 pm'})).status,'local');
 assert.equal((await set.harness.preview({conversationId:'c1',text:'What’s planned today?'})).status,'silent');
 assert.equal((await set.harness.preview({conversationId:'c1',text:'Re-plan my week around the exam'})).status,'silent');
 assert.equal((await set.harness.preview({conversationId:'c1',text:'x '.repeat(800)})).status,'silent');
 const draft={id:'d0',conversationId:'c1',revision:1,status:'draft',operations:[],question:null,sourceMessageIds:[]};
 const focused=make(model,{seed:{...seed(),intentV2:{schema:1,captures:{},drafts:{d0:draft},approvedMemories:[]}}});
 assert.equal((await focused.harness.preview({conversationId:'c1',text:WORDS,focusDraftId:'d0'})).status,'silent');
 assert.equal(calls.length,0);
});

test('without a key the preview is silent: no throw, nothing kept to reuse',async()=>{
 const set=make(async()=>{throw Object.assign(new Error('Connect a Claude or OpenRouter key in Settings, then tap Retry.'),{code:'TRANSPORT_ERROR'});});
 const read=await set.harness.preview({conversationId:'c1',text:WORDS});
 assert.equal(read.status,'failed');
 assert.equal(read.run.ok,false);
 assert.equal(set.harness.reads.size,0);
});
