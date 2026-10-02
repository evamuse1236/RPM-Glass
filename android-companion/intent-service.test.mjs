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

test('stored Jev sort can link only existing blocks and never creates a draft block',async()=>{
 const seed=freshStore(),blockId=editPlan(seed,{type:'saveEntity',collection:'blocks',fields:{title:'Lesson ready'}});editPlan(seed,{type:'saveTask',fields:{title:'Choose example',minutes:null}});editPlan(seed,{type:'saveTask',fields:{title:'Make questions',minutes:null}});seed.planner.undo=null;
 const {backend,service}=serviceFor(async()=>turn(),seed),input={id:'jev-sort-1',selectedTaskIds:[1,2],blocks:[{blockId,title:'Lesson ready',projectId:null,taskIds:[1]}],leftUnsorted:[2],existingOnly:true};
 const created=await service.sort.create(input);let data=await backend.load();assert.equal(created.preview.existingOnly,true);assert.equal(data.entries[0].blockId,undefined);assert.equal(data.planner.blocks.length,1);
 const accepted=await service.sort.accept('jev-sort-1',{revision:1});data=await backend.load();assert.equal(accepted.changed,true);assert.equal(data.entries[0].blockId,blockId);assert.equal(data.entries[1].blockId,undefined);assert.equal(data.planner.blocks.length,1);assert.equal(data.planner.drafts.length,0);
 editPlan(data,{type:'undo'});assert.equal(data.entries[0].blockId,undefined);assert.equal(data.planner.blocks.length,1);
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

// New captures: the local schedule preview is what gets saved, and Undo keeps the exact raw words.
const newCapturePreviews=[
 {name:'date-only schedule preview shows the resolved local day without inventing a clock',now:new Date(2026,8,16,8),raw:'Read tomorrow',fields:[field('title','Read','Read'),field('time','tomorrow','tomorrow')],
  preview:p=>{assert.equal(p.planned,null);assert.equal(p.plannedDate,'2026-09-17');assert.equal(p.label,'2026-09-17 · time not set');}},
 {name:'screenshot range previews and saves sixty minutes with exact raw words and Undo',now:new Date(2026,8,27,12,1),raw:'Finish one WID assessment today from 2 pm to 3 pm',fields:[field('title','Finish one WID assessment','Finish one WID assessment'),field('time','today from 2 pm to 3 pm','today from 2 pm to 3 pm')],
  preview:p=>{assert.equal(p.status,'parsed');assert.equal(p.minutes,60);assert.match(p.label,/60 min/);},save:{minutes:60,durationSource:'user_words'}},
 {name:'Hinglish source meaning survives extraction, local preview, review, save and Undo',now:new Date(2026,8,16,8),raw:'Kal subah 8 baje worksheet print karna hai.',fields:[field('title','Print worksheet','worksheet print'),field('time','Kal subah 8 baje','Kal subah 8 baje')],
  preview:p=>{assert.equal(p.status,'parsed');assert.equal(new Date(p.planned).getHours(),8);assert.equal(new Date(p.planned).getDate(),17);},save:{}}
];
for(const c of newCapturePreviews)test(c.name,async()=>{
 const {backend,service}=serviceFor(async()=>turn(c.raw,[operation(c.fields)]),freshStore(),{clock:()=>new Date(c.now)}),conversationId=(await backend.load()).conversations[0].id,messageId='capture-'+c.name.length;
 let r=await service.capture({messageId,conversationId,text:c.raw}),draft=r.intent.captures[0].draft;const preview=draft.schedulePreview.items[0];c.preview(preview);assert.equal((await backend.load()).entries.length,0);
 if(!c.save)return;
 r=await service.act(draft.actions.find(a=>a.action.kind==='commit').action,{actionId:messageId+'-save'});
 if(r.status==='review'){draft=r.intent.captures[0].draft;r=await service.act(draft.actions[0].action,{actionId:messageId+'-confirm'});}
 assert.equal(r.status,'committed');let data=await backend.load();assert.equal(data.entries[0].raw,c.raw);assert.equal(data.entries[0].planned,preview.planned);
 for(const [key,value] of Object.entries(c.save))assert.equal(data.entries[0][key],value);
 await service.undo({draftId:draft.id,conversationId,actionId:messageId+'-undo'});data=await backend.load();assert.equal(data.entries.length,0);assert.equal(data.intentV2.captures[messageId].raw,c.raw);
});

// An unresolved or contradictory time is held for review; a field correction regenerates the preview and unlocks Add.
const reviewedTimeCorrections=[
 {name:'unresolved time blocks Add and forged commit; field correction refreshes preview',raw:'Read today from 2 to 3',fields:[field('title','Read','Read'),field('time','today from 2 to 3','today from 2 to 3')],correction:{field:'time',value:'today 2pm-3pm'}},
 {name:'conflicting duration is reviewed and a duration edit regenerates time preview',raw:'Read today 2pm-3pm for 30 minutes',fields:[field('title','Read','Read'),field('time','today 2pm-3pm','today 2pm-3pm'),field('minutes',30,'30 minutes')],correction:{field:'minutes',value:60}}
];
for(const c of reviewedTimeCorrections)test(c.name,async()=>{
 const {backend,service}=serviceFor(async()=>turn(c.raw,[operation(c.fields)]),freshStore(),{clock:()=>new Date(2026,8,27,12,1)}),conversationId=(await backend.load()).conversations[0].id;
 let result=await service.capture({messageId:'review-source',conversationId,text:c.raw}),draft=result.intent.captures[0].draft;
 assert.equal(draft.schedulePreview.items[0].status,'review');assert.equal(draft.actions.some(a=>a.action.kind==='commit'),false);
 const identity={conversationId,draftId:draft.id,revision:draft.revision};await assert.rejects(service.act({...identity,kind:'commit'},{actionId:'forged-save'}),/time|schedule/i);assert.equal((await backend.load()).entries.length,0);
 result=await service.act({...identity,kind:'set-field',opId:'task1',...c.correction},{actionId:'correct-field'});draft=result.intent.captures[0].draft;assert.equal(draft.schedulePreview.items[0].status,'parsed');assert.equal(draft.schedulePreview.items[0].minutes,60);assert.equal(draft.actions[0].action.kind,'commit');
 await service.act(draft.actions[0].action,{actionId:'corrected-save'});assert.equal((await backend.load()).entries[0].minutes,60);
});

// A clock-only edit of a saved task keeps its saved future day; preview, reply and commit agree without an extra question.
const savedTaskClockEdits=[
 {name:'time preview and commit share update semantics for a saved task bare-clock correction',now:new Date(2026,8,16,8),task:{title:'Run',planned:new Date(2026,8,20,21).toISOString(),minutes:30},raw:'Move Run to 6am',time:field('time','6am','6am'),
  preview:p=>assert.equal(new Date(p.planned).getHours(),6),save:{}},
 {name:'clock-only range edit keeps the saved future day and replaces its old duration',now:new Date(2026,8,27,12,1),task:{title:'Read',planned:new Date(2026,8,30,9).toISOString(),minutes:30},raw:'Move Read to 2pm-3pm',time:field('time','2pm-3pm','2pm-3pm'),
  preview:p=>{assert.equal(new Date(p.planned).getDate(),30);assert.equal(p.minutes,60);},save:{minutes:60}},
 {name:'saved-date correction reply is derived from the same preview that is committed',now:new Date(2026,8,16,8),task:{title:'Run',plannedDate:'2026-09-18',minutes:null},raw:'Move my run to 6 am',time:field('time','6 am','6 am'),extra:{reply:'Which day should I use?'},
  preview:p=>assert.equal(new Date(p.planned).getDate(),18),replyOmits:'Which day'},
 {name:'an explicitly supplied 6am and an existing future day do not need a redundant AM/PM question',now:new Date(2026,8,16,8),task:{title:'Read chapter',planned:'2026-09-20T15:30:00.000Z',minutes:45},raw:'Move Read chapter to 6am; keep its duration.',time:field('time',null,'6am','stated','unknown'),
  extra:{reply:'Did you mean 6am or 6pm?',question:{opId:'task1',field:'time',prompt:'Did you mean 6am or 6pm?',options:[{label:'6am',value:'6am'},{label:'6pm',value:'6pm'}]}},
  preview:p=>assert.equal(p.planned,'2026-09-20T00:30:00.000Z'),replyOmits:'Did you mean'}
];
for(const c of savedTaskClockEdits)test(c.name,async()=>{
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:c.task});seed.planner.undo=null;seed.undo=null;let calls=0;
 const output=turn(c.raw,[operation([c.time],{kind:'update',targetId:'1'})],c.extra);
 const {backend,service}=serviceFor(async()=>{calls++;return output;},seed,{clock:()=>new Date(c.now)}),conversationId=seed.conversations[0].id;
 const captured=await service.capture({messageId:'clock-edit',conversationId,text:c.raw}),draft=captured.intent.captures[0].draft,preview=draft.schedulePreview.items[0];
 c.preview(preview);assert.equal(draft.question,null);assert.equal(calls,1);
 if(c.replyOmits){assert.ok(!draft.reply.includes(c.replyOmits));assert.ok(draft.reply.includes(preview.label));}
 if(!c.save)return;
 await service.act(draft.actions[0].action,{actionId:'clock-edit-save'});const e=(await backend.load()).entries[0];assert.equal(e.planned,preview.planned);
 for(const [key,value] of Object.entries(c.save))assert.equal(e[key],value);
});

