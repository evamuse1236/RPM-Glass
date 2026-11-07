import {editPlan,planner} from './planner-state.mjs';
import {withIds} from './new-id.mjs';
import {toolOps,planView,checkAsked,LIVE_MODEL} from './voice-tools.mjs';
import {voiceRows,receiptText} from './capture-voice-rows.mjs';
import {intentState} from '../intent-v2/src/repository.mjs';
import {userMessage} from './user-message.mjs';
import {voiceMark,holdStage} from './voice-marks.mjs';
import {secretKey,redactText} from './diagnostics.mjs';
import {TELEGRAM_TOOL_NAMES} from './voice-telegram.mjs';

export const MAX_RAMBLE_OPS=60;
const TRACE_CALLS=20,TRACE_TEXT=200;
const traced=(v,depth=0)=>typeof v==='string'?redactText(v.length>TRACE_TEXT?v.slice(0,TRACE_TEXT)+'…':v):v===null||typeof v!=='object'?v:depth>3?'…':Array.isArray(v)?v.slice(0,TRACE_CALLS).map(x=>traced(x,depth+1)):Object.fromEntries(Object.entries(v).filter(([k])=>!secretKey.test(k)).map(([k,x])=>[k,traced(x,depth+1)]));

/**
 * One ramble: from the press of the mic to the model's spoken answer.
 * `receive` takes each Gemini Live server message (audio already stripped or ignored) and returns the
 * client messages to send back. Tool calls run at once on a working copy, so answers carry real ids.
 * Phases: listening → working (after stop) → speaking (model talks after its tools) → done | failed.
 */
/**
 * undoSaved: undo_last may take back the previous saved ramble (the phone's open line saves each one).
 * telegram: the call's Telegram link (voice-telegram.mjs). Its tools answer later, so their toolResponse is a Promise.
 */
