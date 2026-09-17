/** Integration with the inspected RPM-Glass changePlanner/undo APIs.
 * Inject the real functions; no duplicate planner database or date parser.
 */
import {intentState} from '../src/repository.mjs';
import {checkGuards} from '../src/context.mjs';
const collections={task:'tasks',block:'blocks',project:'projects',goal:'goals',area:'areas'};
export function compilePlannerOperations(draft,approval){
 const byId=new Map(draft.operations.map(o=>[o.opId,o])),ordered=[],visiting=new Set(),done=new Set();
 function visit(op){if(done.has(op.opId))return;if(visiting.has(op.opId))throw new Error('Cyclic plan references');visiting.add(op.opId);
  for(const f of op.fields)if(f.op==='set'&&['blockId','projectId','goalId','areaId'].includes(f.name)&&String(f.value).startsWith('$')){const parent=byId.get(f.value.slice(1));if(!parent)throw new Error('Missing referenced operation');visit(parent);}
  visiting.delete(op.opId);done.add(op.opId);ordered.push(op);
 }
 draft.operations.forEach(visit);
 return ordered.map(op=>{
  const fields={};for(const f of op.fields){if(f.op==='unknown')throw new Error('Unknown is not clear; resolve this field');fields[f.name]=f.op==='clear'?null:f.value;}
  if(op.kind==='create'&&op.entity==='task'&&!Object.hasOwn(fields,'minutes'))fields.minutes=null;
  const target=op.targetId===null?null:op.entity==='task'?Number(op.targetId):op.targetId;
  if(op.entity==='task'&&target!==null&&(!Number.isSafeInteger(target)||target<=0))throw new Error('Invalid task ID');
  return {type:op.kind==='archive'?'delete':op.kind,collection:collections[op.entity],id:target,ref:op.kind==='create'?op.opId:null,fields,evidence:[`Reviewed draft ${draft.id} revision ${draft.revision}; action ${approval.actionId}`]};
 });
}
export function createRpmPlanAdapter({changePlanner,readCalendar,undo,maxTimeDraftAgeMs=15*60*1000}={}){
 if(typeof changePlanner!=='function'||typeof readCalendar!=='function')throw new Error('Inject changePlanner and a real or explicitly unavailable calendar reader');
 async function applyPlan({data,draft,approval}){
  if(data.pending)throw new Error('Resolve the legacy pending transaction before committing this pilot draft');
  checkGuards(data,draft.guards);
  const capture=intentState(data).captures[draft.sourceMessageIds[0]],anchor=new Date(draft.timeAnchorAt??capture.at);
  if(draft.operations.some(o=>o.fields.some(f=>f.name==='time'&&f.op==='set'))&&Date.parse(approval.at)-+anchor>maxTimeDraftAgeMs)throw new Error('STALE_TIME_REVIEW: refresh time interpretation before saving this older draft');
  const operations=compilePlannerOperations(draft,approval),approvalText=`Reviewed draft ${draft.id} revision ${draft.revision}; action ${approval.actionId}`;
  const originals=draft.sourceMessageIds.map(id=>intentState(data).captures[id]?.raw??'').join('\n');
  const working=structuredClone(data),acceptReview=!!draft.review&&approval.reviewToken===draft.review.token;
  const proof=originals+'\n[Structured user approval]\n'+approvalText;
  if(acceptReview)working.pending={id:draft.id,kind:'planner',conversationId:draft.conversationId,operations,raws:[proof],scheduleReview:draft.review.token};
  const args={operations,continuation:acceptReview,question:null,choices:[]};
  // Cache identical reads only within this one validation pass. Recheck on every commit attempt.
  const reads=new Map();const calendar=anchor=>{const key=String(anchor);if(!reads.has(key))reads.set(key,Promise.resolve(readCalendar(anchor)));return reads.get(key);};
  const result=await changePlanner(working,args,{raw:acceptReview?'save anyway':proof,conversationId:draft.conversationId,now:anchor},calendar);
  if(working.pending){
   if(!working.pending.scheduleReview)throw new Error(`TIME_NEEDS_REVIEW: ${working.pending.question}`);
   return {status:'review',review:{token:working.pending.scheduleReview,question:working.pending.question,choices:working.pending.choices??[]}};
  }
  if(!result.undoId)throw new Error('No canonical commit receipt returned');
  // Retain genuine original words, not the adapter's approval protocol, as task raw text.
  for(const [i,compiled] of operations.entries())if(compiled.type==='create'&&compiled.collection==='tasks'){
   const changed=result.plannerChanges?.[i],entry=working.entries.find(e=>e.id===changed?.id);
   if(entry){entry.raw=originals;entry.source='intent-v2';entry.intentApproval={draftId:draft.id,revision:draft.revision,actionId:approval.actionId};if(compiled.fields.minutes===null)entry.durationSource='unknown';}
  }
  // Receipt snapshots must also show genuine source words and estimate provenance.
  for(const r of result.plannerReceipts??[]){const e=working.entries.find(e=>e.id===r.entry?.id);if(e&&r.entry){r.entry.raw=e.raw;r.entry.durationSource=e.durationSource;}}
  for(const key of ['entries','planner','undo'])data[key]=working[key];
  return {status:'committed',receipt:{undoId:result.undoId,entryIds:result.entryIds??[],changes:result.plannerChanges??[],plannerReceipts:result.plannerReceipts??[],savedAt:approval.at,delivery:'Check native phone status; not a delivery confirmation'}};
 }
 async function undoPlan({data,receipt}){
  if(typeof undo!=='function')throw new Error('Inject the existing companion-tools undo function');
  if(data.undo?.id!==receipt.undoId)throw new Error('A newer change exists; inspect current plans before undoing');
  // Legacy snapshots may restore unrelated top-level data. Keep this pilot's audit ledger.
  const intent=data.intentV2;const result=undo(data,receipt.undoId);data.intentV2=intent;return {text:result.text};
 }
 return {applyPlan,undoPlan};
}
