import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryBackend,intentState} from '../intent-v2/src/repository.mjs';
import {seedFixture,NOW,TIMEZONE} from '../scripts/capture-stress/seed.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {editPlan} from './planner-state.mjs';
import {changePlanner} from './planner-tools.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {canUndoChange,cardKind} from './capture-session.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';

const output=(input,operations=[],extra={})=>({schemaVersion:1,mode:'capture',draftMode:operations.length?'amend':'none',reply:'',decisions:input.sourceUnits.map(u=>({sourceId:u.id,disposition:'action',note:null})),operations,question:null,clarification:null,memoryCandidates:[],card:null,...extra});
const discard=opId=>({opId,sourceId:'s0',kind:'discard',entity:'task',targetId:null,fields:[]});
function phone(model){
 const {data}=seedFixture({seedStore,editPlan,intentState}),backend=createMemoryBackend(data),inputs=[];
 const service=createIntentService({backend,model:async input=>{inputs.push(input);return model(input);},changePlanner,undo,editPlan,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>new Date(NOW),timezone:TIMEZONE});
 const storage=new Map(),traces=createTraceStore({storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},clock:()=>new Date(NOW)});
 return {backend,service,inputs,agent:createCaptureAgent({service,traces,clock:()=>new Date(NOW)})};
}
const send=(p,messageId,text,extra={})=>p.agent.capture({messageId,conversationId:'stress',text,...extra});
const ask=input=>{
 const proposals=input.context.entities.filter(e=>e.entity==='proposal');
 return output(input,[],{clarification:{prompt:'Which dinner proposal should I remove?',action:'remove',choices:proposals.map(p=>({label:p.title,targets:[{entity:'proposal',id:p.id}]}))}});
};

test('an amend clarification never applies the focused proposals; Both sets them aside with one Undo and Resume',async()=>{
 const p=phone(input=>{
  const turn=ask(input);
  return {...turn,draftMode:'amend',reply:'Nothing is removed yet. Tell me which dinner item to set aside.',
   clarification:{...turn.clarification,choices:[...turn.clarification.choices,{label:'Both',targets:turn.clarification.choices.flatMap(c=>c.targets)}]}};
 });
 const before=await p.backend.load(),original=structuredClone(before.intentV2.drafts['draft-dinner']);
 const result=await send(p,'ask','Delete this',{focusDraftId:'draft-dinner'});
 assert.equal(result.status,'interpreted');
 assert.notEqual(result.applied?.status,'applied','asking which proposal to remove must not create either task');
 let data=await p.backend.load();
 assert.deepEqual(data.entries,before.entries);
 assert.equal(data.intentV2.captures.ask.raw,'Delete this');
 assert.ok(data.intentV2.captures.ask.clarification);
 assert.equal(data.intentV2.drafts['draft-dinner'].status,'draft');
 assert.deepEqual(data.intentV2.drafts['draft-dinner'].operations,original.operations);
 assert.equal((await p.agent.apply('draft-dinner')).status,'needs-answer','the focused draft stays blocked while the choice is open');
 const both=await send(p,'both','Both');
 assert.equal(both.applied.status,'applied');
 assert.equal(p.inputs.length,1,'Both needs no model call');
 data=await p.backend.load();
 assert.deepEqual(data.entries,before.entries,'discarding proposals creates and trashes no tasks');
 assert.equal(data.intentV2.drafts['draft-dinner'].status,'parked');
 assert.equal(data.intentV2.captures.both.raw,'Both');
 const receipt=data.intentV2.drafts[both.draftId];
 assert.equal(receipt.receipt.draftEdits.length,1,'one receipt and Undo cover both proposals');
 assert.equal(receipt.receipt.removedProposals.length,2);
 assert.deepEqual(receipt.receipt.changes,[]);
 await p.agent.undo({draftId:both.draftId,conversationId:'stress',actionId:'undo-clarified-both'});
 data=await p.backend.load();
 assert.equal(data.intentV2.drafts['draft-dinner'].status,'draft');
 assert.deepEqual(data.intentV2.drafts['draft-dinner'].operations,original.operations);
 assert.deepEqual(data.entries,before.entries);
 const resumePhone=phone(input=>({...ask(input),draftMode:'amend'}));
 await send(resumePhone,'ask','Delete this',{focusDraftId:'draft-dinner'});
 await send(resumePhone,'both','Both');
 await resumePhone.service.resume('draft-dinner',{conversationId:'stress',actionId:'resume-clarified-both'});
 data=await resumePhone.backend.load();
 assert.equal(data.intentV2.drafts['draft-dinner'].status,'draft','Resume brings both proposals back');
 assert.deepEqual(data.intentV2.drafts['draft-dinner'].operations,original.operations);
 assert.deepEqual(data.entries,before.entries);
});

