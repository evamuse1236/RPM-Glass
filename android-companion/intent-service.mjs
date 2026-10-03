import {draftFollowUpProblem,FOLLOW_UP_NOTICE} from '../intent-v2/src/follow-up.mjs';
import {validateIntentTimes} from './intent-time-guard.mjs';
import {LUNA_MODEL,intentModelPolicy,captureReply} from '../intent-v2/src/model-policy.mjs';
import {IntentHarness} from '../intent-v2/src/harness.mjs';
import {createRepository,intentState} from '../intent-v2/src/repository.mjs';
import {createRpmPlanAdapter} from '../intent-v2/adapters/rpm-glass.mjs';
import {nativeModelTransport} from '../intent-v2/adapters/transport.mjs';
import {draftActions} from '../intent-v2/src/suggestions.mjs';
import {createSortPreview,dismissSortPreview,acceptSortPreview} from '../intent-v2/src/sort-preview.mjs';
import {findEntity} from '../intent-v2/src/context.mjs';
import {intentSystemPrompt} from '../intent-v2/prompts/intent-system.mjs';
import {formatTime} from '../cli/interpret.mjs';
import {resolvePlannerTime} from './planner-tools.mjs';

const ACTIVE_DRAFTS=new Set(['draft','review']);
export const INTENT_LIMITS=Object.freeze({outstandingCaptures:100,activeDrafts:100,sortPreviews:100,rawBytes:4*1024*1024});
const validId=(value,label='ID')=>{if(typeof value!=='string'||!value||value.length>160||!/^[A-Za-z0-9:_-]+$/.test(value))throw new Error(`${label} must be a stable local ID`);return value;};
const at=(value)=>Number.isFinite(Date.parse(value??''))?Date.parse(value):0;

