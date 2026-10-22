import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,turn,captured,actionFor,getDraft} from './helpers.mjs';
import {userMessage} from '../../android-companion/user-message.mjs';

test('a stale focus saves the words first, says so plainly, and Retry reads them on their own',async()=>{
 const seen=[];const s=setup(async input=>{seen.push(input);return turn(seen.length===1?'Plan the lesson':'Delete this',seen.length===1?undefined:[],seen.length===1?{}:{mode:'reflect',draftMode:'none',decisions:[{sourceId:'s0',disposition:'reflection',note:'Delete this'}]});});
 const {draft}=await captured(s);
 await s.harness.act(actionFor(draft,'dismiss'),{actionId:'park'});
 const r=await s.harness.capture({messageId:'m2',conversationId:'c1',text:'Delete this',focusDraftId:draft.id});
 assert.equal(r.status,'captured');assert.equal(r.code,'STALE_FOCUS');
 assert.equal(r.error,userMessage(new Error(r.error)));assert.match(r.error,/Your words are saved/);
 const saved=(await s.repository.load()).intentV2.captures.m2;
 assert.equal(saved.raw,'Delete this');assert.equal(saved.lastError.code,'STALE_FOCUS');assert.equal(seen.length,1);
 const again=await s.harness.interpret('m2');
 assert.equal(again.status,'interpreted');assert.equal(seen.length,2);assert.equal(seen[1].activeDraft,null);
 assert.equal((await getDraft(s.repository,draft.id)).status,'parked');
});

test('a focus from another conversation is not a rejection either',async()=>{
 const s=setup();const {draft}=await captured(s);
 const r=await s.harness.capture({messageId:'m2',conversationId:'c2',text:'Plan the lesson',focusDraftId:draft.id});
 assert.equal(r.code,'STALE_FOCUS');assert.equal((await s.repository.load()).intentV2.captures.m2.raw,'Plan the lesson');
});

test('every model attempt records a word-free summary of what it was given',async()=>{
 const s=setup(async(input,{run})=>{Object.assign(run,{inputTokens:13761});return turn();});
 await captured(s);
 await s.harness.capture({messageId:'m2',conversationId:'c1',text:'Plan the lesson'});
 const {m1,m2}=(await s.repository.load()).intentV2.captures,[a]=m1.modelRuns,[b]=m2.modelRuns;
 assert.equal(a.inputTokens,b.inputTokens);
 assert.notEqual(a.input.hash,b.input.hash);
 assert.equal(a.input.messageCount,0);
 assert.deepEqual(b.input.messages.map(m=>[m.id,m.role]),[['m1','user'],['m1:reply','assistant']]);
 assert.match(b.input.messages[0].hash,/^[0-9a-f]{16}$/);
 assert.ok(b.input.bytes>a.input.bytes);
 assert.equal(JSON.stringify([a.input,b.input]).includes('Plan the lesson'),false);
});
