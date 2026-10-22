import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,turn,operation,field,getDraft} from './helpers.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {sourceUnits,checkGuards} from '../src/context.mjs';

const RAW='Cook dinner and buy dinner ingredients';
const initial=()=>turn(RAW,[operation([field('title','Cook dinner','Cook dinner')],{opId:'dinner1'}),operation([field('title','Buy dinner ingredients','buy dinner ingredients')],{opId:'dinner2'})]);
const discard=(opId='dinner1',extra={})=>({opId,sourceId:'s0',kind:'discard',entity:'task',targetId:null,fields:[],...extra});
const remove=(raw,ops=[discard()])=>turn(raw,ops,{draftMode:'amend',reply:'Removed from the draft.'});
const send=(s,messageId,text,extra={})=>s.harness.capture({messageId,conversationId:'c1',text,...extra});

test('discarding a proposal preserves the original guards of surviving saved-item edits',async()=>{
 const raw='Rename Existing to Changed and buy milk';let calls=0;
 const s=setup(async()=>++calls===1?turn(raw,[operation([field('title','Changed','Changed')],{opId:'rename',kind:'update',targetId:'1'}),operation([field('title','Buy milk','buy milk')],{opId:'milk'})]):remove('Remove milk',[discard('milk')]));
 await s.repository.transact('seed-task',{},data=>{data.entries.push({id:1,title:'Existing',kind:'plan'});return {};});
 const first=await send(s,'original',raw);
 await s.repository.transact('external',{},data=>{data.entries[0].title='External newer title';return {};});
 await send(s,'remove-milk','Remove milk',{focusDraftId:first.draftId});
 const data=await s.repository.load();
 assert.throws(()=>checkGuards(data,data.intentV2.drafts[first.draftId].guards),/TARGET_CHANGED/);
});

test('discard and a time amendment share current sources and a fresh schedule preview',async()=>{
 const raw='Read tomorrow at 7pm and buy milk',reply='Remove milk and move Read tomorrow at 9pm';let calls=0;
 const s=setup(async()=>++calls===1?turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow 7pm','7pm')],{opId:'read'}),operation([field('title','Buy milk','buy milk')],{opId:'milk'})]):remove(reply,[discard('milk'),operation([field('time','tomorrow 9pm','9pm')],{opId:'read'})]),{refreshSchedule:({draft})=>({items:draft.operations.filter(o=>o.fields.some(f=>f.name==='time')).map(o=>({opId:o.opId,label:o.fields.find(f=>f.name==='time').value}))})});
 const first=await send(s,'old-source',raw);
 await send(s,'new-source',reply,{focusDraftId:first.draftId});
 const draft=await getDraft(s.repository,first.draftId);
 assert.deepEqual(draft.sourceMessageIds,['old-source','new-source']);
 assert.equal(draft.schedulePreview.items[0].label,'tomorrow 9pm');
});

test('removing one proposal keeps the other pending and gives a draft-only Undo',async()=>{
 let n=0;const s=setup(async()=>++n===1?initial():remove('Remove Cook dinner. Keep the ingredients.'));
 const first=await send(s,'m0',RAW);
 const result=await send(s,'m1','Remove Cook dinner. Keep the ingredients.',{focusDraftId:first.draftId});
 assert.equal(result.status,'interpreted');
 const changed=await getDraft(s.repository,first.draftId);
 assert.deepEqual(changed.operations.map(o=>o.opId),['dinner2']);
 assert.equal(changed.status,'draft');
 assert.equal(s.adapter.calls,0,'keeping a proposal does not save it as a task');
 const receipt=await getDraft(s.repository,result.draftId);
 assert.equal(receipt.status,'committed');
 assert.equal(receipt.receipt.undoId,null);
 assert.equal((await s.repository.load()).intentV2.captures.m1.raw,'Remove Cook dinner. Keep the ingredients.');
 await s.harness.undo({draftId:result.draftId,conversationId:'c1',actionId:'undo-remove'});
 assert.deepEqual((await getDraft(s.repository,first.draftId)).operations.map(o=>o.opId),['dinner1','dinner2']);
 assert.equal(s.adapter.calls,0);
});

test('removing every proposal sets the draft aside and Undo restores its original proposals',async()=>{
 let n=0;const s=setup(async()=>++n===1?initial():remove('Remove both draft items',[discard('dinner1'),discard('dinner2')]));
 const first=await send(s,'m0',RAW);
 const result=await send(s,'m1','Remove both draft items',{focusDraftId:first.draftId});
 assert.equal(result.status,'interpreted');
 assert.equal((await getDraft(s.repository,first.draftId)).status,'parked');
 await s.harness.undo({draftId:result.draftId,conversationId:'c1',actionId:'undo-both'});
 const restored=await getDraft(s.repository,first.draftId);
 assert.equal(restored.status,'draft');
 assert.deepEqual(restored.operations.map(o=>o.opId),['dinner1','dinner2']);
});

test('a proposal removal cannot target an invented ID, retarget an operation, carry patches, or run outside amend',()=>{
 const activeDraft={id:'d0',operations:initial().operations};
 const parse=t=>interpretTurn(t,{units:sourceUnits('Remove it'),messageId:'m1',visibleEntities:[],activeDraft});
 for(const op of [discard('missing'),discard('dinner1',{entity:'block'}),discard('dinner1',{targetId:'9'}),discard('dinner1',{fields:[field('title','Changed','Remove it')]})])assert.throws(()=>parse(remove('Remove it',[op])));
 assert.throws(()=>parse({...remove('Remove it'),draftMode:'new'}));
});

test('a whole-draft removal cannot override an explicitly retained proposal',()=>{
 const raw='Remove Cook dinner. Keep Buy dinner ingredients.';
 const proposal=turn(raw,[{opId:'remove-all',sourceId:'s0',kind:'archive',entity:'draft',targetId:'d0',fields:[]}]);
 assert.throws(()=>interpretTurn(proposal,{units:sourceUnits(raw),messageId:'m1',visibleEntities:[{entity:'draft',id:'d0'}],activeDraft:{id:'d0',operations:initial().operations}}),/keep|proposal/);
});

test('Undo of an earlier proposal removal refuses to overwrite a later edit',async()=>{
 let n=0;const s=setup(async()=>++n===1?initial():remove('Remove Cook dinner'));
 const first=await send(s,'m0',RAW);
 const result=await send(s,'m1','Remove Cook dinner',{focusDraftId:first.draftId});
 assert.equal(result.status,'interpreted');
 const changed=await getDraft(s.repository,first.draftId);
 await s.harness.act({kind:'set-field',draftId:first.draftId,conversationId:'c1',revision:changed.revision,opId:'dinner2',field:'title',value:'Buy vegetables'},{actionId:'later-edit'});
 await assert.rejects(s.harness.undo({draftId:result.draftId,conversationId:'c1',actionId:'undo-old'}),/changed/);
 assert.equal((await getDraft(s.repository,first.draftId)).operations[0].fields[0].value,'Buy vegetables');
});
