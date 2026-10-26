import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,seed,turn,operation,field,getDraft,actionFor} from './helpers.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {sourceUnits} from '../src/context.mjs';
import {REMOVALS,removalOperations} from '../src/removal.mjs';
import {intentSystemPrompt} from '../prompts/intent-system.mjs';

const DINNER='Make dinner tonight';
const withAlarm=()=>{const d=seed();d.entries=[{id:41,kind:'plan',title:'Dinner with Asha',alertIntent:{type:'alarm'},done:false,archived:false,revisions:[]}];return d;};
const draftTurn=()=>turn(DINNER,[operation([field('title','Make dinner',DINNER)],{opId:'dinner'})]);
const removal=(raw,ops)=>turn(raw,ops,{decisions:sourceUnits(raw).map(u=>({sourceId:u.id,disposition:'action',note:null}))});
const archive=(entity,targetId,opId=entity)=>({opId,sourceId:'s0',kind:'archive',entity,targetId,fields:[]});
const visible=[{entity:'task',id:'41'},{entity:'block',id:'b1'},{entity:'draft',id:'d0'}];
const parse=(t,raw,extra={})=>interpretTurn(t,{units:sourceUnits(raw),messageId:'m1',visibleEntities:visible,...extra});

test('the removal table decides what may be archived: tasks and drafts, nothing else',()=>{
 assert.throws(()=>parse(removal('Delete the block',[archive('block','b1')]),'Delete the block'),/Removing a block is not supported/);
 assert.throws(()=>parse(removal('Delete it',[{...archive('task','41'),fields:[field('title','x','Delete it')]}]),'Delete it'),/without field patches/);
 assert.throws(()=>parse(removal('Rename it',[{opId:'d',sourceId:'s0',kind:'update',entity:'draft',targetId:'d0',fields:[]}]),'Rename it'),/only be set aside/);
 assert.throws(()=>parse({...removal('Delete it',[archive('draft','d0')]),draftMode:'amend'},'Delete it',{activeDraft:{operations:[]}}),/only be set aside/);
 assert.throws(()=>parse(removal('Delete it',[archive('draft','d9')]),'Delete it'),/not supplied/);
 assert.equal(parse(removal('Delete it',[archive('draft','d0')]),'Delete it').operations[0].entity,'draft');
});

test('removal operations: a task to Trash, a draft set aside, an alarm turned off, a calendar event refused',()=>{
 assert.deepEqual(removalOperations([{entity:'task',id:'41'},{entity:'draft',id:'d0'}],{sourceId:'s0'}).map(o=>[o.kind,o.entity,o.targetId]),[['archive','task','41'],['archive','draft','d0']]);
 const [off]=removalOperations([{entity:'alarm',id:'41'}],{sourceId:'s0'});
 assert.deepEqual([off.kind,off.entity,off.targetId,off.fields[0].name,off.fields[0].value],['update','task','41','alert','off']);
 assert.equal(removalOperations([{entity:'alarm',id:'41'},{entity:'task',id:'41'}],{sourceId:'s0'}).length,1,'trashing the task already silences its alarm');
 assert.throws(()=>removalOperations([{entity:'event',id:'e1'}],{sourceId:'s0'}),{message:REMOVALS.event.message});
});

test('the prompt states every removal rule from the table',()=>{
 for(const rule of Object.values(REMOVALS))assert.ok(intentSystemPrompt.includes(rule.rule),rule.rule);
});

test('a task and a draft removed together are one change, and one Undo restores both',async()=>{
 let n=0;const s=setup(async()=>++n===1?draftTurn():removal('Delete both',[archive('draft','draft-m0'),archive('task','41')]),{seed:withAlarm()});
 await s.harness.capture({messageId:'m0',conversationId:'c1',text:DINNER});
 const r=await s.harness.capture({messageId:'m1',conversationId:'c1',text:'Delete both',focusDraftId:'draft-m0'});
 const done=await s.harness.act(actionFor(await getDraft(s.repository,r.draftId)),{actionId:'commit-1'});
 assert.equal(done.status,'committed');assert.deepEqual(done.receipt.parkedDrafts,[{id:'draft-m0',status:'draft'}]);
 let data=await s.repository.load();
 assert.equal(data.entries[0].archived,true);assert.equal(data.intentV2.drafts['draft-m0'].status,'parked');
 await s.harness.undo({draftId:r.draftId,conversationId:'c1',actionId:'undo-1'});
 data=await s.repository.load();
 assert.equal(data.entries[0].archived,false);assert.equal(data.intentV2.drafts['draft-m0'].status,'draft');
 assert.equal(data.intentV2.drafts[r.draftId].status,'undone');
});

test('setting aside only a draft needs no planner change and still has Undo',async()=>{
 let n=0;const s=setup(async()=>++n===1?draftTurn():removal('Delete this',[archive('draft','draft-m0')]));
 await s.harness.capture({messageId:'m0',conversationId:'c1',text:DINNER});
 const r=await s.harness.capture({messageId:'m1',conversationId:'c1',text:'Delete this',focusDraftId:'draft-m0'});
 const done=await s.harness.act(actionFor(await getDraft(s.repository,r.draftId)),{actionId:'commit-1'});
 assert.equal(done.receipt.undoId,null);assert.equal(s.adapter.calls,0);
 assert.equal((await getDraft(s.repository,'draft-m0')).status,'parked');
 await s.harness.undo({draftId:r.draftId,conversationId:'c1',actionId:'undo-1'});
 assert.equal((await getDraft(s.repository,'draft-m0')).status,'draft');
});

