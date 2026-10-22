import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,seed,turn,operation,field,getDraft} from './helpers.mjs';
import {buildContext} from '../src/context.mjs';
import {stable} from '../src/context.mjs';
import {intentViewFromData} from '../../android-companion/intent-service.mjs';

const DINNER='Make dinner tonight at 7';
const dinnerDraft=()=>turn(DINNER,[operation([field('title','Make dinner',DINNER),field('time',null,null,'stated','unknown')],{opId:'dinner'})],{question:{opId:'dinner',field:'time',prompt:'7 AM or 7 PM?',options:[{label:'7 PM',value:'7pm'},{label:'7 AM',value:'7am'}]}});
const prose=(raw,reply)=>turn(raw,[],{mode:'reflect',draftMode:'none',reply,decisions:[{sourceId:'s0',disposition:'reflection',note:raw}]});
const send=(s,messageId,text,extra={})=>s.harness.capture({messageId,conversationId:'c1',text,...extra});
const captureOf=async(s,id)=>(await s.repository.load()).intentV2.captures[id];

test('a reply to a draft that asked a question inherits that draft, with the question the person saw',async()=>{
 const seen=[];const s=setup(async input=>{seen.push(input);return seen.length===1?dinnerDraft():prose('Delete this','Which one should I delete?');});
 const first=await send(s,'m0',DINNER);
 await send(s,'m1','Delete this');
 const [,input]=seen;
 assert.equal(input.activeDraft.id,first.draftId);
 assert.deepEqual(input.activeDraft.question,{prompt:'7 AM or 7 PM?',field:'time',options:['7 PM','7 AM']});
 assert.equal(input.context.focus.draftId,first.draftId);
 assert.deepEqual((await captureOf(s,'m1')).focus,{draftId:first.draftId,draftRevision:1,explicit:false,questionId:null,fromMessageId:'m0'});
});

test('after a question asked in prose, the next reply still points at the same draft',async()=>{
 const seen=[];const s=setup(async input=>{seen.push(input);return seen.length===1?dinnerDraft():prose(input.sourceUnits[0].text,'Which one should I delete? The draft is about tonight’s dinner, and the alarm is already set.');});
 const first=await send(s,'m0',DINNER);
 await send(s,'m1','Delete this');
 await send(s,'m2','That one only');
 assert.equal(seen[2].activeDraft.id,first.draftId,'turn 2 carries the dinner draft');
 assert.equal((await captureOf(s,'m2')).focus.fromMessageId,'m1');
 await send(s,'m3','Both');
 assert.equal(seen[3].activeDraft.id,first.draftId);
});

test('an answer that asked nothing passes no focus on, and an explicit Edit tap wins',async()=>{
 let n=0;const s=setup(async()=>++n===1?dinnerDraft():n===2?prose('Thanks','Glad to help.'):turn('Buy milk',[operation([field('title','Buy milk','Buy milk')])]));
 const first=await send(s,'m0',DINNER);
 await send(s,'m1','Thanks',{focusDraftId:first.draftId});
 assert.equal((await captureOf(s,'m1')).focus.explicit,true);
 await send(s,'m2','Buy milk');
 assert.equal((await captureOf(s,'m2')).focus,null);
});

test('the saved request payload stays {conversationId,text,focusDraftId}, so a resend is not a reused ID',async()=>{
 let calls=0;const s=setup(async()=>++calls===1?dinnerDraft():prose('Delete this','Which one?'));
 await send(s,'m0',DINNER);await send(s,'m1','Delete this');
 const receipt=(await s.repository.load()).intentV2.transactions['capture:m1'];
 assert.equal(receipt.signature,stable({conversationId:'c1',text:'Delete this',focusDraftId:null}));
 await send(s,'m1','Delete this');assert.equal(calls,2);
});

test('an old capture with only focusDraftId still loads and reads against its draft',async()=>{
 const data=seed();
 data.intentV2={schema:1,captures:{
  old:{messageId:'old',conversationId:'c1',raw:DINNER,at:'2026-09-16T03:00:00.000Z',timezone:'Asia/Kolkata',focusDraftId:null,focusRevision:null,status:'interpreted',draftId:'draft-old',decisions:[{sourceId:'s0',disposition:'action',note:null}],reply:'7 AM or 7 PM?',memoryCandidates:[],card:null},
  next:{messageId:'next',conversationId:'c1',raw:'7 pm',at:'2026-09-16T03:30:00.000Z',timezone:'Asia/Kolkata',focusDraftId:'draft-old',focusRevision:1,status:'captured'}},
  drafts:{'draft-old':{id:'draft-old',conversationId:'c1',revision:1,status:'draft',created:'2026-09-16T03:00:00.000Z',operations:dinnerDraft().operations.map(o=>({...o,fields:o.fields.map(f=>({...f,sourceMessageId:'old'})),sourceMessageIds:['old']})),guards:{},question:dinnerDraft().question,sourceMessageIds:['old'],reply:'7 AM or 7 PM?'}},
  transactions:{},approvedMemories:[],sortPreviews:{}};
 assert.equal(intentViewFromData(data,{conversationId:'c1'}).captures.length,2);
 let seen;const s=setup(async input=>{seen=input;return turn('7 pm',[operation([field('time','7 pm','7 pm')],{opId:'dinner'})],{draftMode:'amend'});},{seed:data});
 const r=await s.harness.interpret('next');
 assert.equal(r.status,'interpreted');assert.equal(seen.activeDraft.id,'draft-old');
 assert.equal((await getDraft(s.repository,'draft-old')).operations[0].fields.find(f=>f.name==='time').value,'7 pm');
});

test('the item the conversation points at is in context even when no word matches it',()=>{
 const data=seed();data.entries=Array.from({length:30},(_,i)=>({id:i+1,kind:'plan',title:`Errand number ${i+1}`,done:false,archived:false}));
 const plain=buildContext(data,{raw:'errand',conversationId:'c1'});
 const target=plain.entities.some(e=>e.id==='30')?'1':'30';
 const pointed=buildContext(data,{raw:'errand',conversationId:'c1',focus:{targets:[{entity:'task',id:target}]}});
 assert.equal(pointed.entities[0].id,target);
});
