import {intentState} from './repository.mjs';
import {guardsFor,checkGuards,stable} from './context.mjs';
import {draftFollowUpProblem} from './follow-up.mjs';
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
export function safeQuestion(operations){for(const op of operations){const field=op.fields.find(f=>f.op==='unknown');if(field)return {opId:op.opId,field:field.name,prompt:`What should ${field.name} be for ${op.fields.find(f=>f.name==='title')?.value??op.entity}?`,options:[]};}return null;}
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
  if(kept.operations.some(o=>o.fields.some(f=>f.op==='unknown')))throw new Error('An unresolved field remains; edit it or leave the draft');
  if(kept.schedulePreview?.items?.some(item=>item.status==='review'))throw new Error('The time needs review. Edit the draft before saving.');
  const followUpIssue=draftFollowUpProblem(data,kept);if(followUpIssue)throw new Error(followUpIssue);
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
