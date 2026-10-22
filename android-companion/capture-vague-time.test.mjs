import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime} from '../cli/interpret.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
const now=new Date('2026-10-19T04:30:00Z');

test('meal and bedtime anchors save a day without manufacturing a clock',()=>{
 for(const [words,day] of [['after lunch','2026-10-19'],['before breakfast','2026-10-19'],['after dinner','2026-10-19'],['before bed','2026-10-19'],['tomorrow after lunch','2026-10-20'],['after lunch on Friday','2026-10-23']]){
  const parsed=interpretTime(words,now);
  assert.equal(parsed.status,'date_only',words);assert.equal(parsed.plannedDate,day,words);assert.equal(parsed.planned,null,words);
 }
 for(const words of ['sometime after lunch','next week after lunch','after lunch someday'])assert.equal(interpretTime(words,now).plannedDate,null,words);
 assert.equal(interpretTime('tomorrow after lunch at 3 pm',now).planned,'2026-10-20T09:30:00.000Z');
});

test('a meal-relative Capture saves today with exact words, one receipt and working Undo',async()=>{
 const data=freshStore(),backend=createMemoryBackend(data),text='print my boarding pass after lunch';
 const service=createIntentService({backend,model:async()=>turn(text,[operation([field('title','Print my boarding pass','print my boarding pass'),field('time','after lunch','after lunch')])]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'ready',start:0,end:Date.parse('2027-01-01'),events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'meal-time',conversationId:data.conversations[0].id,text});
 assert.equal(result.applied?.status,'applied');
 const saved=await backend.load(),task=saved.entries[0];
 assert.equal(task.plannedDate,'2026-10-19');assert.equal(task.planned,null);assert.equal(task.raw,text);
 assert.ok(result.applied.undoId);
 const draft=saved.intentV2.drafts[result.draftId];
 await agent.undo({draftId:draft.id,conversationId:draft.conversationId,actionId:'undo-meal-time',undoId:result.applied.undoId});
 assert.equal((await backend.load()).entries.length,0);
});