function ensureIntent(data){const state=intentState(data);state.sortPreviews??={};return state;}
function storageUse(state){
 const captures=Object.values(state.captures??{}),drafts=Object.values(state.drafts??{}),sorts=Object.values(state.sortPreviews??{});
 return {captures:captures.length,outstandingCaptures:captures.filter(c=>c.status==='captured').length,activeDrafts:drafts.filter(d=>ACTIVE_DRAFTS.has(d.status)).length,sortPreviews:sorts.filter(p=>p.status==='preview').length,rawBytes:captures.reduce((n,c)=>n+new TextEncoder().encode(c.raw??'').length,0)};
}
function assertCaptureCapacity(data,text){const state=ensureIntent(data),use=storageUse(state),bytes=new TextEncoder().encode(text).length;if(use.outstandingCaptures>=INTENT_LIMITS.outstandingCaptures)throw new Error('Review or retry an earlier captured thought before adding more.');if(use.activeDrafts>=INTENT_LIMITS.activeDrafts)throw new Error('Review or leave an earlier draft before adding more.');if(use.rawBytes+bytes>INTENT_LIMITS.rawBytes)throw new Error('Captured thoughts have reached the pilot storage limit. Export a backup before clearing history.');}
export function refreshSchedulePreview({data,draft,anchor=new Date()}={}){
 const atDate=new Date(anchor);if(!Number.isFinite(+atDate))throw new Error('A valid refresh instant is required');const items=[];
 for(const op of draft?.operations??[])for(const field of op.fields??[])if(field.name==='time'&&field.op==='set'){
  const title=op.fields.find(f=>f.name==='title'&&f.op==='set')?.value??(op.targetId==null?op.entity:findEntity(data,op.entity,op.targetId)?.title??op.entity);
  const proof=field.evidence?.trim()||String(field.value),original=draft.raw??draft.sourceMessageIds?.map(id=>data.intentV2?.captures?.[id]?.raw??'').join('\n')??proof,id=op.kind==='create'?null:Number(op.targetId),minutes=op.fields.find(f=>f.name==='minutes'&&f.op==='set')?.value;
  const resolved=resolvePlannerTime(data,{id,title,time:field.value,minutes,evidence:[proof]},{raw:original+'\n'+proof,conversationId:draft.conversationId,now:atDate});
  if(resolved.status==='review'){items.push({opId:op.opId,title,source:field.value,status:'review',planned:null,plannedDate:null,end:null,minutes:null,label:null,reason:resolved.question,assumptions:[]});continue;}
  const label=resolved.planned?formatTime(resolved.planned)+(resolved.end?` → ${formatTime(resolved.end)} · ${resolved.minutes} min`:''):resolved.plannedDate?`${resolved.plannedDate} · time not set`:null;
  items.push({opId:op.opId,title,source:field.value,status:resolved.status,planned:resolved.planned,plannedDate:resolved.plannedDate,end:resolved.end,minutes:resolved.minutes,label,reason:null,assumptions:resolved.assumptions});
 }
 return {anchorAt:atDate.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items};
}
function projectDraft(data,draft,now){if(!draft)return null;const validationNotice=draftFollowUpProblem(data,draft)?FOLLOW_UP_NOTICE:null;const raw=structuredClone(draft.operations),byId=new Map(raw.map(op=>[op.opId,op])),links={blockId:['block','RPM block'],projectId:['project','Project'],goalId:['goal','Goal'],areaId:['area','Life area']};const target=op=>op.targetId===null?null:findEntity(data,op.entity,op.targetId);
 // An update shows what it changes from, so the saved task's current day, time and Block travel with it.
 const operations=raw.map(op=>({...op,targetTitle:target(op)?.title??null,...(op.entity==='task'&&target(op)?{targetBefore:{planned:target(op).planned??null,plannedDate:target(op).plannedDate??null,blockId:target(op).blockId??null,done:!!target(op).done}}:{}),fields:op.fields.map(field=>{const link=links[field.name];if(!link||field.op!=='set')return field;const value=String(field.value),created=value.startsWith('$')?byId.get(value.slice(1)):null,title=created?.fields.find(f=>f.name==='title'&&f.op==='set')?.value??findEntity(data,link[0],field.value)?.title??null;return {...field,displayLabel:link[1],displayValue:title??'Unavailable link'};})}));return {id:draft.id,conversationId:draft.conversationId,revision:draft.revision,status:draft.status,mode:draft.mode??'capture',created:draft.created,updated:draft.updated,reply:draft.reply??'',question:draft.question??null,review:draft.review??null,timeAnchorAt:draft.timeAnchorAt??null,schedulePreview:structuredClone(draft.schedulePreview??null),operations,receipt:structuredClone(draft.receipt??null),skipped:draft.skipped??[],validationNotice,actions:draftActions(draft,{now}).filter(a=>!validationNotice||a.action.kind!=='commit')};}
/** What was heard but not proposed ("Also heard"): each non-action unit's note, and the Inbox task it became if Dara kept it. */
function captureNotes(data,capture){
 return (capture.decisions??[]).filter(d=>d.disposition!=='action'&&typeof d.note==='string'&&d.note.trim()).map(d=>{
  const id=capture.keptNotes?.[d.sourceId]??null,task=id==null?null:(data.entries??[]).find(e=>e.id===id&&!e.archived);
  return {sourceId:d.sourceId,disposition:d.disposition,note:d.note.trim(),keptTaskId:task?id:null};
 });
}
function projectCapture(data,state,capture,now){const draft=capture.draftId?state.drafts[capture.draftId]:null;return {messageId:capture.messageId,conversationId:capture.conversationId,raw:capture.raw,at:capture.at,status:capture.status,reply:draft?.reply??capture.reply??'',lastError:capture.lastError??null,draft:projectDraft(data,draft,now),notes:captureNotes(data,capture),memoryCandidates:structuredClone(capture.memoryCandidates??[])};}
export function intentViewFromData(data,{conversationId=null,offset=0,limit=20,now=new Date()}={}){const state=ensureIntent(data),all=Object.values(state.captures).filter(c=>!conversationId||c.conversationId===conversationId).sort((a,b)=>at(b.at)-at(a.at)),start=Number.isInteger(offset)&&offset>=0?offset:0,count=Number.isInteger(limit)&&limit>=0?Math.min(limit,100):20,captures=all.slice(start,start+count);return {captures:captures.map(c=>projectCapture(data,state,c,now)),totalCaptures:all.length,hasMore:start+captures.length<all.length,nextOffset:start+captures.length,storage:{...storageUse(state),limits:INTENT_LIMITS}};}