for(const kind of ['new','amend','discard'])test(`a clarification holds ${kind} operations and leaves the focused draft unchanged`,async()=>{
 const p=phone(input=>({...ask(input),draftMode:kind==='new'?'new':'amend',operations:kind==='discard'?[discard('dinner1')]:[
  {opId:'ravi',sourceId:'s0',kind:'create',entity:'task',targetId:null,fields:[{name:'title',op:'set',value:'Call Ravi',origin:'stated',evidence:'call Ravi'}]},
 ]}));
 const before=await p.backend.load();
 const result=await send(p,'ask','Delete this and call Ravi',{focusDraftId:'draft-dinner'});
 assert.equal(result.status,'interpreted');
 assert.notEqual(result.applied?.status,'applied');
 const data=await p.backend.load();
 assert.deepEqual(data.entries,before.entries);
 assert.deepEqual(data.intentV2.drafts,before.intentV2.drafts,'no proposal is amended, removed, parked or committed while asking');
 assert.equal(data.intentV2.captures.ask.raw,'Delete this and call Ravi','deferred unrelated intent stays in the original words');
 assert.ok(data.intentV2.captures.ask.clarification);
 assert.equal(data.intentV2.captures.ask.draftId,null,'a clarification never becomes an executable draft');
 const both=await send(p,'both','Both');
 assert.equal(both.applied.status,'applied');
 assert.equal(p.inputs.length,1);
 assert.deepEqual((await p.backend.load()).entries,before.entries,'answering never releases the deferred unrelated create');
});

test('a clarification never applies an operation against an item named in its choices',async()=>{
 const p=phone(input=>output(input,[{opId:'remove-raj',sourceId:'s0',kind:'archive',entity:'task',targetId:'101',fields:[]}],{
  draftMode:'new',clarification:{prompt:'Which task should I remove?',action:'remove',choices:[
   {label:'Call Raj',targets:[{entity:'task',id:'101'}]},
   {label:'Call Amma',targets:[{entity:'task',id:'106'}]},
  ]},
 }));
 const before=await p.backend.load();
 const result=await send(p,'ask','Delete that call');
 assert.equal(result.status,'interpreted');
 assert.notEqual(result.applied?.status,'applied');
 assert.deepEqual((await p.backend.load()).entries,before.entries);
 const answer=await send(p,'first','First');
 assert.equal(answer.applied.status,'applied');
 assert.equal(p.inputs.length,1);
 assert.equal((await p.backend.load()).entries.find(e=>e.id===101).archived,true);
});

