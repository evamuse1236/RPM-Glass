import {validateFollowUp} from './follow-up.mjs';
import {intentState} from './repository.mjs';
import {sourceUnits} from './context.mjs';
import {conversation} from './draft-actions.mjs';
import {quickAnswer} from './quick-answer.mjs';
import {inputSummary} from './input-summary.mjs';
import {focusFor,questionFor} from './conversation-focus.mjs';
import {prepareRead,readOutput,readKey} from './model-input.mjs';
import {shortHash} from './hash.mjs';

export const READ_TTL_MS=120000;
export const READ_LIMIT=4;

export function createPreviewReads({clock=()=>new Date(),ttlMs=READ_TTL_MS,limit=READ_LIMIT}={}){
 const reads=new Map();
 const get=key=>{const entry=reads.get(key);if(entry&&+clock()-entry.at<=ttlMs)return entry;reads.delete(key);return null;};
 return {
  get,
  put(key,entry){reads.delete(key);reads.set(key,entry);while(reads.size>limit)reads.delete(reads.keys().next().value);return entry;},
  drop(key,entry){if(reads.get(key)===entry)reads.delete(key);},
  holds:(key,entry)=>reads.get(key)===entry,
  async take(input){
   const key=readKey(input),entry=get(key);if(!entry)return null;
   reads.delete(key);
   const output=await entry.result.catch(()=>null);
   return output?{output,run:entry.run}:null;
  },
  get size(){return reads.size;},
 };
}

export async function previewRead(harness,{conversationId,text,focusDraftId=null},{signal}={}){
 if(typeof text!=='string'||!text.trim()||text.length>12000)return {status:'silent'};
 const data=await harness.repository.load(),v=intentState(data);conversation(data,conversationId);
 const messageId=`preview-${shortHash(text)}`,at=harness.clock().toISOString();
 const capture={messageId,conversationId,raw:text,at,timezone:harness.timezone};
 capture.focus=focusFor(v,{conversationId,messageId,focusDraftId});
 if(capture.focus||questionFor(v,capture)||quickAnswer(text,{now:new Date(at),timezone:harness.timezone}))return {status:'silent'};
 const units=sourceUnits(text);
 const {input,context,meta,local}=await prepareRead(data,capture,{activeDraft:null,question:null,units,snapshot:harness.snapshot});
 if(local)return {status:'local'};
 const route=harness.modelPolicy?.({input,attempt:0});
 if(!route||route.reason!=='capture'||JSON.stringify(input).length>45000)return {status:'silent'};
 if(signal?.aborted)return {status:'dropped'};
 const key=readKey(input);
 let entry=harness.reads.get(key),fresh=false;
 if(!entry){
  fresh=true;
  const controller=new AbortController(),run={...route,attempt:0,ms:null,ok:false,preview:true,input:inputSummary(input,meta)},started=Date.now();
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('Preview timed out'),{code:'TIMEOUT'}));},route.timeoutMs);});
  const result=Promise.race([harness.model(input,{signal:controller.signal,deadline:Date.now()+route.timeoutMs,route,run}),timeout])
   .then(output=>{run.ok=true;return output;},error=>{run.error=error.name==='AbortError'?'ABORTED':error.code??'INVALID_OUTPUT';harness.reads.drop(key,entry);throw error;})
   .finally(()=>{clearTimeout(timer);run.ms=Date.now()-started;});
  result.catch(()=>{});
  entry=harness.reads.put(key,{at:+harness.clock(),result,run,abort:()=>controller.abort()});
 }
 const own=entry;
 signal?.addEventListener('abort',()=>{if(harness.reads.holds(key,own)){harness.reads.drop(key,own);own.abort();}},{once:true});
 let output;
 try{output=await entry.result;}catch{return {status:'failed',run:fresh?entry.run:null};}
 if(signal?.aborted)return {status:'dropped',run:fresh?entry.run:null};
 try{
  const {parsed}=readOutput(output,{input,units,messageId,visibleEntities:context.entities,activeDraft:null});
  validateFollowUp(parsed,{input});
  harness.validateInterpretation?.(parsed,{input});
  const schedulePreview=harness.refreshSchedule?.({data,draft:{operations:parsed.operations,conversationId,raw:text},anchor:new Date(at)})??null;
  return {status:'read',parsed,schedulePreview,run:fresh?entry.run:null};
 }catch{return {status:'unread',run:fresh?entry.run:null};}
}