/**
 * Production integration around RPM's canonical store. The supplied backend must
 * compare-and-swap `save(expectedVersion,nextData)` and share the runtime's owner.
 */
export function createIntentService({backend,native,model,changePlanner,undo,readCalendar,editPlan,onEvent=()=>{},clock=()=>new Date(),timezone=Intl.DateTimeFormat().resolvedOptions().timeZone}={}){
 if(!backend||typeof backend.load!=='function'||typeof backend.save!=='function')throw new Error('A shared versioned backend is required');
 if(typeof changePlanner!=='function'||typeof undo!=='function'||typeof readCalendar!=='function'||typeof editPlan!=='function')throw new Error('Inject RPM planner, Undo, calendar and editor contracts');
 const repository=createRepository(backend);
 const adapter=createRpmPlanAdapter({changePlanner,undo,readCalendar});
 const interpret=model??nativeModelTransport({native,model:LUNA_MODEL,prompt:intentSystemPrompt,providerNames:['OpenAI'],effort:'none'});
 const harness=new IntentHarness({repository,...adapter,model:interpret,modelPolicy:intentModelPolicy,normalizeReply:captureReply,validateInterpretation:validateIntentTimes,refreshSchedule:args=>({...refreshSchedulePreview(args),timezone}),onEvent,clock,timezone});

 async function view({conversationId=null,offset=0,limit=20}={}){
  return intentViewFromData(await repository.load(),{conversationId,offset,limit,now:clock()});
 }
 async function capture(input){
  validId(input?.messageId,'Message ID');validId(input?.conversationId,'Conversation ID');
  // Capacity is checked without writing; the harness transaction revalidates all
  // identity and conversation invariants and writes the raw source before AI work.
  const before=await repository.load();if(!ensureIntent(before).captures[input.messageId])assertCaptureCapacity(before,input.text);
  const result=await harness.capture(input);return {...result,intent:await view({conversationId:input.conversationId})};
 }
 async function retry(messageId){validId(messageId,'Message ID');const before=await repository.load(),capture=ensureIntent(before).captures[messageId];if(!capture)throw new Error('Captured thought not found');const result=await harness.interpret(messageId);return {...result,intent:await view({conversationId:capture.conversationId})};}
 async function act(action,{actionId}={}){validId(actionId,'Action ID');const result=await harness.act(action,{actionId});return {...result,intent:await view({conversationId:action.conversationId})};}
 async function undoDraft(input){validId(input?.actionId,'Action ID');const result=await harness.undo(input);return {...result,intent:await view({conversationId:input.conversationId})};}
 async function resume(draftId,{conversationId,actionId}={}){validId(actionId,'Action ID');const result=await harness.resume(draftId,{conversationId,actionId});return {...result,intent:await view({conversationId})};}

 const sort={
  async create(input,{requestId=`sort-create:${input?.id}`}={}){validId(input?.id,'Preview ID');validId(requestId,'Request ID');const result=await repository.transact(requestId,input,data=>{if(input.sourceVersion!==undefined&&input.sourceVersion!==data.version)throw new Error('Your plans changed while Jev was working. Ask again for a fresh suggestion.');const state=ensureIntent(data);if(!state.sortPreviews[input.id]&&Object.values(state.sortPreviews).filter(p=>p.status==='preview').length>=INTENT_LIMITS.sortPreviews)throw new Error('Review or dismiss an earlier sort preview first');if(state.sortPreviews[input.id])throw new Error('A preview with this ID already exists');const now=clock().toISOString(),preview={...createSortPreview(data,input),...(input.decision?{decision:structuredClone(input.decision)}:{}),createdAt:now,updatedAt:now};state.sortPreviews[preview.id]=preview;return {status:'preview',preview:structuredClone(preview)};});return result;},
  async dismiss(id,{revision,requestId=`sort-dismiss:${id}:${revision}`}={}){validId(id,'Preview ID');validId(requestId,'Request ID');return repository.transact(requestId,{id,revision},data=>{const state=ensureIntent(data),current=state.sortPreviews[id];if(!current||current.revision!==revision)throw new Error('Stale sort preview');const now=clock().toISOString(),preview={...dismissSortPreview(current),updatedAt:now};state.sortPreviews[id]=preview;return {status:'dismissed',preview:structuredClone(preview)};});},
  async accept(id,{revision,requestId=`sort-accept:${id}:${revision}`}={}){validId(id,'Preview ID');validId(requestId,'Request ID');return repository.transact(requestId,{id,revision},data=>{const state=ensureIntent(data),current=state.sortPreviews[id];if(!current)throw new Error('Sort preview not found');const applied=acceptSortPreview(data,current,{revision,editPlan,now:clock()});const preview={...applied.preview,createdAt:current.createdAt,updatedAt:clock().toISOString()};state.sortPreviews[id]=preview;return {status:'accepted',preview:structuredClone(preview),changed:applied.changed};});},
  async get(id){validId(id,'Preview ID');const data=await repository.load();return structuredClone(ensureIntent(data).sortPreviews[id]??null);},
  async list({status='preview'}={}){const data=await repository.load();return Object.values(ensureIntent(data).sortPreviews).filter(p=>status==null||p.status===status).sort((a,b)=>at(b.updatedAt)-at(a.updatedAt)).map(p=>structuredClone(p));}
 };
 /**
  * Keep one "Also heard" note as an Inbox task, in the note's words, or take it back out. Dara's tap is the
  * approval; the capture's original words stay the task's raw text. Never for a note that repeats a saved task.
  */
 async function keepNote({messageId,sourceId,keep=true,actionId}={}){
  validId(messageId,'Message ID');validId(actionId,'Action ID');
  const result=await repository.transact(`note:${actionId}`,{messageId,sourceId,keep},data=>{
   const capture=ensureIntent(data).captures[messageId],decision=capture?.decisions?.find(d=>d.sourceId===sourceId);
   if(!decision||decision.disposition==='action'||decision.disposition==='existing'||!decision.note?.trim())throw new Error('This note can’t be kept as a task');
   capture.keptNotes??={};
   const kept=capture.keptNotes[sourceId];
   if(keep){
    if(kept!=null&&(data.entries??[]).some(e=>e.id===kept&&!e.archived))return {status:'kept',taskId:kept};
    const id=editPlan(data,{type:'saveTask',fields:{title:decision.note.trim().slice(0,200)}},clock());
    const entry=data.entries.find(e=>e.id===id);if(entry){entry.raw=capture.raw;entry.source='intent-v2-note';}
    capture.keptNotes[sourceId]=id;return {status:'kept',taskId:id};
   }
   if(kept!=null&&(data.entries??[]).some(e=>e.id===kept&&!e.archived))editPlan(data,{type:'archiveTask',id:kept},clock());
   delete capture.keptNotes[sourceId];return {status:'unkept'};
  });
  return {...result,intent:await view({conversationId:ensureIntent(await repository.load()).captures[messageId]?.conversationId})};
 }
 return {repository,harness,capture,retry,act,undo:undoDraft,resume,view,sort,keepNote};
}
