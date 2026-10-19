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