test('an open clarification blocks Retry, direct apply, commit and auto-apply after a field edit',async()=>{
 const p=phone(input=>({...ask(input),draftMode:'amend'}));
 const before=await p.backend.load();
 await send(p,'ask','Delete this',{focusDraftId:'draft-dinner'});
 const retried=await p.agent.retry('ask');
 assert.notEqual(retried.applied?.status,'applied');
 assert.equal(p.inputs.length,1,'Retry of an interpreted question does not ask the model again');
 assert.equal((await p.agent.apply('draft-dinner')).status,'needs-answer');
 let draft=(await p.backend.load()).intentV2.drafts['draft-dinner'];
 await assert.rejects(p.service.act({kind:'commit',conversationId:'stress',draftId:draft.id,revision:draft.revision},{actionId:'commit-while-asking'}),/question|clarification|answer|choose/i);
 await p.agent.act({kind:'set-field',conversationId:'stress',draftId:draft.id,revision:draft.revision,opId:'dinner1',field:'title',value:'Cook dinner at home'},{actionId:'edit-while-asking'});
 const data=await p.backend.load();draft=data.intentV2.drafts['draft-dinner'];
 assert.equal(draft.status,'draft');
 assert.equal(draft.operations[0].fields.find(f=>f.name==='title').value,'Cook dinner at home');
 assert.deepEqual(data.entries,before.entries);
 assert.equal((await p.service.view({conversationId:'stress'})).captures.find(c=>c.messageId==='ask').clarification.open,true);
 const answer=await send(p,'both','Both');
 assert.equal(answer.applied.status,'applied');
 assert.equal(p.inputs.length,1);
 assert.equal((await p.backend.load()).intentV2.drafts['draft-dinner'].status,'parked');
 assert.deepEqual((await p.backend.load()).entries,before.entries);
});

test('Capture removes only a named proposal, shows the receipt and can Undo without saving the survivor',async()=>{
 const p=phone(input=>output(input,[discard('dinner1')]));
 const result=await send(p,'remove-first','Remove Cook dinner only. Keep Buy dinner ingredients.',{focusDraftId:'draft-dinner'});
 assert.equal(result.applied.status,'applied');
 let data=await p.backend.load();
 assert.equal(data.entries.length,6);
 assert.deepEqual(data.intentV2.drafts['draft-dinner'].operations.map(o=>o.opId),['dinner2']);
 const card=(await p.service.view({conversationId:'stress'})).captures[0];
 assert.equal(cardKind(card),'confirm');
 assert.equal(canUndoChange(card.draft,null),true);
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.title]),[['Removed from draft','Cook dinner']]);
 await p.agent.undo({draftId:card.draft.id,conversationId:'stress',actionId:'undo-first'});
 data=await p.backend.load();
 assert.deepEqual(data.intentV2.drafts['draft-dinner'].operations.map(o=>o.opId),['dinner1','dinner2']);
 assert.equal(data.entries.length,6);
});

test('a typed First and a choice chip remove the same proposal with no second model call',async()=>{
 for(const kind of ['typed','chip']){
  const p=phone(ask);
  await send(p,'ask','Delete this',{focusDraftId:'draft-dinner'});
  let result;
  if(kind==='typed')result=await send(p,'first','First');
  else{
   const action=(await p.service.view({conversationId:'stress'})).captures[0].clarification.actions[0].action;
   result=await p.agent.choose(action,{actionId:actionIdFor(action)});
   await assert.rejects(p.agent.choose({...action,choiceId:'c2'},{actionId:'expired-chip'}),/already answered/);
  }
  assert.equal(result.applied.status,'applied');
  assert.equal(p.inputs.length,1);
  const data=await p.backend.load();
  assert.deepEqual(data.intentV2.drafts['draft-dinner'].operations.map(o=>o.opId),['dinner2']);
  assert.equal(data.entries.length,6);
 }
});

test('Both applies once and a later First cannot reverse or repeat that removal',async()=>{
 const p=phone(input=>input.sourceUnits[0].text==='First'?output(input,[],{mode:'reflect',reply:'That question is already answered.'}):ask(input));
 await send(p,'ask','Delete this',{focusDraftId:'draft-dinner'});
 const result=await send(p,'both','Both');
 assert.equal(result.applied.status,'applied');
 assert.equal(p.inputs.length,1);
 await send(p,'late','First');
 const data=await p.backend.load();
 assert.equal(p.inputs.length,2);
 assert.equal(p.inputs[1].activeDraft,null);
 assert.equal(data.intentV2.drafts['draft-dinner'].status,'parked');
 assert.equal(data.entries.length,6);
 assert.equal(data.intentV2.captures.both.raw,'Both');
 assert.equal(data.intentV2.captures.late.raw,'First');
});
