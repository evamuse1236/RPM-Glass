import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';

const calendar=async()=>({status:'not_selected',events:[]});
const serviceFor=(model,seed=freshStore(),options={})=>{const backend=createMemoryBackend(seed);return {backend,service:createIntentService({backend,model,changePlanner,undo,readCalendar:calendar,editPlan,clock:()=>new Date('2026-09-16T04:00:00.000Z'),timezone:'Asia/Kolkata',...options})};};

test('real service preserves exact source and waits for reviewed canonical commit',async()=>{
 const raw='  Plan the lesson  ',model=async()=>turn(raw,[operation([field('title','Plan the lesson','Plan the lesson')])]);const {backend,service}=serviceFor(model),conversationId=(await backend.load()).conversations[0].id;
 const captured=await service.capture({messageId:'message-1',conversationId,text:raw});assert.equal((await backend.load()).intentV2.captures['message-1'].raw,raw);assert.equal((await backend.load()).entries.length,0);
 const card=captured.intent.captures[0],save=card.draft.actions.find(x=>x.action.kind==='commit');const committed=await service.act(save.action,{actionId:'action-1'});assert.equal(committed.status,'committed');
 const data=await backend.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].raw,raw);assert.equal(data.entries[0].minutes,null);assert.equal(data.entries[0].durationSource,'unknown');
});

test('focused correction preserves sibling operations through the production service',async()=>{
 const firstRaw='Plan the lesson and email the group',secondRaw='Give the lesson twenty minutes';let calls=0;
 const first=turn(firstRaw,[operation(),operation([field('title','Email the group','email the group')],{opId:'task2'})]);
 const second=turn(secondRaw,[operation([field('minutes',20,'twenty minutes')])],{draftMode:'amend'});
 const {backend,service}=serviceFor(async()=>++calls===1?first:second),conversationId=(await backend.load()).conversations[0].id;
 const initial=await service.capture({messageId:'message-1',conversationId,text:firstRaw}),draftId=initial.draftId;
 await service.capture({messageId:'message-2',conversationId,text:secondRaw,focusDraftId:draftId});const draft=(await backend.load()).intentV2.drafts[draftId];
 assert.equal(draft.operations.length,2);assert.equal(draft.operations[0].fields.find(f=>f.name==='minutes').value,20);assert.equal(draft.operations[1].fields.find(f=>f.name==='title').value,'Email the group');
});

test('stored sort preview is isolated, revision checked and accepted as one undoable grouping',async()=>{
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Choose example',minutes:null}});editPlan(seed,{type:'saveTask',fields:{title:'Make questions',minutes:null}});seed.planner.undo=null;
 const {backend,service}=serviceFor(async()=>turn(),seed);const input={id:'sort-1',selectedTaskIds:[1,2],blocks:[{blockId:null,title:'Lesson ready',projectId:null,taskIds:[1]}],leftUnsorted:[2]};
 const created=await service.sort.create(input);let data=await backend.load();assert.equal(created.preview.status,'preview');assert.equal(data.entries[0].blockId,undefined);assert.equal(data.planner.blocks.length,0);
 await assert.rejects(service.sort.accept('sort-1',{revision:2}),/Stale sort approval/);
 const accepted=await service.sort.accept('sort-1',{revision:1});data=await backend.load();assert.equal(accepted.status,'accepted');assert.equal(data.entries[0].blockId,data.planner.blocks[0].id);assert.equal(data.entries[1].blockId,undefined);assert.equal(data.planner.undo.entries[0].blockId,undefined);
 editPlan(data,{type:'undo'});assert.equal(data.entries[0].blockId,undefined);assert.equal(data.planner.blocks.length,0);
});

test('definite store rejection stays definite while raw capture remains from earlier writes',async()=>{
 const seed=freshStore(),base=createMemoryBackend(seed);let reject=false;const backend={load:base.load,save:async(expected,next)=>{if(reject)throw new Error('Context exceeds 16 MB; original preserved. Export a backup before reducing history.');return base.save(expected,next);}};
 const service=createIntentService({backend,model:async()=>turn(),changePlanner,undo,readCalendar:calendar,editPlan});const conversationId=seed.conversations[0].id;
 await service.capture({messageId:'message-1',conversationId,text:'Plan the lesson'});reject=true;const draft=(await service.view({conversationId})).captures[0].draft,save=draft.actions.find(x=>x.action.kind==='commit');
 await assert.rejects(service.act(save.action,{actionId:'action-1'}),/Context exceeds 16 MB/);const data=await backend.load();assert.equal(data.intentV2.captures['message-1'].raw,'Plan the lesson');assert.equal(data.entries.length,0);
});