export function createRamble({data,timeZone,now=()=>new Date(),undoSaved=false,telegram=null}){
 const base=undoes=>{const copy=structuredClone(data);if(undoes)editPlan(copy,{type:'undo'},now());return copy;};
 let working=base(null);
 const records=[],errors=[],calls=[],added=new Map();
 const note=entry=>{calls.push({name:entry.name,args:traced(entry.args??{}),...entry.out});if(calls.length>TRACE_CALLS)calls.shift();};
 const undoneRamble=()=>records.find(r=>r.undoes)?.undoes??null;
 let heard='',said='',phase='listening',toolsPending=false,error=null,answered=false,firstTool=true;
 const ramble={};
 const all=key=>records.flatMap(r=>r[key]);
 const changes=()=>records.map(r=>r.change);
 const created=()=>records.filter(r=>r.created!=null).map(r=>r.created);
 const run=(r,uuids=[])=>{
  const {result,ids}=withIds(uuids,()=>{let out=null;for(const op of r.ops)out=editPlan(working,op,now())??out;return out;});
  r.uuids=ids;return result;
 };
 const sameAdd=c=>c.name==='save_task'&&c.args?.id==null&&typeof c.args?.title==='string'
  ?JSON.stringify({...c.args,title:c.args.title.trim().toLowerCase()},Object.keys(c.args).sort()):null;
 /** Undo inside this ramble drops its last change; otherwise it takes back the previous ramble while that is still the newest change. */
 const undoLast=c=>{
  const last=records.filter(r=>r.ops.length).at(-1);
  if(last){cancel([last.id]);return {undone:last.change.title};}
  if(!undoSaved)throw new Error('Nothing to undo in this answer. Use the Undo button for an earlier one.');
  if(undoneRamble())throw new Error('Your last change is already undone.');
  const prev=Object.entries(intentState(data).captures).find(([,x])=>rambleUndoable(data,x?.voice));
  if(!prev)throw new Error('There is no voice change to undo. Say what to change instead.');
  const [messageId,capture]=prev,title=capture.voice.changes.map(x=>x.title).join(', ');
  working=base(messageId);
  records.push({id:c.id,key:null,ops:[],uuids:[],change:{kind:'undo',entity:'change',id:null,title},created:null,undoes:messageId});
  return {undone:title};
 };
 const call=c=>{
  if(c.name==='get_plan')return planView(working,timeZone);
  if(c.name==='undo_last')return undoLast(c);
  checkAsked(c.name,c.args??{},heard);
  const key=sameAdd(c);
  if(key&&added.has(key))return added.get(key);
  const {ops:next,change}=toolOps(working,c.name,c.args??{},now());
  if(all('ops').length+next.length>MAX_RAMBLE_OPS)throw new Error('That is too many changes for one go. Save these, and say the rest next time.');
  const r={id:c.id,key,ops:next,uuids:[],change,created:null};
  const result=run(r);
  if(change.kind==='add'&&change.entity==='task'){change.id=result;r.created=result;}
  else if(change.id==null&&change.kind==='add')change.id=result;
  records.push(r);
  if(key)added.set(key,{saved:result});
  return {saved:result};
 };
 const dropped=new Set();
 /** A Telegram tool: drafts, sends after a yes, or reads. A read is traced by its counts only, never its messages. */
 const telegramCall=async c=>{
  if(!telegram)throw new Error('Telegram is not connected on this phone.');
  const result=await telegram.run(c.name,c.args??{},{heard,request:ramble});
  if(result?.sent)records.push({id:c.id,key:null,ops:[],uuids:[],change:{kind:'send',entity:'telegram',id:null,title:result.sent.text,to:result.sent.to},created:null});
  note({...c,out:{result:c.name==='read_telegram'?readCounts(result):traced(result)}});
  return result;
 };
 /** Drops the named calls' changes and replays the rest on a fresh copy with the same new ids. */
 const cancel=ids=>{
  const drop=new Set(ids);
  if(!records.some(r=>drop.has(r.id)))return;
  const kept=records.filter(r=>!drop.has(r.id)||r.change.kind==='send');
  for(const r of records)if(drop.has(r.id)&&r.key)added.delete(r.key);
  working=base(kept.find(r=>r.undoes)?.undoes??null);records.length=0;
  for(const r of kept){
   const result=run(r,r.uuids);
   if(r.created!=null){r.created=result;r.change.id=result;if(r.key)added.set(r.key,{saved:result});}
   records.push(r);
  }
 };
 return {
  /** wordsReady: the model has started answering, so the transcript of what was heard is complete. */
  get state(){return {phase,heard:heard.trim(),said:said.trim(),changes:changes(),errors:[...errors],error,wordsReady:answered||phase==='done'||phase==='failed'};},
  stop(){if(phase==='listening')phase='working';},
  fail(reason){if(phase!=='done'){phase='failed';error=String(reason);}},
  cancel,
  receive(m){
   const out=[],sc=m?.serverContent;
   if(sc?.inputTranscription?.text)heard+=sc.inputTranscription.text;
   if(sc?.outputTranscription?.text)said+=sc.outputTranscription.text;
   if(m?.toolCallCancellation)cancel(m.toolCallCancellation.ids??[]);
   if(phase!=='listening'&&(m?.toolCall||(sc?.modelTurn?.parts??[]).length))answered=true;
   if(phase==='working'&&!toolsPending&&(sc?.modelTurn?.parts??[]).length)phase='speaking';
   if(m?.toolCallCancellation)for(const id of m.toolCallCancellation.ids??[])dropped.add(id);
   if(m?.toolCall&&!['done','failed'].includes(phase)){
    if(firstTool){firstTool=false;holdStage('T7');voiceMark('T7');}
    if(m.toolCall.functionCalls.some(c=>c.name!=='get_plan'))voiceMark('Tsave');
    toolsPending=true;
    const failed=(c,e)=>{const text=userMessage(e);errors.push(`${c.name}: ${text}`);note({...c,out:{error:traced(text)}});return {error:text};};
    const answer=(c,result)=>({id:c.id,name:c.name,response:{result}});
    const functionResponses=m.toolCall.functionCalls.map(c=>{
     if(TELEGRAM_TOOL_NAMES.has(c.name))return telegramCall(c).then(result=>answer(c,result),e=>answer(c,failed(c,e)));
     let result;try{result=call(c);note({...c,out:{result:c.name==='get_plan'?'plan':traced(result)}});}catch(e){result=failed(c,e);}
     return answer(c,result);
    });
    if(functionResponses.some(r=>r instanceof Promise))out.push(Promise.all(functionResponses).then(all=>{
     const live=all.filter(r=>!dropped.has(r.id));
     return live.length?{toolResponse:{functionResponses:live}}:null;
    }));
    else out.push({toolResponse:{functionResponses}});
   }else if(sc?.turnComplete&&phase!=='listening'){
    if(toolsPending)toolsPending=false;else if(phase!=='failed')phase='done';
   }
   return out;
  },
  result(){const ops=all('ops');return {heard:heard.trim(),said:said.trim(),changes:changes(),errors:[...errors],calls:structuredClone(calls),undoes:undoneRamble(),batch:ops.length?{type:'batch',ops:structuredClone(ops)}:null,uuids:all('uuids'),created:created(),failed:phase==='failed'?error??'Voice stopped.':null};},
 };
}

const readCounts=r=>({telegram:'read',chats:r?.chats?.length??(r?.chat?1:0),messages:r?.messages?.length??(r?.chats??[]).reduce((n,c)=>n+(c.messages?.length??0),0)});
const taskIds=data=>new Set(data.entries.map(e=>e.id));
const wordsRecord=(heard,{messageId,conversationId=null,timeZone,now=new Date()})=>({messageId,conversationId,raw:heard,at:now.toISOString(),timezone:timeZone,focusDraftId:null,focusRevision:null,focus:null,source:'voice',status:'captured'});

