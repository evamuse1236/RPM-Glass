import {intentState} from './repository.mjs';
import {sourceUnits,buildContext,guardsFor,checkGuards,stable,findEntity} from './context.mjs';
import {interpretTurn} from './interpret.mjs';
import {checkAction} from './suggestions.mjs';
import {validateField} from './schema.mjs';

const ident=value=>{if(typeof value!=='string'||!value||value.length>100)throw new Error('A stable client ID is required');return value;};
const activeStatus=d=>d&&['draft','review'].includes(d.status);
function conversation(data,id){const row=(data.conversations??[]).find(c=>c.id===id&&!c.archived);if(!row)throw new Error('Open an active conversation');return row;}
function fieldPatch(op,field){const fields=new Map(op.fields.map(f=>[f.name,f]));fields.set(field.name,field);op.fields=[...fields.values()];}
function safeQuestion(operations){for(const op of operations){const field=op.fields.find(f=>f.op==='unknown');if(field)return {opId:op.opId,field:field.name,prompt:`What should ${field.name} be for ${op.fields.find(f=>f.name==='title')?.value??op.entity}?`,options:[]};}return null;}
/** Orchestration only. The model never receives a mutating function or persistence key. */
export class IntentHarness {
 constructor({repository,model,applyPlan,undoPlan=null,refreshSchedule=null,onEvent=()=>{},clock=()=>new Date(),timezone='Asia/Kolkata',timeoutMs=12000,maxRepairCalls=1}={}){
  if(!repository||!model||!applyPlan)throw new Error('repository, model and applyPlan are required');
  Object.assign(this,{repository,model,applyPlan,undoPlan,refreshSchedule,onEvent,clock,timezone,timeoutMs,maxRepairCalls});this.running=new Map();
 }
 emit(event){try{this.onEvent(event);}catch{/* Telemetry/UI must never break persistence. */}}
 async capture(input){
  const {messageId,conversationId,text,focusDraftId=null}=input;ident(messageId);ident(conversationId);
  if(typeof text!=='string'||!text.trim()||text.length>12000)throw new Error('Use 1–12,000 characters');
  await this.repository.transact(`capture:${messageId}`,{conversationId,text,focusDraftId},data=>{
   const chat=conversation(data,conversationId);const v=intentState(data);const focus=focusDraftId?v.drafts[focusDraftId]:null;
   if(focusDraftId&&(!activeStatus(focus)||focus.conversationId!==conversationId))throw new Error('Focused draft is no longer available');
   v.captures[messageId]={messageId,conversationId,raw:text,at:this.clock().toISOString(),timezone:this.timezone,focusDraftId,focusRevision:focus?.revision??null,status:'captured'};
   if(chat.title==='New conversation'&&!(chat.messages??[]).length)chat.title=text.trim().slice(0,60);
   return {messageId,status:'captured'};
  });
  this.emit({type:'captured',messageId});return this.interpret(messageId);
 }
 /** Retry interpretation of the SAME journal record, never a second user message. */
 async interpret(messageId){
  ident(messageId);if(this.running.has(messageId))return this.running.get(messageId);
  const p=this.#interpret(messageId).finally(()=>this.running.delete(messageId));this.running.set(messageId,p);return p;
 }
 async #interpret(messageId){
  const data=await this.repository.load(),v=intentState(data),capture=v.captures[messageId];
  if(!capture)throw new Error('Capture not found');
  if(capture.status==='interpreted')return {messageId,draftId:capture.draftId??null,status:'interpreted'};
  conversation(data,capture.conversationId);
  const activeDraft=capture.focusDraftId?v.drafts[capture.focusDraftId]:null;
  if(activeDraft&&(!activeStatus(activeDraft)||activeDraft.revision!==capture.focusRevision))return {messageId,status:'stale',error:'The focused draft changed; the original is kept.'};
  let units;try{units=sourceUnits(capture.raw);}catch(error){return {messageId,status:'captured',error:error.message};}
  const context=buildContext(data,{raw:capture.raw,conversationId:capture.conversationId,now:new Date(capture.at)});context.timezone=capture.timezone;
  // Referenced draft targets are explicitly visible, even when not keyword-relevant.
  if(activeDraft)for(const op of activeDraft.operations){
   const include=(entity,id)=>{if(!context.entities.some(e=>e.entity===entity&&e.id===String(id))){const row=findEntity(data,entity,id);if(row)context.entities.push({entity,id:String(id),title:row.title});}};
   if(op.targetId!==null)include(op.entity,op.targetId);
   for(const f of op.fields){const entity={blockId:'block',projectId:'project',goalId:'goal',areaId:'area'}[f.name];if(entity&&f.op==='set'&&!f.value.startsWith('$'))include(entity,f.value);}
  }
  const draftContext=activeDraft?{id:activeDraft.id,revision:activeDraft.revision,operations:activeDraft.operations.map(o=>({opId:o.opId,kind:o.kind,entity:o.entity,targetId:o.targetId,fields:o.fields.map(f=>({name:f.name,op:f.op,value:typeof f.value==='string'?f.value.slice(0,1000):f.value,origin:f.origin,truncated:typeof f.value==='string'&&f.value.length>1000}))}))}:null;
  const input={messageId,sourceUnits:units,context,activeDraft:draftContext};
  if(JSON.stringify(input).length>45000)return {messageId,status:'captured',error:'This thought needs a larger review. The original is kept; no task changed.'};
  const controller=new AbortController();let timer;const deadline=Date.now()+this.timeoutMs;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const e=new Error('Interpretation timed out; the captured words are safe');e.code='TIMEOUT';reject(e);},this.timeoutMs);});
  let repair=null,parsed,calls=0;
  try{
   for(let attempt=0;attempt<=this.maxRepairCalls;attempt++){
    this.emit({type:'interpreting',messageId,attempt});calls++;
    // Race protects the journal from a transport that ignores cancellation.
    // The transport must ALSO abort network work to avoid wasted native requests.
    const output=await Promise.race([this.model({...input,repair},{signal:controller.signal,deadline}),timeout]);
    try{parsed=interpretTurn(output,{units,messageId,visibleEntities:context.entities,activeDraft});break;}
    catch(error){if(attempt===this.maxRepairCalls)throw error;repair={validationError:error.message};}
   }
   const result=await this.repository.transact(`interpret:${messageId}`,{messageId},current=>{
    conversation(current,capture.conversationId);const state=intentState(current),saved=state.captures[messageId];
    if(saved.status==='interpreted')return {messageId,draftId:saved.draftId??null,status:'interpreted'};
    let draftId=null;
    if(parsed.draftMode!=='none'&&parsed.operations.length){
     const previous=parsed.draftMode==='amend'?state.drafts[capture.focusDraftId]:null;
     if(parsed.draftMode==='amend'&&(!activeStatus(previous)||previous.revision!==capture.focusRevision))throw new Error('STALE_MODEL_RESULT: draft changed during interpretation');
     draftId=previous?.id??`draft-${messageId}`;
     const newGuards=guardsFor(data,parsed.operations); // Baseline is pre-call data, not a newer, silently changed target.
     const timeAnchorAt=capture.at,schedulePreview=this.refreshSchedule?.({data:current,draft:{operations:parsed.operations},anchor:new Date(timeAnchorAt)})??previous?.schedulePreview??null;
     state.drafts[draftId]={id:draftId,conversationId:capture.conversationId,revision:(previous?.revision??0)+1,status:'draft',created:previous?.created??capture.at,updated:this.clock().toISOString(),operations:parsed.operations,guards:{...newGuards,...previous?.guards},question:parsed.question??safeQuestion(parsed.operations),review:null,sourceMessageIds:[...new Set([...(previous?.sourceMessageIds??[]),messageId])],reply:parsed.reply,timeAnchorAt,schedulePreview};
    }
    saved.status='interpreted';saved.draftId=draftId;saved.decisions=parsed.decisions;saved.reply=parsed.reply;saved.memoryCandidates=parsed.memoryCandidates;saved.calls=calls;delete saved.lastError;
    return {messageId,draftId,status:'interpreted',calls};
   });
   this.emit({type:'ready',...result});return result;
  }catch(error){const result={messageId,status:'captured',error:error.message,code:error.code??'INTERPRETATION_FAILED',calls};
   // Keep the retry state beside the durable raw capture. A failure receipt uses
   // one stable ID per capture, so repeated outages do not grow the ledger.
   try{await this.repository.transact(`interpret-failure:${messageId}`,{messageId},current=>{const saved=intentState(current).captures[messageId];if(saved&&saved.status!=='interpreted')saved.lastError={message:result.error,code:result.code,at:this.clock().toISOString()};return result;});}catch{/* Raw capture was already committed; surface the original model error. */}
   this.emit({type:'needs-attention',...result});return result;}
  finally{clearTimeout(timer);controller.abort();}
 }
 async act(action,{actionId}={}){
  ident(actionId);if(!action||typeof action!=='object')throw new Error('A typed action is required');
  const allowed=['answer','set-field','refresh-time','commit','dismiss','open'];if(!allowed.includes(action.kind))throw new Error('Unknown action');
  if(action.kind==='open'){const data=await this.repository.load();checkAction(data.intentV2?.drafts?.[action.draftId],action);return {status:'open',draftId:action.draftId};}
  const result=await this.repository.transact(`action:${actionId}`,action,async data=>{
   conversation(data,action.conversationId);const state=intentState(data),draft=state.drafts[action.draftId];checkAction(draft,action);
   if(action.kind==='dismiss'){draft.status='parked';draft.revision++;return {status:'parked',draftId:draft.id};}
   if(action.kind==='refresh-time'){
    if(typeof this.refreshSchedule!=='function'||!draft.operations.some(o=>o.fields.some(f=>f.name==='time'&&f.op==='set')))throw new Error('This draft has no date or time to refresh');
    const now=this.clock();draft.timeAnchorAt=now.toISOString();draft.schedulePreview=this.refreshSchedule({data,draft:structuredClone(draft),anchor:now});draft.review=null;draft.status='draft';draft.revision++;draft.updated=now.toISOString();return {status:'draft',draftId:draft.id,revision:draft.revision};
   }
   if(['answer','set-field'].includes(action.kind)){
    const op=draft.operations.find(o=>o.opId===action.opId);if(!op)throw new Error('Unknown operation');if(['complete','archive'].includes(op.kind))throw new Error('This operation has no editable fields');
    if(action.kind==='answer'){
     if(!draft.question||draft.question.opId!==action.opId||draft.question.field!==action.field)throw new Error('This answer is not for the open question');
     if(!draft.question.options.some(o=>stable(o.value)===stable(action.value)))throw new Error('Answer value is not an offered option');
    }
    const field={name:action.field,op:action.clear?'clear':'set',value:action.clear?null:action.value,origin:'stated',evidence:null};validateField(field,op.entity);
    // Structured user interaction is evidence in its own right, not fake chat prose.
    fieldPatch(op,{...field,sourceMessageId:null,userActionId:actionId});draft.guards={...guardsFor(data,draft.operations),...draft.guards};draft.question=safeQuestion(draft.operations);draft.review=null;draft.status='draft';draft.revision++;draft.updated=this.clock().toISOString();
    return {status:'draft',draftId:draft.id,revision:draft.revision};
   }
   if(draft.operations.some(o=>o.fields.some(f=>f.op==='unknown')))throw new Error('An unresolved field remains; edit it or leave the draft');
   checkGuards(data,draft.guards);
   if(draft.review&&action.reviewToken!==draft.review.token)throw new Error('The current schedule warning needs an explicit decision');
   const applied=await this.applyPlan({data,draft:structuredClone(draft),approval:{actionId,reviewToken:action.reviewToken??null,at:this.clock().toISOString()}});
   if(applied.status==='review'){draft.review=applied.review;draft.question=null;draft.status='review';draft.revision++;return {status:'review',draftId:draft.id,revision:draft.revision};}
   if(applied.status!=='committed')throw new Error('Plan adapter did not confirm a commit candidate');
   draft.status='committed';draft.revision++;draft.receipt=applied.receipt;draft.approvedAt=this.clock().toISOString();
   return {status:'committed',draftId:draft.id,receipt:applied.receipt};
  });
  this.emit({type:result.status,...result});return result;
 }
 async resume(draftId,{conversationId,actionId}={}){
  return this.repository.transact(`resume:${ident(actionId)}`,{draftId,conversationId},data=>{conversation(data,conversationId);const d=intentState(data).drafts[draftId];if(!d||d.conversationId!==conversationId||d.status!=='parked')throw new Error('No parked draft here');d.status=d.review?'review':'draft';d.revision++;return {status:d.status,draftId,revision:d.revision};});
 }
 async acceptMemory({messageId,index,conversationId,actionId,expiresAt=null}){
  return this.repository.transact(`memory:${ident(actionId)}`,{messageId,index,conversationId,expiresAt},data=>{
   conversation(data,conversationId);const v=intentState(data),c=v.captures[messageId],candidate=c?.memoryCandidates?.[index];
   if(!candidate||c.conversationId!==conversationId)throw new Error('Memory candidate not found');
   if(expiresAt!==null&&(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=+this.clock()))throw new Error('Expiry must be a future instant');
   const id=`memory-${messageId}-${index}`;if(!v.approvedMemories.some(m=>m.id===id))v.approvedMemories.push({id,text:candidate.text,evidence:candidate.evidence,source:messageId,sensitive:candidate.sensitive,approved:true,approvedAt:this.clock().toISOString(),expiresAt,archived:false});return {status:'remembered',memoryId:id};
  });
 }
 async forgetMemory({memoryId,conversationId,actionId}){
  return this.repository.transact(`forget:${ident(actionId)}`,{memoryId,conversationId},data=>{conversation(data,conversationId);const m=intentState(data).approvedMemories.find(m=>m.id===memoryId);if(!m)throw new Error('Memory not found');m.archived=true;return {status:'forgotten',memoryId};});
 }
 async undo({draftId,conversationId,actionId}){
  if(!this.undoPlan)throw new Error('Undo adapter is not installed');
  return this.repository.transact(`undo:${ident(actionId)}`,{draftId,conversationId},async data=>{conversation(data,conversationId);const d=intentState(data).drafts[draftId];if(!d||d.conversationId!==conversationId||d.status!=='committed')throw new Error('Committed draft not found');const receipt=await this.undoPlan({data,receipt:d.receipt});d.status='undone';d.revision++;return {status:'undone',draftId,receipt};});
 }
}
