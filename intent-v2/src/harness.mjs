import {userMessage} from '../../android-companion/user-message.mjs';
import {validateFollowUp} from './follow-up.mjs';
import {intentState} from './repository.mjs';
import {sourceUnits,buildContext,guardsFor,checkGuards,findEntity,contextEntity,draftEntity} from './context.mjs';
import {interpretTurn} from './interpret.mjs';
import {ident,activeStatus,conversation,safeQuestion,actOnDraft,undoCommitted} from './draft-actions.mjs';
import {quickAnswer} from './quick-answer.mjs';
import {inputSummary} from './input-summary.mjs';
import {focusFor,focusOf,questionFor,openQuestion} from './conversation-focus.mjs';
import {readChoiceReply,choiceTurn,choiceEntities,orphanChoiceTurn} from './choice-reply.mjs';
import {proposalEntities,stageProposalRemoval} from './proposal-removal.mjs';
import {completeShortReminder} from './short-reminder.mjs';
import {completeWaterLog} from './body-intent.mjs';

const STALE_FOCUS='STALE_FOCUS';
/** Orchestration only. The model never receives a mutating function or persistence key. */
export class IntentHarness {
 constructor({repository,model,applyPlan,undoPlan=null,refreshSchedule=null,modelPolicy=null,snapshot=null,normalizeReply=null,validateInterpretation=null,recoverInterpretation=null,onEvent=()=>{},clock=()=>new Date(),timezone='Asia/Kolkata',timeoutMs=12000,maxRepairCalls=1}={}){
  if(!repository||!model||!applyPlan)throw new Error('repository, model and applyPlan are required');
  Object.assign(this,{repository,model,applyPlan,undoPlan,refreshSchedule,modelPolicy,snapshot,normalizeReply,validateInterpretation,recoverInterpretation,onEvent,clock,timezone,timeoutMs,maxRepairCalls});this.running=new Map();
 }
 emit(event){try{this.onEvent(event);}catch{/* Telemetry/UI must never break persistence. */}}
 async capture(input,{localTurn=null,validateLocal=null}={}){
  const {messageId,conversationId,text,focusDraftId=null}=input;ident(messageId);ident(conversationId);
  if(typeof text!=='string'||!text.trim()||text.length>12000)throw new Error('Use 1–12,000 characters');
  await this.repository.transact(`capture:${messageId}`,{conversationId,text,focusDraftId},data=>{
   const chat=conversation(data,conversationId);const v=intentState(data);const focus=focusFor(v,{conversationId,messageId,focusDraftId});
   if(localTurn)validateLocal(data);
   v.captures[messageId]={messageId,conversationId,raw:text,at:this.clock().toISOString(),timezone:this.timezone,focusDraftId:focus?.draftId??null,focusRevision:focus?.draftRevision??null,focus,status:'captured'};
   if(localTurn)Object.assign(v.captures[messageId],{localTurn,localGuards:guardsFor(data,localTurn.operations)});
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
  const focus=focusOf(capture),focused=focus?.draftId?v.drafts[focus.draftId]:null;
  const stale=!!focus?.draftId&&(!!focus.stale||!activeStatus(focused)||focused.conversationId!==capture.conversationId||focused.revision!==focus.draftRevision);
  // The words are already saved. A stale pointer is reported once; Retry then reads the words on their own.
  if(stale&&capture.lastError?.code!==STALE_FOCUS)return this.#needsAttention(messageId,Object.assign(new Error('The draft you pointed at changed or closed. Your words are saved; tap Retry to read them on their own.'),{code:STALE_FOCUS}),{calls:0,modelRuns:[]});
  const activeDraft=stale?null:focused,question=questionFor(v,capture);
  let units;try{units=sourceUnits(capture.raw);}catch(error){return {messageId,status:'captured',error:userMessage(error)};}
  if(capture.localTurn){
   try{
    checkGuards(data,capture.localGuards);
    const visibleEntities=capture.localTurn.operations.map(op=>contextEntity(op.entity,findEntity(data,op.entity,op.targetId),capture.timezone));
    const parsed=interpretTurn(capture.localTurn,{units,messageId,visibleEntities,activeDraft:null});
    return await this.#stage(messageId,{data,capture,parsed,units,activeDraft:null,calls:0,modelRuns:[]});
   }catch(error){return this.#needsAttention(messageId,error,{calls:0,modelRuns:[]});}
  }
  if(question||capture.choice){
   try{
    if(capture.choice&&question?.id!==capture.choice.questionId)throw new Error('That question was already answered or replaced. Nothing changed.');
    const choiceIds=readChoiceReply(capture.raw,question,{choiceId:capture.choice?.choiceId??null,focus}),turn=choiceIds&&choiceTurn(capture.raw,question,choiceIds,{activeDraft});
    if(turn){
     const parsed=interpretTurn(turn,{units,messageId,visibleEntities:choiceEntities(data,question,choiceIds,capture.timezone,{activeDraft}),activeDraft});
     return await this.#stage(messageId,{data,capture,parsed,units,activeDraft,calls:0,modelRuns:[],extra:{choice:{questionId:question.id,choiceIds}}});
    }
   }catch(error){return this.#needsAttention(messageId,error,{calls:0,modelRuns:[]});}
  }
  const quick=activeDraft?null:quickAnswer(capture.raw,{now:new Date(capture.at),timezone:capture.timezone});
  if(quick)return this.#answerLocally(messageId,units,quick);
  const targets=[...(activeDraft?.operations??[]).filter(o=>o.targetId!==null).map(o=>({entity:o.entity,id:String(o.targetId)})),...(question?.choices??[]).flatMap(c=>c.targets).map(t=>t.entity==='alarm'?{entity:'task',id:t.id}:t)];
  const meta={},context=buildContext(data,{messageId,raw:capture.raw,conversationId:capture.conversationId,focus:{draftId:activeDraft?.id??null,questionId:question?.id??null,targets},now:new Date(capture.at),timezone:capture.timezone,meta});
  // Referenced draft targets are explicitly visible, even when not keyword-relevant.
  if(activeDraft)for(const op of activeDraft.operations){
   const include=(entity,id)=>{if(!context.entities.some(e=>e.entity===entity&&e.id===String(id))){const row=findEntity(data,entity,id);if(row)context.entities.push(contextEntity(entity,row,capture.timezone));}};
   if(op.targetId!==null)include(op.entity,op.targetId);
   for(const f of op.fields){const entity={blockId:'block',projectId:'project',goalId:'goal',areaId:'area'}[f.name];if(entity&&f.op==='set'&&!f.value.startsWith('$'))include(entity,f.value);}
  }
  for(const d of [activeDraft,...(question?.choices??[]).flatMap(c=>c.targets).filter(t=>t.entity==='draft').map(t=>v.drafts[t.id])])
   if(activeStatus(d)&&!context.entities.some(e=>e.entity==='draft'&&e.id===d.id))context.entities.push(draftEntity(data,d));
  if(activeDraft)context.entities.push(...proposalEntities(activeDraft));
  const draftContext=activeDraft?{id:activeDraft.id,revision:activeDraft.revision,operations:activeDraft.operations.map(o=>({opId:o.opId,kind:o.kind,entity:o.entity,targetId:o.targetId,fields:o.fields.map(f=>({name:f.name,op:f.op,value:typeof f.value==='string'?f.value.slice(0,1000):f.value,origin:f.origin,truncated:typeof f.value==='string'&&f.value.length>1000}))})),question:activeDraft.question?{prompt:activeDraft.question.prompt,field:activeDraft.question.field,options:activeDraft.question.options.map(o=>o.label)}:null,reply:activeDraft.reply??null}:null;
  const plan=this.snapshot?await this.snapshot({data,capture,context}):null;
  if(plan?.truncated)meta.truncated={...meta.truncated,snapshot:plan.truncated};
  for(const e of plan?.entities??[])if(!context.entities.some(x=>x.entity===e.entity&&x.id===e.id))context.entities.push(e);
  const input={messageId,sourceUnits:units,context,activeDraft:draftContext,...(question?{openQuestion:{id:question.id,prompt:question.prompt,action:question.action,choices:question.choices}}:{}),...(plan?{snapshot:plan.summary}:{})};
  if(JSON.stringify(input).length>45000)return {messageId,status:'captured',error:'This thought needs a larger review. The original is kept; no task changed.'};
  const controller=new AbortController();let timer;
  let repair=null,parsed,fallback=null,held=null,calls=0;const modelRuns=[];
  try{
   for(let attempt=0;attempt<=this.maxRepairCalls;attempt++){
    const route=this.modelPolicy?.({input,attempt})??null;
    const budget=route?.timeoutMs??this.timeoutMs,deadline=Date.now()+budget;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const e=new Error('Interpretation timed out; the captured words are safe');e.code='TIMEOUT';reject(e);},budget);});
    this.emit({type:'interpreting',messageId,attempt,...(route?{effort:route.effort}:{})});calls++;
    const run={...(route??{}),attempt,ms:null,ok:false,input:inputSummary({...input,repair},meta)};modelRuns.push(run);const started=Date.now();
    try{
     const output=await Promise.race([this.model({...input,repair},{signal:controller.signal,deadline,route,run}),timeout]).finally(()=>{run.ms=Date.now()-started;});run.ok=true;
     const reminder=completeShortReminder(output,input),water=completeWaterLog(reminder,input),completed=orphanChoiceTurn(water,input);
     if(completed!==output)run.completion=completed!==water?'closed-choice':water!==reminder?'water-log':'short-reminder';
     parsed=interpretTurn(completed,{units,messageId,visibleEntities:context.entities,activeDraft});
     validateFollowUp(parsed,{input});
     held=this.recoverInterpretation?.(parsed,{input,activeDraft})??held;
     this.validateInterpretation?.(parsed,{input});
     // A fast run that turns out to be a plan or a large edit gets one stronger follow-up, sharing the repair allowance.
     const next=route&&this.modelPolicy({input,output});if(next&&next.model!==route.model&&attempt<this.maxRepairCalls){run.escalated=next.reason;fallback=parsed;repair={validationError:'This request needs careful planning. Check every change against the supplied snapshot and give concrete suggested steps for a plan.'};continue;}
     break;
    }catch(error){
     run.error=error.code??'INVALID_OUTPUT';
     if(fallback){parsed=fallback;run.fellBack=true;break;}
     if(controller.signal.aborted||attempt===this.maxRepairCalls||error.code==='TIMEOUT'||error.code==='TRANSPORT_ERROR'){
      if(held){parsed=held;run.keptValidParts=true;break;}
      throw error;
     }
     // Network/provider failures are not repaired. Invalid structured content or
     // local semantic validation errors may use the one stronger-model attempt.
     if(error.code==='TRANSPORT_ERROR')throw error;
     repair={validationError:error.message/* rules-allow raw-error-text: sent back to the model as a repair hint, never shown */};
    }finally{clearTimeout(timer);}
   }
   return await this.#stage(messageId,{data,capture,parsed,units,activeDraft,calls,modelRuns});
  }catch(error){return this.#needsAttention(messageId,error,{calls,modelRuns});}
  finally{clearTimeout(timer);controller.abort();}
 }
 /** Save what was read: a draft unless asking which item, the reply, notes, card and any choice question, in one write. */
 async #stage(messageId,{data,capture,parsed,units,activeDraft,calls,modelRuns,extra={}}){
   const result=await this.repository.transact(`interpret:${messageId}`,{messageId},current=>{
    conversation(current,capture.conversationId);const state=intentState(current),saved=state.captures[messageId];
    if(saved.status==='interpreted')return {messageId,draftId:saved.draftId??null,status:'interpreted'};
    let draftId=null;
    if(!parsed.clarification&&parsed.discarded?.length)draftId=stageProposalRemoval(state,{data,capture,activeDraft,parsed,now:this.clock().toISOString(),refreshSchedule:this.refreshSchedule});
    else if(!parsed.clarification&&parsed.draftMode!=='none'&&parsed.operations.length){
     const previous=parsed.draftMode==='amend'?state.drafts[activeDraft?.id]:null;
     if(parsed.draftMode==='amend'&&(!activeStatus(previous)||previous.revision!==capture.focusRevision))throw new Error('STALE_MODEL_RESULT: draft changed during interpretation');
     draftId=previous?.id??`draft-${messageId}`;
     const newGuards=guardsFor(data,parsed.operations); // Baseline is pre-call data, not a newer, silently changed target.
     const timeChanged=parsed.operations.some(op=>op.fields.some(f=>f.name==='time'&&f.sourceMessageId===messageId));
     const timeAnchorAt=previous&&!timeChanged?(previous.timeAnchorAt??previous.created):capture.at,sourceRaw=[...(previous?.sourceMessageIds??[]).map(id=>state.captures[id]?.raw??''),capture.raw].join('\n'),schedulePreview=this.refreshSchedule?.({data:current,draft:{operations:parsed.operations,conversationId:capture.conversationId,raw:sourceRaw},anchor:new Date(timeAnchorAt)})??previous?.schedulePreview??null;
     parsed.reply=this.normalizeReply?.({parsed,schedulePreview})??parsed.reply;
     state.drafts[draftId]={id:draftId,conversationId:capture.conversationId,revision:(previous?.revision??0)+1,status:'draft',created:previous?.created??capture.at,updated:this.clock().toISOString(),operations:parsed.operations,guards:{...newGuards,...previous?.guards},question:parsed.question??safeQuestion(parsed.operations),mode:parsed.mode,review:null,sourceMessageIds:[...new Set([...(previous?.sourceMessageIds??[]),messageId])],reply:parsed.reply,timeAnchorAt,schedulePreview};
    }
    if(parsed.notice)parsed.reply=[parsed.reply,parsed.notice].filter(Boolean).join(' ');
    saved.status='interpreted';saved.draftId=draftId;saved.decisions=withNotes(parsed.decisions,units);saved.reply=parsed.reply;saved.memoryCandidates=parsed.memoryCandidates;saved.card=parsed.card??null;saved.calls=calls;if(modelRuns.length)saved.modelRuns=modelRuns;delete saved.lastError;
    if(parsed.unapplied)saved.unapplied=structuredClone(parsed.unapplied);
    if(parsed.clarification)saved.clarification={id:`q-${messageId}`,revision:1,prompt:parsed.clarification.prompt,action:parsed.clarification.action,choices:parsed.clarification.choices.map((c,i)=>({id:`c${i+1}`,label:c.label,targets:c.targets.map(t=>({entity:t.entity,id:String(t.id)}))}))};
    Object.assign(saved,extra);
    return {messageId,draftId,status:'interpreted',calls};
   });
   this.emit({type:'ready',...result});return {...result,modelRuns};
 }
 /** A tap on a choice chip: saved as a capture in the chip's words, then read against the question it answers. */
 async choose(action,{actionId}={}){
  ident(actionId);if(action?.kind!=='choose')throw new Error('Unknown action');
  const messageId=actionId;
  await this.repository.transact(`choose:${actionId}`,action,data=>{
   conversation(data,action.conversationId);const v=intentState(data),question=openQuestion(v,action.conversationId);
   if(!question||question.id!==action.questionId||question.revision!==action.revision)throw new Error('That question was already answered or replaced. Nothing changed.');
   const choice=question.choices.find(c=>c.id===action.choiceId);if(!choice)throw new Error('That choice was not offered. Nothing changed.');
   const focus=focusFor(v,{conversationId:action.conversationId,messageId});
   v.captures[messageId]={messageId,conversationId:action.conversationId,raw:choice.label,at:this.clock().toISOString(),timezone:this.timezone,focusDraftId:focus?.draftId??null,focusRevision:focus?.draftRevision??null,focus,choice:{questionId:question.id,choiceId:choice.id},status:'captured'};
   return {messageId,status:'captured'};
  });
  this.emit({type:'captured',messageId});return this.interpret(messageId);
 }
 async #needsAttention(messageId,error,{calls,modelRuns}){
  const result={messageId,status:'captured',error:userMessage(error),code:error.code??'INTERPRETATION_FAILED',calls,modelRuns};
  // Keep the retry state beside the durable raw capture. A failure receipt uses
  // one stable ID per capture and code, so repeated outages do not grow the ledger.
  try{await this.repository.transact(`interpret-failure:${messageId}${result.code===STALE_FOCUS?':focus':''}`,{messageId},current=>{const saved=intentState(current).captures[messageId];if(saved&&saved.status!=='interpreted')saved.lastError={message:result.error,code:result.code,at:this.clock().toISOString()};return result;});}catch{/* Raw capture was already committed; surface the original model error. */}
  this.emit({type:'needs-attention',...result});return result;
 }
 /** A plain day question answered from saved data: the card draws itself, so no model call is made. */
 async #answerLocally(messageId,units,card){
  const result=await this.repository.transact(`interpret:${messageId}`,{messageId},current=>{
   const saved=intentState(current).captures[messageId];
   if(saved.status==='interpreted')return {messageId,draftId:saved.draftId??null,status:'interpreted'};
   saved.status='interpreted';saved.draftId=null;saved.decisions=units.map(u=>({sourceId:u.id,disposition:'question',note:null}));saved.reply=null;saved.memoryCandidates=[];saved.card=card;saved.calls=0;saved.answeredLocally=true;delete saved.lastError;
   return {messageId,draftId:null,status:'interpreted',calls:0};
  });
  this.emit({type:'ready',...result});return {...result,modelRuns:[]};
 }
 act(action,{actionId}={}){return actOnDraft(this,action,{actionId});}
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
 undo(input){return undoCommitted(this,input);}
}

// Nothing said may vanish: a non-action unit the model left without a note shows in Dara's own words.
function withNotes(decisions,units){
 const text=new Map(units.map(u=>[u.id,u.text]));
 return decisions.map(d=>d.disposition==='action'||d.note?.trim()?d:{...d,note:(text.get(d.sourceId)??'').trim().replace(/[.,;]+$/,'').slice(0,140)||null});
}