test('a draft that closed before the change applies is not set aside twice',async()=>{
 let n=0;const s=setup(async()=>++n===1?draftTurn():removal('Delete this',[archive('draft','draft-m0')]));
 await s.harness.capture({messageId:'m0',conversationId:'c1',text:DINNER});
 const r=await s.harness.capture({messageId:'m1',conversationId:'c1',text:'Delete this',focusDraftId:'draft-m0'});
 await s.harness.act(actionFor(await getDraft(s.repository,'draft-m0'),'dismiss'),{actionId:'park'});
 await assert.rejects(s.harness.act(actionFor(await getDraft(s.repository,r.draftId)),{actionId:'commit-1'}),/TARGET_CHANGED|already closed/);
});

test('a task-like request cannot archive a saved task',async()=>{
 let calls=0;const raw='Answer Kris and Aria',s=setup(async()=>{calls++;return removal(raw,[archive('task','41')]);},{seed:withAlarm(),maxRepairCalls:1});
 const result=await s.harness.capture({messageId:'answer',conversationId:'c1',text:raw});
 assert.equal(result.draftId??null,null);
 const data=await s.repository.load();assert.equal(data.entries[0].archived,false);
 assert.equal(data.intentV2.captures.answer.raw,raw);
 assert.equal(calls,1);assert.match(result.error,/remove/i);
});

for(const raw of ['Remove the dinner task',"Remove the dinner task, I don't need it anymore",'Get rid of the dinner task','Scrap the dinner task','Dinner is not happening, remove it',"I won't go to dinner. Delete it",'Clear the dinner task','Dinner — no longer needed'])test(`removal saves without repair: ${raw}`,async()=>{
 let calls=0;const s=setup(async()=>{calls++;const op={...archive('task','41'),sourceId:sourceUnits(raw).at(-1).id};return removal(raw,[op]);},{seed:withAlarm(),maxRepairCalls:1});
 const result=await s.harness.capture({messageId:'remove',conversationId:'c1',text:raw});
 assert.ok(result.draftId);assert.equal(calls,1);
 const draft=await getDraft(s.repository,result.draftId);assert.equal(draft.reply,'Let’s make room for the next step.');
 await s.harness.act(actionFor(draft),{actionId:'commit'});
 assert.equal((await s.repository.load()).entries[0].archived,true);
});

for(const raw of ['Never mind','Not now'])test(`a draft can be set aside: ${raw}`,async()=>{
 let calls=0;const s=setup(async()=>++calls===1?draftTurn():removal(raw,[archive('draft','draft-m0')]),{maxRepairCalls:1});
 await s.harness.capture({messageId:'m0',conversationId:'c1',text:DINNER});
 const result=await s.harness.capture({messageId:'remove',conversationId:'c1',text:raw,focusDraftId:'draft-m0'});
 assert.ok(result.draftId);assert.equal(calls,2);
 await s.harness.act(actionFor(await getDraft(s.repository,result.draftId)),{actionId:'commit'});
 assert.equal((await getDraft(s.repository,'draft-m0')).status,'parked');
 assert.equal((await s.repository.load()).entries.length,0);
});
for(const reply of ['Marked done.','Saved.','Task completed.','Removed.'])test(`no operations cannot claim ${reply}`,async()=>{
 const raw='Done ',s=setup(async()=>turn(raw,[],{draftMode:'none',reply}));
 await s.harness.capture({messageId:'done',conversationId:'c1',text:raw});
 const data=await s.repository.load();assert.equal(data.intentV2.captures.done.reply,'Nothing changed.');
 assert.equal(data.intentV2.captures.done.raw,raw);assert.equal(data.entries.length,0);
});

for(const [mode,reply] of [
 ['query','You completed 4 tasks yesterday.'],
 ['query','Yes — Buy milk is already saved for tomorrow.'],
 ['reflect','You completed a lot yesterday.'],
])test(`a ${mode} answer keeps its words: ${reply}`,async()=>{
 const raw='How did yesterday go?',s=setup(async()=>turn(raw,[],{mode,draftMode:'none',reply}));
 await s.harness.capture({messageId:'answer',conversationId:'c1',text:raw});
 const data=await s.repository.load();assert.equal(data.intentV2.captures.answer.reply,reply);
 assert.equal(data.entries.length,0);assert.equal(Object.keys(data.intentV2.drafts).length,0);
});

test('a clarification keeps its removal question',async()=>{
 const raw='Remove dinner',reply='Which one should be removed: dinner task or its alarm?';
 const clarification={prompt:reply,action:'remove',choices:[{label:'Task',targets:[{entity:'task',id:'41'}]},{label:'Alarm',targets:[{entity:'alarm',id:'41'}]}]};
 const s=setup(async()=>turn(raw,[],{draftMode:'none',reply,clarification}),{seed:withAlarm()});
 await s.harness.capture({messageId:'answer',conversationId:'c1',text:raw});
 const data=await s.repository.load();assert.equal(data.intentV2.captures.answer.reply,reply);
 assert.equal(data.entries[0].archived,false);assert.equal(data.intentV2.captures.answer.clarification.prompt,reply);
});