test('intent projection pages beyond one hundred captures without dropping history',()=>{
 const data=freshStore(),conversationId=data.conversations[0].id;data.intentV2={schema:1,captures:{},drafts:{},transactions:{},approvedMemories:[],sortPreviews:{}};for(let i=0;i<135;i++)data.intentV2.captures[`message-${i}`]={messageId:`message-${i}`,conversationId,raw:`Thought ${i}`,at:new Date(2026,8,16,0,i).toISOString(),status:'interpreted'};
 const first=intentViewFromData(data,{conversationId,offset:0,limit:100}),second=intentViewFromData(data,{conversationId,offset:100,limit:100});assert.equal(first.captures.length,100);assert.equal(first.hasMore,true);assert.equal(second.captures.length,35);assert.equal(second.hasMore,false);assert.equal(new Set([...first.captures,...second.captures].map(c=>c.messageId)).size,135);
});

test('draft projection resolves hierarchy references to human titles',async()=>{
 const raw='Create Study project, Exam readiness block, and Read task',op=(opId,entity,fields)=>({opId,sourceId:'s0',kind:'create',entity,targetId:null,fields}),output=turn(raw,[op('project1','project',[field('title','Study','Study project')]),op('block1','block',[field('title','Exam readiness','Exam readiness block'),field('projectId','$project1','Exam readiness block')]),op('task1','task',[field('title','Read','Read task'),field('blockId','$block1','Read task')])]);
 const {backend,service}=serviceFor(async()=>output),conversationId=(await backend.load()).conversations[0].id,draft=(await service.capture({messageId:'message-labels',conversationId,text:raw})).intent.captures[0].draft,blockLink=draft.operations.find(op=>op.opId==='block1').fields.find(f=>f.name==='projectId'),taskLink=draft.operations.find(op=>op.opId==='task1').fields.find(f=>f.name==='blockId');assert.deepEqual([blockLink.displayLabel,blockLink.displayValue],['Project','Study']);assert.deepEqual([taskLink.displayLabel,taskLink.displayValue],['RPM block','Exam readiness']);
});

