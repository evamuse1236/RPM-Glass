import {intentState} from './repository.mjs';
import {guardsFor,checkGuards,stable} from './context.mjs';
import {draftFollowUpProblem,blocksFollowUp,FOLLOW_UP_NOTICE} from './follow-up.mjs';
import {checkAction} from './suggestions.mjs';
import {validateField} from './schema.mjs';
import {openQuestion} from './conversation-focus.mjs';

export const ident=value=>{if(typeof value!=='string'||!value||value.length>100)throw new Error('A stable client ID is required');return value;};
export const activeStatus=d=>d&&['draft','review'].includes(d.status);
export function conversation(data,id){const row=(data.conversations??[]).find(c=>c.id===id&&!c.archived);if(!row)throw new Error('Open an active conversation');return row;}
function fieldPatch(op,field){const fields=new Map(op.fields.map(f=>[f.name,f]));fields.set(field.name,field);op.fields=[...fields.values()];}
/** Proposals left out of a commit: known, not all of them, and never the new parent of a kept one. */
function skippedOps(draft,action){
 if(action.skip===undefined)return new Set();
 if(!Array.isArray(action.skip)||action.skip.some(id=>!draft.operations.some(o=>o.opId===id)))throw new Error('Unknown operation');
 const skip=new Set(action.skip);
 if(skip.size>=draft.operations.length)throw new Error('Choose at least one proposal to add');
 for(const op of draft.operations)if(!skip.has(op.opId)&&op.fields.some(f=>f.op==='set'&&typeof f.value==='string'&&f.value.startsWith('$')&&skip.has(f.value.slice(1))))throw new Error('Keep the new Block or Project that another proposal belongs to');
 return skip;
}
export function safeQuestion(operations){for(const op of operations){if(op.kind==='create')continue;const field=op.fields.find(f=>f.op==='unknown');if(field)return {opId:op.opId,field:field.name,prompt:`What should ${field.name} be for ${op.fields.find(f=>f.name==='title')?.value??op.entity}?`,options:[]};}return null;}
/** Keep incomplete creates saveable without inventing values or losing their notices. */
export function prepareCreates(draft){
 const missing=[...(draft.missing??[])],notes=[...(draft.notes??[])];
 const remember=(opId,field)=>{if(!missing.some(m=>m.opId===opId&&m.field===field))missing.push({opId,field});};
 for(const op of draft.operations){
  if(op.kind!=='create')continue;
  const review=draft.schedulePreview?.items?.find(i=>i.opId===op.opId&&i.status==='review');
  op.fields=op.fields.filter(f=>{
   if(f.op!=='unknown'&&!(review&&f.name==='time'))return true;
   remember(op.opId,f.name);return false;
  });
  if(review?.reason)notes.push(review.reason);
  if(draft.question?.opId===op.opId){notes.push(draft.question.prompt);draft.question=null;}
 }
 draft.missing=missing;draft.notes=[...new Set(notes.filter(Boolean))];
 return draft;
}
/** A tap on a draft card: answer, edit, refresh, commit or park. Bound to the draft's revision. */
export async function actOnDraft(h,action,{actionId}={}){
 ident(actionId);if(!action||typeof action!=='object')throw new Error('A typed action is required');
 const allowed=['answer','set-field','refresh-time','commit','dismiss','open'];if(!allowed.includes(action.kind))throw new Error('Unknown action');
 if(action.kind==='open'){const data=await h.repository.load();checkAction(data.intentV2?.drafts?.[action.draftId],action);return {status:'open',draftId:action.draftId};}
 const result=await h.repository.transact(`action:${actionId}`,action,async data=>{
  conversation(data,action.conversationId);const state=intentState(data),draft=state.drafts[action.draftId];checkAction(draft,action);
  if(action.kind==='dismiss'){draft.status='parked';draft.revision++;return {status:'parked',draftId:draft.id};}
  if(action.kind==='refresh-time'){
   if(typeof h.refreshSchedule!=='function'||!draft.operations.some(o=>o.fields.some(f=>f.name==='time'&&f.op==='set')))throw new Error('This draft has no date or time to refresh');
   const now=h.clock();draft.timeAnchorAt=now.toISOString();draft.schedulePreview=h.refreshSchedule({data,draft:structuredClone(draft),anchor:now});draft.reply=h.normalizeReply?.({parsed:draft,schedulePreview:draft.schedulePreview})??draft.reply;draft.review=null;draft.status='draft';draft.revision++;draft.updated=now.toISOString();return {status:'draft',draftId:draft.id,revision:draft.revision};
  }
  if(['answer','set-field'].includes(action.kind)){
   const op=draft.operations.find(o=>o.opId===action.opId);if(!op)throw new Error('Unknown operation');if(['complete','archive'].includes(op.kind))throw new Error('This operation has no editable fields');
   if(action.kind==='answer'){
    if(!draft.question||draft.question.opId!==action.opId||draft.question.field!==action.field)throw new Error('This answer is not for the open question');
    if(!draft.question.options.some(o=>stable(o.value)===stable(action.value)))throw new Error('Answer value is not an offered option');
   }
   const field={name:action.field,op:action.clear?'clear':'set',value:action.clear?null:action.value,origin:'stated',evidence:null};validateField(field,op.entity);
   // Structured user interaction is evidence in its own right, not fake chat prose.
   fieldPatch(op,{...field,sourceMessageId:null,userActionId:actionId});draft.guards={...guardsFor(data,draft.operations),...draft.guards};draft.question=safeQuestion(draft.operations);draft.review=null;draft.status='draft';draft.revision++;draft.updated=h.clock().toISOString();
   if(h.refreshSchedule){draft.schedulePreview=h.refreshSchedule({data,draft:structuredClone(draft),anchor:new Date(draft.timeAnchorAt??draft.created)});draft.reply=h.normalizeReply?.({parsed:draft,schedulePreview:draft.schedulePreview})??draft.reply;}
   return {status:'draft',draftId:draft.id,revision:draft.revision};
  }
  if(openQuestion(state,draft.conversationId))throw new Error('Answer the open question before saving this draft.');
  // The user may leave some proposals out; only the ones they kept are checked and applied.
  const skipped=skippedOps(draft,action),kept=skipped.size?{...draft,operations:draft.operations.filter(o=>!skipped.has(o.opId)),schedulePreview:draft.schedulePreview&&{...draft.schedulePreview,items:(draft.schedulePreview.items??[]).filter(i=>!skipped.has(i.opId))}}:draft;
  prepareCreates(kept);
  if(kept.operations.some(o=>o.fields.some(f=>f.op==='unknown')))throw new Error('An unresolved field remains; edit it or leave the draft');
  if(kept.schedulePreview?.items?.some(item=>item.status==='review'&&kept.operations.some(o=>o.opId===item.opId&&o.kind!=='create')))throw new Error('The time needs review. Edit the draft before saving.');
  const followUpIssue=draftFollowUpProblem(data,kept);if(blocksFollowUp(followUpIssue))throw new Error(followUpIssue);if(followUpIssue)kept.notes=[...new Set([...kept.notes,FOLLOW_UP_NOTICE])];
  checkGuards(data,draft.guards);
  if(draft.review&&action.reviewToken!==draft.review.token)throw new Error('The current schedule warning needs an explicit decision');
  // Drafts set aside are not planner records: the plan adapter gets the rest, and one receipt covers both.
  const parked=kept.operations.filter(o=>o.entity==='draft').map(o=>state.drafts[o.targetId]);
  if(parked.some(d=>!activeStatus(d)||d.conversationId!==draft.conversationId))throw new Error('That draft was already closed. Nothing changed.');
  const planned={...kept,operations:kept.operations.filter(o=>o.entity!=='draft')};
  const applied=planned.operations.length?await h.applyPlan({data,draft:structuredClone(planned),approval:{actionId,reviewToken:action.reviewToken??null,at:h.clock().toISOString()}}):{status:'committed',receipt:{undoId:null,entryIds:[],changes:[],plannerReceipts:[],savedAt:h.clock().toISOString()}};
  if(applied.status==='review'){draft.review=applied.review;draft.question=null;draft.status='review';draft.revision++;return {status:'review',draftId:draft.id,revision:draft.revision};}
  if(applied.status!=='committed')throw new Error('Plan adapter did not confirm a commit candidate');
  const receipt=parked.length?{...applied.receipt,parkedDrafts:parked.map(d=>{const was=d.status;d.status='parked';d.parkedBy=draft.id;d.revision++;return {id:d.id,status:was};})}:applied.receipt;
  draft.missing=kept.missing;draft.notes=kept.notes;draft.question=kept.question;
  draft.status='committed';draft.revision++;draft.receipt=receipt;if(skipped.size)draft.skipped=[...skipped];draft.approvedAt=h.clock().toISOString();
  return {status:'committed',draftId:draft.id,receipt};
 });
 h.emit({type:result.status,...result});return result;
}
/** One Undo for one change: the planner's records come back, and so does every draft the change set aside. */
export async function undoCommitted(h,{draftId,conversationId,actionId}){
 return h.repository.transact(`undo:${ident(actionId)}`,{draftId,conversationId},async data=>{
  conversation(data,conversationId);const drafts=intentState(data).drafts,d=drafts[draftId];
  if(!d||d.conversationId!==conversationId||d.status!=='committed')throw new Error('Committed draft not found');
  for(const edit of d.receipt?.draftEdits??[])if(drafts[edit.id]?.revision!==edit.revision)throw new Error('The draft changed after that removal. Review it before undoing.');
  let receipt={text:'Undone'};
  if(d.receipt?.undoId){if(!h.undoPlan)throw new Error('Undo adapter is not installed');receipt=await h.undoPlan({data,receipt:d.receipt});}
  for(const p of d.receipt?.parkedDrafts??[]){const t=intentState(data).drafts[p.id];if(t?.status==='parked'&&t.parkedBy===d.id){t.status=p.status;delete t.parkedBy;t.revision++;}}
  for(const edit of d.receipt?.draftEdits??[])drafts[edit.id]={...structuredClone(edit.before),revision:drafts[edit.id].revision+1,updated:h.clock().toISOString()};
  d.status='undone';d.revision++;return {status:'undone',draftId,receipt};
 });
}
/** Fields a chip on a saved item may change, per kind. */
export const EDITABLE_FIELDS={task:['title','purpose','time','minutes','blockId','recurrence','alert','must'],block:['title','purpose','projectId'],project:['title','purpose','goalId'],goal:['title','purpose','areaId'],area:['title','purpose']};
const savedItem=(draft,entity,id)=>(draft.receipt?.changes??[]).some(c=>c.type!=='delete'&&String(c.id)===String(id)&&(c.collection===({task:'tasks',block:'blocks',project:'projects',goal:'goals',area:'areas'})[entity]));
const undoChain=(record,id)=>{while(record&&record.id!==id)record=record.previous;return record??null;};
/** A chip tap on an item Capture already saved: one update through the plan adapter, with its own Undo.
 * The capture's own Undo stays reachable underneath, so it still takes back the whole capture. */
