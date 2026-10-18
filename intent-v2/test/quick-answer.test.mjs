import test from 'node:test';
import assert from 'node:assert/strict';
import {quickAnswer} from '../src/quick-answer.mjs';
import {setup,captured,NOW} from './helpers.mjs';

const at={now:new Date(NOW),timezone:'Asia/Kolkata'};

test('plain day questions get a card without the model',()=>{
 for(const q of ['What’s planned today?','give me my timetable','Show me my schedule','my plan for tomorrow','whats on today','today\'s agenda'])
  assert.equal(quickAnswer(q.replace('whats','what\'s'),at)?.kind,'agenda',q);
 assert.equal(quickAnswer('What’s planned today?',at).day,'2026-09-16');
 assert.equal(quickAnswer('my plan for tomorrow',at).day,'2026-09-17');
 assert.equal(quickAnswer('What’s next?',at).kind,'next');
 assert.equal(quickAnswer('how much water have I had today',at).kind,'water');
 assert.equal(quickAnswer('What did I eat today?',at).kind,'meals');
});

test('anything more than a plain question goes to the model',()=>{
 for(const q of ['What’s planned today, and move gym to 6','plan the lesson today','water the plants','What should I eat tonight?','Plan my week'])
  assert.equal(quickAnswer(q,at),null,q);
});

test('a quick answer is saved with its card and makes no model call',async()=>{
 let calls=0;const s=setup(async()=>{calls++;throw new Error('no model');});
 const {result}=await captured(s,'What’s planned today?');
 assert.equal(result.status,'interpreted');assert.equal(calls,0);
 const saved=(await s.repository.load()).intentV2.captures.m1;
 assert.deepEqual(saved.card,{kind:'agenda',day:'2026-09-16',targetId:null});
 assert.equal(saved.raw,'What’s planned today?');assert.equal(saved.draftId,null);
});