test('ranged task conflict checks use the derived endpoint and stay atomic',async()=>{
 const now=new Date(2026,8,27,12,1),raw='Read today 2pm-3pm',output=turn(raw,[operation([field('title','Read','Read'),field('time','today 2pm-3pm','today 2pm-3pm')])]);
 const readCalendar=async()=>({status:'ready',start:+new Date(2026,8,27),end:+new Date(2026,8,28),events:[{id:'meeting',title:'Meeting',start:+new Date(2026,8,27,14,45),end:+new Date(2026,8,27,15,30),busy:true}]});
 const {backend,service}=serviceFor(async()=>output,freshStore(),{clock:()=>new Date(now),readCalendar}),conversationId=(await backend.load()).conversations[0].id;
 let result=await service.capture({messageId:'overlap-range',conversationId,text:raw}),draft=result.intent.captures[0].draft;result=await service.act(draft.actions[0].action,{actionId:'overlap-save'});assert.equal(result.status,'review');assert.equal((await backend.load()).entries.length,0);
 draft=result.intent.captures[0].draft;result=await service.act(draft.actions[0].action,{actionId:'overlap-approve'});assert.equal(result.status,'committed');assert.equal((await backend.load()).entries[0].minutes,60);
});
test('Jev evidence version is rechecked inside the preview transaction',async()=>{
 const seed=freshStore(),blockId=editPlan(seed,{type:'saveEntity',collection:'blocks',fields:{title:'Lesson ready'}});editPlan(seed,{type:'saveTask',fields:{title:'Print worksheet'}});
 const {backend,service}=serviceFor(async()=>turn(),seed),version=(await backend.load()).version;
 await service.repository.transact('change-before-preview',{},d=>{d.entries[0].title='Changed task';return {};});
 await assert.rejects(service.sort.create({id:'stale-jev',sourceVersion:version,selectedTaskIds:[1],blocks:[{blockId,title:'Lesson ready',projectId:null,taskIds:[1]}],leftUnsorted:[],existingOnly:true}),/plans changed/);
 assert.equal((await service.sort.list()).length,0);assert.equal((await backend.load()).entries[0].blockId,undefined);
});
test('editing a time keeps Capture reply, draft reply and preview in agreement',async()=>{
 const raw='Read tomorrow at 2pm',output=turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow at 2pm','tomorrow at 2pm')])]);
 const seed=freshStore(),{service}=serviceFor(async()=>output,seed,{clock:()=>new Date(2026,8,16,8)}),conversationId=seed.conversations[0].id;
 const r=await service.capture({messageId:'edit-reply',conversationId,text:raw}),draft=r.intent.captures[0].draft;
 const edited=await service.act({kind:'set-field',draftId:draft.id,conversationId,revision:draft.revision,opId:'task1',field:'time',value:'tomorrow at 4pm'},{actionId:'edit-clock'}),capture=edited.intent.captures[0];
 assert.equal(capture.reply,capture.draft.reply);assert.ok(capture.reply.includes(capture.draft.schedulePreview.items[0].label));assert.notEqual(capture.reply,r.intent.captures[0].reply);
});
test('model cannot borrow a saved PM or another task AM to resolve an ambiguous clock',async()=>{
 const raw='Move my run to 6am and my walk to 7',seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Run',planned:'2026-09-17T03:30:00Z'}});editPlan(seed,{type:'saveTask',fields:{title:'Walk',planned:'2026-09-17T13:30:00Z'}});const efforts=[];
 const model=async(i,o)=>{efforts.push(o.route.effort);const fixed=!!i.repair;return turn(raw,[operation([field('time','6am','6am')],{opId:'run',kind:'update',targetId:'1'}),operation([fixed?field('time',null,null,'stated','unknown'):field('time','7pm','my walk to 7')],{opId:'walk',kind:'update',targetId:'2'})],{question:fixed?{opId:'walk',field:'time',prompt:'7 AM or 7 PM for the walk?',options:[{label:'7 AM',value:'7am'},{label:'7 PM',value:'7pm'}]}:null});};
 const {service,backend}=serviceFor(model,seed,{clock:()=>new Date(2026,8,16,8)}),conversationId=seed.conversations[0].id,result=await service.capture({messageId:'period-guard',conversationId,text:raw});
 const draft=result.intent.captures[0].draft;assert.deepEqual(efforts,['none','high']);assert.equal(draft.operations[1].fields[0].op,'unknown');assert.equal(draft.actions.some(a=>a.action.kind==='commit'),false);assert.equal((await backend.load()).entries[1].planned,'2026-09-17T13:30:00Z');
});
test('a focused duration amendment preserves the time anchor and original temporal evidence',async()=>{
 const original='Kal subah 8 baje worksheet print karna hai.',next='Make it 20 minutes',seed=freshStore();let now=new Date(2026,8,16,8);
 const model=async input=>input.activeDraft?turn(next,[operation([field('minutes',20,'20 minutes')])],{draftMode:'amend'}):turn(original,[operation([field('title','Print worksheet','worksheet print'),field('time','Kal subah 8 baje','Kal subah 8 baje')])]);
 const {service}=serviceFor(model,seed,{clock:()=>new Date(now)}),conversationId=seed.conversations[0].id;
 const first=await service.capture({messageId:'first-local',conversationId,text:original}),draft=first.intent.captures[0].draft;
 now=new Date(+now+60000);const second=await service.capture({messageId:'amend-local',conversationId,text:next,focusDraftId:draft.id}),updated=second.intent.captures[0].draft;
 assert.equal(updated.timeAnchorAt,draft.timeAnchorAt);assert.equal(updated.schedulePreview.items[0].planned,draft.schedulePreview.items[0].planned);assert.equal(updated.schedulePreview.items[0].status,'parsed');
});
