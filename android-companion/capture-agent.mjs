import {intentState} from '../intent-v2/src/repository.mjs';
import {draftFollowUpProblem} from '../intent-v2/src/follow-up.mjs';
import {openQuestion} from '../intent-v2/src/conversation-focus.mjs';
import {beforeRows,needsConfirm} from './capture-receipt.mjs';
import {modelRun,interpretedSummary} from './capture-trace.mjs';
import {userMessage} from './user-message.mjs';

const ms=(from,clock)=>Math.max(0,+clock()-+from);
const failure=(stage,error)=>({stage,code:error?.code??null,message:userMessage(error)});

/**
 * Capture acts, then confirms: the words are saved first, the model reads them, and whatever it proposes applies
 * straight away. New items get a receipt with Undo; changes to saved items also apply, then wait for Keep or Undo.
 * A draft that still needs an answer (an AM/PM, a time that couldn't be read) waits for it. Every capture leaves one trace.
 */
export function createCaptureAgent({service,traces,clock=()=>new Date()}){
 const {repository}=service;
 const draftOf=async id=>intentState(await repository.load()).drafts[id]??null;

 /** Commit a ready draft. A schedule clash is applied too and kept on the receipt as a warning. */
 async function apply(draftId){
  const data=await repository.load(),state=intentState(data),draft=state.drafts[draftId];
  if(!draft||draft.status!=='draft')return {status:draft?.status==='committed'?'applied':'skipped'};
  if(openQuestion(state,draft.conversationId)||draft.question||draft.operations.some(op=>op.fields.some(f=>f.op==='unknown')))return {status:'needs-answer'};
  if(draft.schedulePreview?.items?.some(i=>i.status==='review'))return {status:'needs-time'};
  if(draftFollowUpProblem(data,draft))return {status:'needs-check'};
  const before=beforeRows(data,draft),confirm=needsConfirm(draft);
  const commit=d=>service.act({conversationId:d.conversationId,draftId,revision:d.revision,kind:'commit',...(d.review?{reviewToken:d.review.token}:{})},{actionId:`auto-${draftId}-${d.revision}`});
  let result=await commit(draft),warning=null;
  if(result.status==='review'){const held=await draftOf(draftId);warning=held.review?.question??null;result=await commit(held);}
  if(result.status!=='committed')return {status:'skipped'};
  const unapplied=draft.sourceMessageIds.flatMap(id=>intentState(data).captures[id]?.unapplied??[]);
  if(unapplied.length)warning=[warning,...unapplied.map(x=>`${x.title}: ${x.field} was not applied. ${x.reason} Your original words are saved.`)].filter(Boolean).join(' ');
  const applied={at:clock().toISOString(),auto:true,needsConfirm:confirm,warning,before};
  const nextStep=await service.help?.(draftId).catch(()=>null);
  await repository.transact(`applied:${draftId}`,{draftId},current=>{const d=intentState(current).drafts[draftId];if(d){d.applied=applied;d.confirm=confirm?'pending':null;if(nextStep)d.nextStep=nextStep;}return {status:'applied'};});
  const receipt=result.receipt??(await draftOf(draftId))?.receipt;
  return {status:'applied',needsConfirm:confirm,warning,undoId:receipt?.undoId??null,entryIds:receipt?.entryIds??[],changes:(receipt?.changes??[]).map(({type,collection,id,title})=>({type,collection,id,title}))};
 }

 async function settle(messageId,result,{started,error=null}){
  const data=await repository.load().catch(()=>null),capture=data?intentState(data).captures[messageId]:null;
  let applied=null;const errors=[];
  if(error)errors.push(failure('save',error));
  if(result?.error)errors.push({stage:'interpret',code:result.code??null,message:result.error});
  if(result?.draftId){try{applied=await apply(result.draftId);}catch(e){applied={status:'failed'};errors.push(failure('apply',e));}}
  const draft=capture?.draftId?intentState(await repository.load()).drafts[capture.draftId]:null;
  const status=applied?.status??(error?'not-saved':result?.status==='interpreted'?(capture?.card||capture?.reply?'answered':'nothing'):'words-kept');
  const previous=traces.get(messageId);
  const trace={id:messageId,at:capture?.at??clock().toISOString(),conversationId:capture?.conversationId??null,words:capture?.raw??null,
   attempts:(previous?.attempts??0)+1,latencyMs:ms(started,clock),
   models:[...(previous?.models??[]),...(result?.modelRuns??(previous?[]:capture?.modelRuns??[])).map(modelRun)].slice(-8),
   localInterpretation:capture?.localInterpretation??null,timeInferences:capture?.timeInferences??[],
   interpreted:interpretedSummary(capture,draft),applied:{status,draftId:capture?.draftId??null,...(applied?.status==='applied'?applied:{})},
   errors:[...(previous?.errors??[]),...errors].slice(-8)};
  traces.put({...previous,...trace});
  return applied;
 }

 async function capture(input){
  const started=clock();let result=null;
  try{result=await service.capture(input);}
  catch(error){
   const saved=!!intentState(await repository.load().catch(()=>({}))).captures?.[input.messageId];
   if(saved)traces.put({id:input.messageId,at:started.toISOString(),words:input.text,attempts:1,latencyMs:ms(started,clock),models:[],interpreted:null,applied:{status:'words-kept'},errors:[failure('interpret',error)]});
   throw error;
  }
  return {...result,applied:await settle(input.messageId,result,{started})};
 }
 async function retry(messageId){
  const started=clock(),result=await service.retry(messageId);
  return {...result,applied:await settle(messageId,result,{started})};
 }
 /** A choice chip: its words are saved as a capture, read against the open question, then applied like any capture. */
 async function choose(action,{actionId}){
  const started=clock(),result=await service.choose(action,{actionId});
  return {...result,applied:await settle(actionId,result,{started})};
 }
 /** An answer chip, a field edit or Dara's own "Add anyway": acted on, then applied when nothing else is open. */
 async function act(action,{actionId}){
  if(action.kind==='next-step'){
   const started=clock(),result=await service.nextStep(action,{actionId});
   return {...result,applied:await settle(actionId,result,{started})};
  }
  const result=await service.act(action,{actionId});
  const draft=await draftOf(action.draftId),messageId=draft?.sourceMessageIds?.at(-1);
  if(draft?.status==='draft'&&messageId)await settle(messageId,{status:'interpreted',draftId:draft.id,modelRuns:[]},{started:clock()});
  else if(draft?.status==='committed'&&messageId)traces.update(messageId,{applied:{...traces.get(messageId)?.applied,status:'applied',by:'user'}});
  return result;
 }
 async function confirm({draftId,conversationId,actionId}){
  const result=await repository.transact(`keep:${actionId}`,{draftId,conversationId},data=>{
   const d=intentState(data).drafts[draftId];
   if(!d||d.conversationId!==conversationId||d.status!=='committed')throw new Error('This change was already undone or replaced.');
   d.confirm='kept';d.keptAt=clock().toISOString();return {status:'kept',draftId};
  });
  const d=await draftOf(draftId);if(d)traces.outcome(d.sourceMessageIds.at(-1),'kept');
  return result;
 }
 async function undo(input){
  const result=await service.undo(input);
  const d=await draftOf(input.draftId);if(d)traces.outcome(d.sourceMessageIds.at(-1),'undone',{confirm:d.confirm??null});
  return result;
 }
 return {capture,retry,choose,act,confirm,undo,apply};
}
