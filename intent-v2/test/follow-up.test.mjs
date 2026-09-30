import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContext,sourceUnits} from '../src/context.mjs';
import {intentModelPolicy} from '../src/model-policy.mjs';
import {seed,setup,turn,operation,field,actionFor,captured} from './helpers.mjs';
import {intentViewFromData} from '../../android-companion/intent-service.mjs';
const NOW='2026-09-28T14:49:30.600Z';
const idea='I want to make a Wispr profile or a bot that helps me find freelance work.';
const follow='Just make it into a project for now and leave it be';
const clarification='The task I just mentioned to you before';
function fixture(){const d=seed();d.entries=[{id:16,kind:'plan',title:'Finish one WID assessment',done:false,archived:false}];d.intentV2={schema:1,captures:{idea:{messageId:'idea',conversationId:'c1',raw:idea,at:'2026-09-28T14:48:37.914Z',status:'interpreted',reply:'What would the Wispr bot help with?'},follow:{messageId:'follow',conversationId:'c1',raw:follow,at:'2026-09-28T14:49:19.161Z',status:'interpreted',reply:'Which item do you mean?'}},drafts:{},transactions:{},approvedMemories:[]};return d;}
const bad=raw=>turn(raw,[operation([field('title','Finish one WID assessment',raw)],{entity:'project'})]);

test('referential project follow-ups use high, ordinary captures remain none',()=>{
 for(const raw of [follow,clarification,'Turn that idea into a project','Add the one we discussed earlier'])assert.equal(intentModelPolicy({input:{sourceUnits:sourceUnits(raw)}}).effort,'high',raw);
 for(const raw of ['Buy milk','Read tomorrow','Call Alex at 3pm'])assert.equal(intentModelPolicy({input:{sourceUnits:sourceUnits(raw)}}).effort,'none',raw);
});
test('recent conversation survives a crowded retrieval budget and excludes future turns',()=>{
 const d=fixture();d.entries=Array.from({length:16},(_,i)=>({id:i,kind:'plan',title:'Large saved task '+('context '.repeat(100)),done:false}));d.intentV2.captures.future={conversationId:'c1',raw:'Future topic must not influence a retry',at:'2026-09-29T00:00:00Z'};
 const c=buildContext(d,{raw:clarification,conversationId:'c1',now:new Date(NOW),maxChars:3000});assert.ok(JSON.stringify(c).length<=3000);assert.ok(c.recentMessages.some(m=>m.text===idea));assert.ok(!c.recentMessages.some(m=>m.text.includes('Future topic')));assert.equal(c.recentMessages.at(-1).text,'Which item do you mean?');
});
test('wrong saved-title selection fails closed even when substring evidence is valid',async()=>{
 const s=setup(async()=>bad(clarification),{seed:fixture(),clock:()=>new Date(NOW)});const r=await captured(s,clarification);assert.equal(r.result.status,'captured');assert.match(r.result.error,/FOLLOW_UP/);assert.equal(r.draft,null);assert.equal(s.adapter.calls,0);assert.equal((await s.repository.load()).intentV2.captures.m1.raw,clarification);
});
test('one repair may propose a title grounded in the preceding idea',async()=>{
 let calls=0;const s=setup(async input=>{if(++calls===1)return bad(clarification);assert.match(input.repair.validationError,/FOLLOW_UP/);return turn(clarification,[operation([field('title','Wispr freelance bot',null,'suggested')],{entity:'project'})]);},{seed:fixture(),clock:()=>new Date(NOW),maxRepairCalls:1});const r=await captured(s,clarification);assert.equal(r.result.status,'interpreted');assert.equal(calls,2);assert.equal(r.draft.operations[0].fields[0].value,'Wispr freelance bot');assert.equal(s.adapter.calls,0);
});
test('an explicitly named saved task may become a project',async()=>{
 const raw='Make Finish one WID assessment into a project',s=setup(async()=>bad(raw),{seed:fixture(),clock:()=>new Date(NOW)});assert.equal((await captured(s,raw)).result.status,'interpreted');
});
test('old incorrect draft is visibly blocked and cannot bypass review through commit',async()=>{
 const d=fixture(),id='old',draftId='draft-old';d.intentV2.captures[id]={messageId:id,conversationId:'c1',raw:clarification,at:NOW,status:'interpreted',draftId};
 d.intentV2.drafts[draftId]={id:draftId,conversationId:'c1',revision:1,status:'draft',created:NOW,sourceMessageIds:[id],operations:[{...bad(clarification).operations[0],fields:[{...bad(clarification).operations[0].fields[0],sourceMessageId:id}]}],guards:{},question:null};
 const s=setup(async()=>{throw new Error('No model needed');},{seed:d,clock:()=>new Date(NOW)}),draft=d.intentV2.drafts[draftId],view=intentViewFromData(d,{conversationId:'c1'}).captures[0].draft;
 assert.ok(view.validationNotice);assert.ok(!view.actions.some(a=>a.action.kind==='commit'));assert.ok(view.actions.some(a=>a.action.kind==='open'));await assert.rejects(s.harness.act(actionFor(draft),{actionId:'bad-save'}),/FOLLOW_UP/);assert.equal(s.adapter.calls,0);
 await s.harness.act(actionFor(draft,'set-field',{opId:'task1',field:'title',value:'Wispr freelance bot'}),{actionId:'explicit-edit'});const updated=(await s.repository.load()).intentV2.drafts[draftId];assert.equal(intentViewFromData(await s.repository.load(),{conversationId:'c1'}).captures[0].draft.validationNotice,null);assert.ok(updated.operations[0].fields[0].userActionId);
});
test('ambiguous referent can ask without creating anything',async()=>{
 const s=setup(async()=>turn(clarification,[],{draftMode:'none',reply:'Which idea do you mean?'}),{seed:fixture(),clock:()=>new Date(NOW)});const r=await captured(s,clarification);assert.equal(r.result.status,'interpreted');assert.equal(r.draft,null);
});
