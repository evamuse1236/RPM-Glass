import {PROMPT_VERSION} from '../intent-v2/prompts/capture-agent.mjs';
import {MODEL_POLICY_VERSION} from '../intent-v2/src/model-policy.mjs';

export const TRACE_KEY='rpm-capture-traces';
export const TRACE_LIMIT=100;
const MODEL_FIELDS=['model','effort','reason','attempt','ms','ok','error','escalated','fellBack','provider','servedModel','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','cost','requestId','service','serviceFallback','requestBytes','requestHash','input'];

/** One model call as the trace keeps it: routing, timing, outcome, usage and a word-free summary of its input. Never the prompt or an API key. */
export const modelRun=run=>Object.fromEntries(MODEL_FIELDS.filter(k=>run?.[k]!==undefined).map(k=>[k,run[k]]));

/** What the model read from the words: its mode, reply, card and each operation in compact form. */
export function interpretedSummary(capture,draft){
 if(!capture||capture.status!=='interpreted')return null;
 return {
  mode:draft?.mode??(capture.card?'query':'reflect'),reply:capture.reply??'',card:capture.card??null,
  operations:(draft?.operations??[]).map(op=>({kind:op.kind,entity:op.entity,targetId:op.targetId,fields:Object.fromEntries(op.fields.map(f=>[f.name,f.op==='set'?f.value:f.op]))})),
  heard:(capture.decisions??[]).map(d=>({disposition:d.disposition,note:d.note??null})),
 };
}

/**
 * The capture traces on this phone, newest first, in local storage that Capture and the planner's Settings share.
 * Every write is also sent through `emit`, which the runtime routes to the diagnostics upload.
 */
export function createTraceStore({storage=globalThis.localStorage,emit=()=>{},clock=()=>new Date(),limit=TRACE_LIMIT}={}){
 const read=()=>{try{const list=JSON.parse(storage?.getItem(TRACE_KEY)??'[]');return Array.isArray(list)?list:[];}catch{return [];}};
 const write=list=>{try{storage?.setItem(TRACE_KEY,JSON.stringify(list.slice(0,limit)));}catch{}};
 const publish=trace=>{try{emit(trace);}catch{}return trace;};
 function put(trace){
  const list=read().filter(t=>t.id!==trace.id);
  const next={v:1,promptVersion:PROMPT_VERSION,policyVersion:MODEL_POLICY_VERSION,outcome:null,likelyMistake:false,edits:[],...trace};
  write([next,...list]);return publish(next);
 }
 function update(id,patch){
  const list=read(),i=list.findIndex(t=>t.id===id);
  if(i<0)return null;
  list[i]={...list[i],...(typeof patch==='function'?patch(list[i]):patch)};
  write(list);return publish(list[i]);
 }
 /** Keep, Undo or a hand edit. An Undo marks the capture as a likely mistake for review. */
 function outcome(id,kind,detail={}){
  const at=clock().toISOString();
  return update(id,t=>({outcome:kind,outcomeAt:at,likelyMistake:t.likelyMistake||kind==='undone',...(Object.keys(detail).length?{outcomeDetail:detail}:{})}));
 }
 /** A task a capture added or changed, edited later by hand in the planner. */
 function handEdit(entryId,{what='edited'}={}){
  if(entryId==null)return null;
  const trace=read().find(t=>t.outcome!=='undone'&&(t.applied?.entryIds??[]).map(String).includes(String(entryId)));
  if(!trace)return null;
  const at=clock().toISOString();
  return update(trace.id,t=>({outcome:t.outcome==='kept'||!t.outcome?'edited':t.outcome,outcomeAt:at,edits:[...(t.edits??[]),{entryId,what,at}].slice(-10)}));
 }
 return {list:read,get:id=>read().find(t=>t.id===id)??null,put,update,outcome,handEdit};
}
