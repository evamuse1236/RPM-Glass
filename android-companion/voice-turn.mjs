import {editPlan,planner} from './planner-state.mjs';
import {withIds} from './new-id.mjs';
import {toolOps,planView} from './voice-tools.mjs';
import {intentState} from '../intent-v2/src/repository.mjs';
import {userMessage} from './user-message.mjs';
import {voiceMark,holdStage} from './voice-marks.mjs';

export const MAX_RAMBLE_OPS=60;

/**
 * One ramble: from the press of the mic to the model's spoken answer.
 * `receive` takes each Gemini Live server message (audio already stripped or ignored) and returns the
 * client messages to send back. Tool calls run at once on a working copy, so answers carry real ids.
 * Phases: listening → working (after stop) → speaking (model talks after its tools) → done | failed.
 */
export function createRamble({data,timeZone,now=()=>new Date()}){
 let working=structuredClone(data);
 const records=[],errors=[],added=new Map();
 let heard='',said='',phase='listening',toolsPending=false,error=null,answered=false,firstTool=true;
 const all=key=>records.flatMap(r=>r[key]);
 const changes=()=>records.map(r=>r.change);
 const created=()=>records.filter(r=>r.created!=null).map(r=>r.created);
 const run=(r,uuids=[])=>{
  const {result,ids}=withIds(uuids,()=>{let out=null;for(const op of r.ops)out=editPlan(working,op,now())??out;return out;});
  r.uuids=ids;return result;
 };
 const sameAdd=c=>c.name==='save_task'&&c.args?.id==null&&typeof c.args?.title==='string'
  ?JSON.stringify({...c.args,title:c.args.title.trim().toLowerCase()},Object.keys(c.args).sort()):null;
 const call=c=>{
  if(c.name==='get_plan')return planView(working,timeZone);
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
 /** Drops the named calls' changes and replays the rest on a fresh copy with the same new ids. */
 const cancel=ids=>{
  const drop=new Set(ids);
  if(!records.some(r=>drop.has(r.id)))return;
  const kept=records.filter(r=>!drop.has(r.id));
  for(const r of records)if(drop.has(r.id)&&r.key)added.delete(r.key);
  working=structuredClone(data);records.length=0;
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
   if(m?.toolCall&&!['done','failed'].includes(phase)){
    if(firstTool){firstTool=false;holdStage('T7');voiceMark('T7');}
    if(m.toolCall.functionCalls.some(c=>c.name!=='get_plan'))voiceMark('Tsave');
    toolsPending=true;
    const functionResponses=m.toolCall.functionCalls.map(c=>{
     let result;try{result=call(c);}catch(e){const text=userMessage(e);errors.push(`${c.name}: ${text}`);result={error:text};}
     return {id:c.id,name:c.name,response:{result}};
    });
    out.push({toolResponse:{functionResponses}});
   }else if(sc?.turnComplete&&phase!=='listening'){
    if(toolsPending)toolsPending=false;else if(phase!=='failed')phase='done';
   }
   return out;
  },
  result(){const ops=all('ops');return {heard:heard.trim(),said:said.trim(),changes:changes(),errors:[...errors],batch:ops.length?{type:'batch',ops:structuredClone(ops)}:null,uuids:all('uuids'),created:created(),failed:phase==='failed'?error??'Voice stopped.':null};},
 };
}

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
 if(!ramble.heard&&!ramble.batch)return {status:'nothing'};
 const {messageId,now=new Date()}=options;
 recordWords(data,ramble.heard,options);
 const words=intentState(data).captures[messageId]??=wordsRecord('',options);
 const keep=message=>{words.lastError={message};return {status:'words-kept',error:message};};
 if(ramble.failed&&!ramble.batch)return keep(ramble.failed);
 if(ramble.batch){
  const next=structuredClone(data),before=taskIds(next);
  try{withIds(ramble.uuids,()=>editPlan(next,ramble.batch,now));}catch(e){return keep(userMessage(e));}
  const made=[...taskIds(next)].filter(id=>!before.has(id));
  if(made.length!==ramble.created.length||made.some(id=>!ramble.created.includes(id)))return keep('Your plan changed while you talked. Your words are saved.');
  Object.assign(data,next);
 }
 const capture=intentState(data).captures[messageId];
 delete capture.lastError;
 Object.assign(capture,{status:'interpreted',draftId:null,reply:ramble.said||null,voice:{changes:ramble.changes,undoEvent:ramble.batch?planner(data).events.at(-1)?.id??null:null,undone:false}});
 return {status:ramble.batch?'applied':'nothing',undo:!!ramble.batch};
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