test('timed drafts show an exact local preview and require an explicit refresh when stale',async()=>{
 let now=new Date(2026,8,16,8,0),calls=0;const raw='Plan the lesson tomorrow at 9am',model=async()=>{calls++;return turn(raw,[operation([field('title','Plan the lesson','Plan the lesson'),field('time','tomorrow at 9am','tomorrow at 9am')])]);};
 const {backend,service}=serviceFor(model,freshStore(),{clock:()=>new Date(now)}),conversationId=(await backend.load()).conversations[0].id;
 let result=await service.capture({messageId:'message-time',conversationId,text:raw}),draft=result.intent.captures[0].draft;assert.equal(draft.schedulePreview.items[0].label,new Date(2026,8,17,9).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));assert.equal(draft.actions[0].action.kind,'commit');
 now=new Date(+now+16*60*1000);draft=(await service.view({conversationId})).captures[0].draft;assert.equal(draft.actions[0].action.kind,'refresh-time');assert.equal(draft.actions.some(x=>x.action.kind==='commit'),false);
 result=await service.act(draft.actions[0].action,{actionId:'refresh-1'});draft=result.intent.captures[0].draft;assert.equal(draft.revision,2);assert.equal(draft.actions[0].action.kind,'commit');assert.equal(draft.schedulePreview.anchorAt,now.toISOString());assert.equal(calls,1);
 const saved=await service.act(draft.actions[0].action,{actionId:'save-1'});assert.equal(saved.status,'committed');assert.equal(new Date((await backend.load()).entries[0].planned).getHours(),9);
});

test('actual planner commits a linked project, block and task as one reviewed transaction',async()=>{
 const raw='Create Study project, Exam readiness block, and Read chapter one task',op=(opId,entity,fields)=>({opId,sourceId:'s0',kind:'create',entity,targetId:null,fields});
 const output=turn(raw,[op('project1','project',[field('title','Study','Study project')]),op('block1','block',[field('title','Exam readiness','Exam readiness block'),field('projectId','$project1','Exam readiness block')]),op('task1','task',[field('title','Read chapter one','Read chapter one task'),field('blockId','$block1','Read chapter one task')])]);
 const {backend,service}=serviceFor(async()=>output),conversationId=(await backend.load()).conversations[0].id;const captured=await service.capture({messageId:'message-linked',conversationId,text:raw}),save=captured.intent.captures[0].draft.actions[0];await service.act(save.action,{actionId:'save-linked'});
 const data=await backend.load();assert.equal(data.planner.projects.length,1);assert.equal(data.planner.blocks[0].projectId,data.planner.projects[0].id);assert.equal(data.entries[0].blockId,data.planner.blocks[0].id);assert.equal(data.entries[0].raw,raw);
});

test('actual calendar conflict remains a review until the current warning token is approved',async()=>{
 const now=new Date(2026,8,16,8),raw='Plan the lesson today at 10am',output=turn(raw,[operation([field('title','Plan the lesson','Plan the lesson'),field('time','today at 10am','today at 10am')])]);
 const readCalendar=async()=>({status:'ready',start:+new Date(2026,8,16),end:+new Date(2026,8,17),events:[{id:'meeting',title:'Meeting',start:+new Date(2026,8,16,10),end:+new Date(2026,8,16,11),busy:true}]});const seed=freshStore(),backend=createMemoryBackend(seed),service=createIntentService({backend,model:async()=>output,changePlanner,undo,readCalendar,editPlan,clock:()=>new Date(now),timezone:'Asia/Kolkata'}),conversationId=seed.conversations[0].id;
 let result=await service.capture({messageId:'message-conflict',conversationId,text:raw}),draft=result.intent.captures[0].draft;result=await service.act(draft.actions[0].action,{actionId:'save-conflict-1'});assert.equal(result.status,'review');assert.equal((await backend.load()).entries.length,0);
 draft=result.intent.captures[0].draft;assert.equal(draft.actions[0].label,'Keep this time');result=await service.act(draft.actions[0].action,{actionId:'save-conflict-2'});assert.equal(result.status,'committed');assert.equal((await backend.load()).entries.length,1);
});