export async function editCommittedItem(h,action,{actionId}={}){
 ident(actionId);if(!action||typeof action!=='object')throw new Error('A typed action is required');
 const result=await h.repository.transact(`edit:${actionId}`,action,async data=>{
  conversation(data,action.conversationId);const draft=intentState(data).drafts[action.draftId];
  if(!draft||draft.conversationId!==action.conversationId||draft.status!=='committed')throw new Error('This capture is no longer open for changes');
  if(!EDITABLE_FIELDS[action.entity]?.includes(action.field))throw new Error('This field cannot be changed here');
  if(!savedItem(draft,action.entity,action.id))throw new Error('This item is not part of this capture');
  const field={name:action.field,op:action.clear?'clear':'set',value:action.clear?null:action.value,origin:'stated',evidence:null};validateField(field,action.entity);
  // Each edit sits directly on the capture's own Undo, so the chain stays two snapshots deep.
  const captureUndo=undoChain(data.undo,draft.receipt.undoId);
  if(!captureUndo)throw new Error('A newer change exists; change it in the planner');
  const at=h.clock().toISOString(),n=(draft.edits?.length??0)+1;
  const targetId=action.entity==='task'?Number(action.id):action.id;
  const edit={...structuredClone(draft),id:`${draft.id}:edit:${n}`,revision:1,timeAnchorAt:at,guards:{},review:null,question:null,missing:[],notes:[],schedulePreview:null,
   operations:[{opId:'edit',kind:'update',entity:action.entity,targetId,fields:[{...field,sourceMessageId:null,userActionId:actionId}]}]};
  delete edit.receipt;delete edit.edits;delete edit.applied;
  let applied=await h.applyPlan({data,draft:structuredClone(edit),approval:{actionId,reviewToken:null,at}});
  // The person picked this exact value; a clash warning is shown on the card, not asked again.
  if(applied.status==='review'){edit.review=applied.review;applied=await h.applyPlan({data,draft:structuredClone(edit),approval:{actionId,reviewToken:applied.review.token,at}});}
  if(applied.status!=='committed')throw new Error('Plan adapter did not confirm a commit candidate');
  data.undo.previous=captureUndo;
  const record={undoId:applied.receipt.undoId,entity:action.entity,id:String(action.id),field:action.field,label:typeof action.label==='string'?action.label.slice(0,80):null,at};
  draft.edits=[...(draft.edits??[]),record];draft.revision++;draft.updated=at;
  return {status:'edited',draftId:draft.id,edit:record};
 });
 h.emit({type:result.status,...result});return result;
}
/** Undo for one chip change: only that change comes back; the capture's Undo stays available. */
export async function undoEdit(h,action,{actionId}={}){
 ident(actionId);
 const result=await h.repository.transact(`undo-edit:${actionId}`,action,async data=>{
  conversation(data,action.conversationId);const draft=intentState(data).drafts[action.draftId];
  const edit=(draft?.edits??[]).find(e=>e.undoId===action.undoId&&!e.undone);
  if(!draft||draft.conversationId!==action.conversationId||draft.status!=='committed'||!edit)throw new Error('That change was already undone');
  if(data.undo?.id!==edit.undoId)throw new Error('A newer change exists; inspect current plans before undoing');
  await h.undoPlan({data,receipt:{undoId:edit.undoId}});
  edit.undone=true;draft.revision++;draft.updated=h.clock().toISOString();
  return {status:'edit-undone',draftId:draft.id,undoId:edit.undoId};
 });
 h.emit({type:result.status,...result});return result;
}
