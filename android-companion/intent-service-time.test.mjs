import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {editPlan} from './planner-state.mjs';
import {serviceFor} from './intent-service-fixtures.mjs';

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
test('ranged task conflict checks use the derived endpoint and stay atomic',async()=>{
 const now=new Date(2026,8,27,12,1),raw='Read today 2pm-3pm',output=turn(raw,[operation([field('title','Read','Read'),field('time','today 2pm-3pm','today 2pm-3pm')])]);
 const readCalendar=async()=>({status:'ready',start:+new Date(2026,8,27),end:+new Date(2026,8,28),events:[{id:'meeting',title:'Meeting',start:+new Date(2026,8,27,14,45),end:+new Date(2026,8,27,15,30),busy:true}]});
 const {backend,service}=serviceFor(async()=>output,freshStore(),{clock:()=>new Date(now),readCalendar}),conversationId=(await backend.load()).conversations[0].id;
 let result=await service.capture({messageId:'overlap-range',conversationId,text:raw}),draft=result.intent.captures[0].draft;result=await service.act(draft.actions[0].action,{actionId:'overlap-save'});assert.equal(result.status,'review');assert.equal((await backend.load()).entries.length,0);
 draft=result.intent.captures[0].draft;result=await service.act(draft.actions[0].action,{actionId:'overlap-approve'});assert.equal(result.status,'committed');assert.equal((await backend.load()).entries[0].minutes,60);
});
test('editing a time keeps Capture reply, draft reply and preview in agreement',async()=>{
 const raw='Read tomorrow at 2pm',output=turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow at 2pm','tomorrow at 2pm')])]);
 const seed=freshStore(),{service}=serviceFor(async()=>output,seed,{clock:()=>new Date(2026,8,16,8)}),conversationId=seed.conversations[0].id;
 const r=await service.capture({messageId:'edit-reply',conversationId,text:raw}),draft=r.intent.captures[0].draft;
 const edited=await service.act({kind:'set-field',draftId:draft.id,conversationId,revision:draft.revision,opId:'task1',field:'time',value:'tomorrow at 4pm'},{actionId:'edit-clock'}),capture=edited.intent.captures[0];
 assert.equal(capture.reply,capture.draft.reply);assert.ok(capture.reply.includes(capture.draft.schedulePreview.items[0].label));assert.notEqual(capture.reply,r.intent.captures[0].reply);
});
test('bare edits use next occurrence rather than a saved PM or another task AM',async()=>{
 const raw='Move my run to 6am and my walk to 7',seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Run',planned:'2026-09-17T03:30:00Z'}});editPlan(seed,{type:'saveTask',fields:{title:'Walk',planned:'2026-09-17T13:30:00Z'}});const efforts=[];
 const model=async(i,o)=>{efforts.push(o.route.effort);const fixed=!!i.repair;return turn(raw,[operation([field('time','6am','6am')],{opId:'run',kind:'update',targetId:'1'}),operation([fixed?field('time',null,null,'stated','unknown'):field('time','7pm','my walk to 7')],{opId:'walk',kind:'update',targetId:'2'})],{question:fixed?{opId:'walk',field:'time',prompt:'7 AM or 7 PM for the walk?',options:[{label:'7 AM',value:'7am'},{label:'7 PM',value:'7pm'}]}:null});};
 const {service,backend}=serviceFor(model,seed,{clock:()=>new Date(2026,8,16,8)}),conversationId=seed.conversations[0].id,result=await service.capture({messageId:'period-guard',conversationId,text:raw});
 const draft=result.intent.captures[0].draft;assert.deepEqual(efforts,['none']);assert.equal(draft.operations[1].fields[0].value,'2026-09-16T13:30:00.000Z');assert.equal(draft.operations[1].fields[0].inference.rule,'next-12h');assert.equal((await backend.load()).entries[1].planned,'2026-09-17T13:30:00Z');
});
test('a focused duration amendment preserves the time anchor and original temporal evidence',async()=>{
 const original='Kal subah 8 baje worksheet print karna hai.',next='Make it 20 minutes',seed=freshStore();let now=new Date(2026,8,16,8);
 const model=async input=>input.activeDraft?turn(next,[operation([field('minutes',20,'20 minutes')])],{draftMode:'amend'}):turn(original,[operation([field('title','Print worksheet','worksheet print'),field('time','Kal subah 8 baje','Kal subah 8 baje')])]);
 const {service}=serviceFor(model,seed,{clock:()=>new Date(now)}),conversationId=seed.conversations[0].id;
 const first=await service.capture({messageId:'first-local',conversationId,text:original}),draft=first.intent.captures[0].draft;
 now=new Date(+now+60000);const second=await service.capture({messageId:'amend-local',conversationId,text:next,focusDraftId:draft.id}),updated=second.intent.captures[0].draft;
 assert.equal(updated.timeAnchorAt,draft.timeAnchorAt);assert.equal(updated.schedulePreview.items[0].planned,draft.schedulePreview.items[0].planned);assert.equal(updated.schedulePreview.items[0].status,'parsed');
});