test('lost save acknowledgement reconciles once and service Undo restores the canonical store',async()=>{
 const base=createMemoryBackend(freshStore());let loseNext=false,writes=0;const backend={load:base.load,save:async(expected,next)=>{writes++;await base.save(expected,next);if(loseNext){loseNext=false;throw new Error('connection lost after write');}}};const service=createIntentService({backend,model:async()=>turn(),changePlanner,undo,readCalendar:calendar,editPlan,clock:()=>new Date('2026-09-16T04:00:00.000Z')}),conversationId=(await backend.load()).conversations[0].id;
 const captured=await service.capture({messageId:'message-once',conversationId,text:'Plan the lesson'}),draft=captured.intent.captures[0].draft,save=draft.actions[0];loseNext=true;const first=await service.act(save.action,{actionId:'save-once'}),second=await service.act(save.action,{actionId:'save-once'});assert.deepEqual(second.receipt,first.receipt);assert.equal((await backend.load()).entries.length,1);
 const beforeUndoWrites=writes;const undone=await service.undo({draftId:draft.id,conversationId,actionId:'undo-once'});assert.equal(undone.status,'undone');assert.equal((await backend.load()).entries.length,0);assert.equal(writes,beforeUndoWrites+1);
});

test('time preview and commit share update semantics for a saved task bare-clock correction',async()=>{
 const now=new Date(2026,8,16,8),seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Run',planned:new Date(2026,8,20,21).toISOString(),minutes:30}});seed.planner.undo=null;seed.undo=null;
 const raw='Move Run to 6am',output=turn(raw,[operation([field('time','6am','6am')],{kind:'update',targetId:'1'})]);const {backend,service}=serviceFor(async()=>output,seed,{clock:()=>new Date(now)}),conversationId=seed.conversations[0].id;
 const captured=await service.capture({messageId:'message-clock',conversationId,text:raw}),draft=captured.intent.captures[0].draft,preview=draft.schedulePreview.items[0];assert.equal(new Date(preview.planned).getHours(),6);
 await service.act(draft.actions[0].action,{actionId:'save-clock'});assert.equal((await backend.load()).entries[0].planned,preview.planned);
});

test('date-only schedule preview shows the resolved local day without inventing a clock',async()=>{
 const now=new Date(2026,8,16,8),raw='Read tomorrow',output=turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow','tomorrow')])]);const {backend,service}=serviceFor(async()=>output,freshStore(),{clock:()=>new Date(now)}),conversationId=(await backend.load()).conversations[0].id;
 const captured=await service.capture({messageId:'message-day',conversationId,text:raw}),preview=captured.intent.captures[0].draft.schedulePreview.items[0];assert.equal(preview.planned,null);assert.equal(preview.plannedDate,'2026-09-17');assert.equal(preview.label,'2026-09-17 · time not set');
});

test('intent projection pages beyond one hundred captures without dropping history',()=>{
 const data=freshStore(),conversationId=data.conversations[0].id;data.intentV2={schema:1,captures:{},drafts:{},transactions:{},approvedMemories:[],sortPreviews:{}};for(let i=0;i<135;i++)data.intentV2.captures[`message-${i}`]={messageId:`message-${i}`,conversationId,raw:`Thought ${i}`,at:new Date(2026,8,16,0,i).toISOString(),status:'interpreted'};
 const first=intentViewFromData(data,{conversationId,offset:0,limit:100}),second=intentViewFromData(data,{conversationId,offset:100,limit:100});assert.equal(first.captures.length,100);assert.equal(first.hasMore,true);assert.equal(second.captures.length,35);assert.equal(second.hasMore,false);assert.equal(new Set([...first.captures,...second.captures].map(c=>c.messageId)).size,135);
});

test('draft projection resolves hierarchy references to human titles',async()=>{
 const raw='Create Study project, Exam readiness block, and Read task',op=(opId,entity,fields)=>({opId,sourceId:'s0',kind:'create',entity,targetId:null,fields}),output=turn(raw,[op('project1','project',[field('title','Study','Study project')]),op('block1','block',[field('title','Exam readiness','Exam readiness block'),field('projectId','$project1','Exam readiness block')]),op('task1','task',[field('title','Read','Read task'),field('blockId','$block1','Read task')])]);
 const {backend,service}=serviceFor(async()=>output),conversationId=(await backend.load()).conversations[0].id,draft=(await service.capture({messageId:'message-labels',conversationId,text:raw})).intent.captures[0].draft,blockLink=draft.operations.find(op=>op.opId==='block1').fields.find(f=>f.name==='projectId'),taskLink=draft.operations.find(op=>op.opId==='task1').fields.find(f=>f.name==='blockId');assert.deepEqual([blockLink.displayLabel,blockLink.displayValue],['Project','Study']);assert.deepEqual([taskLink.displayLabel,taskLink.displayValue],['RPM block','Exam readiness']);
});