/** Saves what was heard into Capture's journal before any change, so the words survive a crash or a dropped call. */
export function recordWords(data,heard,options){
 if(!heard)return false;
 const captures=intentState(data).captures;
 if(captures[options.messageId]?.raw===heard)return false;
 captures[options.messageId]={...captures[options.messageId],...wordsRecord(heard,options)};return true;
}

/**
 * Saves a finished ramble into `data` (mutated): its words, then its changes as one batch with one Undo.
 * The words stay when the changes cannot be applied; Capture's Retry reads them as text.
 * A replay on newer data must give new tasks the ids the model was told, or nothing is applied.
 */
export function applyRamble(data,ramble,options){
 if(!ramble.heard&&!ramble.batch&&!ramble.undoes)return {status:'nothing'};
 const {messageId,now=new Date()}=options;
 recordWords(data,ramble.heard,options);
 const words=intentState(data).captures[messageId]??=wordsRecord('',options);
 const keep=message=>{words.lastError=ramble.calls?.length?{message,calls:ramble.calls,reply:ramble.said||null}:{message};return {status:'words-kept',error:message};};
 if(ramble.failed&&!ramble.batch&&!ramble.undoes)return keep(ramble.failed);
 if(ramble.batch||ramble.undoes){
  const next=structuredClone(data),before=taskIds(next);
  if(ramble.undoes){
   if(!rambleUndoable(next,intentState(next).captures[ramble.undoes]?.voice))return keep('You changed the plan after that. Undo it in the planner.');
   editPlan(next,{type:'undo'},now);intentState(next).captures[ramble.undoes].voice.undone=true;
  }
  if(ramble.batch)try{withIds(ramble.uuids,()=>editPlan(next,ramble.batch,now));}catch(e){return keep(userMessage(e));}
  const made=[...taskIds(next)].filter(id=>!before.has(id));
  if(made.length!==ramble.created.length||made.some(id=>!ramble.created.includes(id)))return keep('Your plan changed while you talked. Your words are saved.');
  Object.assign(data,next);
 }
 const capture=intentState(data).captures[messageId];
 delete capture.lastError;
 Object.assign(capture,{status:'interpreted',draftId:null,reply:ramble.said||null,taskIds:rambleTaskIds(ramble),
  receipt:voiceRows(data,ramble.changes,now).map(line=>({text:receiptText(line)})),voice:{changes:ramble.changes,calls:ramble.calls??[],undoEvent:ramble.batch?planner(data).events.at(-1)?.id??null:null,undone:false}});
 return {status:ramble.batch||ramble.undoes?'applied':'nothing',undo:!!ramble.batch};
}

/** The saved tasks a ramble added or changed, in order, once each. */
export const rambleTaskIds=ramble=>[...new Set((ramble.changes??[]).filter(c=>c.entity==='task'&&Number.isInteger(c.id)).map(c=>c.id))];

/**
 * One voice request as a capture trace: the words, RPM's reply, each tool call, what applied and the tasks it touched.
 * `outcome` is applyRamble's answer; `saveError` is why the save itself failed.
 */
export function rambleTrace(ramble,outcome,{messageId,at,saveError=null}){
 const status=saveError?'not-saved':outcome?.status??'nothing';
 return {id:messageId,kind:'voice',at:at.toISOString(),words:ramble.heard,reply:ramble.said||null,promptVersion:`voice ${LIVE_MODEL}`,policyVersion:null,
  calls:ramble.calls??[],changes:(ramble.changes??[]).map(({kind,entity,id,title})=>({kind,entity,id,title})),
  applied:{status,entryIds:status==='applied'?rambleTaskIds(ramble):[],undoes:ramble.undoes??null},
  errors:[...(ramble.errors??[]).map(message=>({stage:'tool',message})),...(ramble.failed?[{stage:'voice',message:ramble.failed}]:[]),
   ...(outcome?.error?[{stage:'apply',message:outcome.error}]:[]),...(saveError?[{stage:'save',message:saveError}]:[])],
  models:[{model:LIVE_MODEL,service:'gemini'}]};
}

/** A ramble can be undone only while its batch is still the newest planner change. */
export const rambleUndoable=(data,voice)=>!!(voice?.undoEvent&&!voice.undone&&planner(data).undo&&planner(data).events.at(-1)?.id===voice.undoEvent);

/** Undoes a saved ramble only while it is still the newest planner change; otherwise nothing changes. */
export function undoRamble(data,messageId,now=new Date()){
 const voice=intentState(data).captures[messageId]?.voice;
 if(!voice?.undoEvent||voice.undone)throw new Error('This ramble has nothing to undo.');
 if(!rambleUndoable(data,voice))throw new Error('You changed the plan after this ramble. Undo those changes in the planner.');
 editPlan(data,{type:'undo'},now);
 intentState(data).captures[messageId].voice.undone=true;
}
