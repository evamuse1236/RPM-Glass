import {scheduleText} from './capture-content.mjs';
import {draftTitle,alertOf} from '../intent-v2/src/context.mjs';
import {repeatLabel} from './planner/task-values.mjs';
import {describeLink,chainOf} from './capture-context.mjs';

const VERB={create:{tasks:'Added',blocks:'New Block',projects:'New Project',goals:'New Goal',areas:'New Area'},complete:'Done',delete:{tasks:'Moved to Trash'},restore:'Restored',reopen:'Reopened'};
const rows=(data,collection)=>collection==='tasks'?data.entries??[]:data.planner?.[collection]??[];
const whenOf=(row,reference=new Date())=>row?scheduleText(row.planned?{planned:row.planned}:row.plannedDate?{plannedDate:row.plannedDate}:null,{reference}):null;
const blockTitle=(data,id)=>id?(data.planner?.blocks??[]).find(b=>String(b.id)===String(id))?.title??null:null;
const COLLECTION={task:'tasks',block:'blocks',project:'projects',goal:'goals',area:'areas'};

/** What a created item's chips need: its saved values, the fields the reading left out, and the titles it links to. */
function editOf(data,entity,row,op,missing){
 if(!row)return null;
 const chain=chainOf(data,COLLECTION[entity],row);
 return {opId:op?.opId??null,missing:missing.filter(m=>m.opId===op?.opId).map(m=>m.field),
  planned:row.planned??null,plannedDate:row.plannedDate??null,blockId:row.blockId??null,recurrence:row.recurrence??null,
  alert:alertOf(row)??null,minutes:row.minutes??null,must:row.must===true,purpose:row.purpose??null,
  projectId:row.projectId??null,goalId:row.goalId??null,areaId:row.areaId??null,
  project:entity==='block'?chain.project?.title??null:null,goal:entity==='project'?chain.goal?.title??null:null,
  area:['block','project','goal'].includes(entity)?chain.area?.title??null:null};
}

const repeatOf=row=>row?.recurrence||row?.repeatAfterDays?repeatLabel(row):null;

export function pendingRow({id=null,title='',planned=null,plannedDate=null,minutes=null,alert=null,recurrence=null,repeatAfterDays=null,must=false,where=null,tone=null},reference=new Date()){
 return {verb:'Added',entity:'task',id,title,when:whenOf(planned||plannedDate?{planned,plannedDate}:null,reference),was:null,where,tone,
  alert:alert==='off'?null:alert,minutes,repeat:repeatOf({recurrence,repeatAfterDays}),must:must===true,renamedFrom:null};
}

export function previewRows(data,operations=[],schedule=null,reference=new Date()){
 return operations.filter(op=>op.kind==='create'&&op.entity==='task').map(op=>{
  const value=name=>op.fields.find(f=>f.name===name&&f.op==='set')?.value??null;
  const item=schedule?.items?.find(i=>i.opId===op.opId),timed=item&&item.status!=='review';
  const blockId=value('blockId'),block=blockId&&!String(blockId).startsWith('$')?describeLink(data,'blockId',blockId):null;
  return pendingRow({id:op.opId,title:value('title')??'',planned:timed?item.planned:null,plannedDate:timed?item.plannedDate:null,minutes:value('minutes'),
   alert:value('alert'),recurrence:value('recurrence'),repeatAfterDays:value('repeatAfterDays'),must:value('must'),where:block?.title??'Inbox',tone:block?.tone??null},reference);
 });
}

/** What a change saved before it applied, so a Keep card can say "from → to". Read just before the commit. */
export function beforeRows(data,draft){
 const before={};
 for(const op of draft.operations??[]){
  if(op.targetId==null)continue;
  const row=rows(data,COLLECTION[op.entity]).find(r=>String(r.id)===String(op.targetId));
  if(row)before[`${op.entity}:${op.targetId}`]={title:row.title,planned:row.planned??null,plannedDate:row.plannedDate??null,blockId:row.blockId??null,done:!!row.done};
 }
 return before;
}

function updateVerb(op,old,row){
 const names=new Set((op?.fields??[]).map(f=>f.name));
 if(names.has('time')&&(old?.planned!==row?.planned||old?.plannedDate!==row?.plannedDate))return 'Moved';
 if(names.has('blockId')&&old?.blockId!==row?.blockId)return 'Moved';
 if(names.has('title')&&old?.title!==row?.title)return 'Renamed';
 if(names.size===1&&names.has('alert')&&!alertOf(row))return 'Alarm off';
 return 'Changed';
}

/**
 * One line per applied change, from the saved receipt and the plan as it is now: "Added · Call the bank ·
 * Today, 10:30 AM · Inbox", "Moved · Run · Today, 7:00 AM → Today, 6:00 AM". Never from the model's prose.
 */
export function receiptLines(data,draft){
 const changes=draft?.receipt?.changes??[],ops=draft?.operations??[],before=draft?.applied?.before??{};
 const creates={};
 const parked=(draft?.receipt?.parkedDrafts??[]).map(p=>({verb:'Set aside',entity:'draft',id:p.id,title:draftTitle(data,data.intentV2?.drafts?.[p.id]),when:null,was:null,where:null,alert:null,minutes:null,must:false,renamedFrom:null}));
 return [...changes.map(change=>{
  if(['water','meals'].includes(change.collection))return {verb:change.state==='skipped'?'Skipped':'Logged',entity:change.collection==='water'?'water':'meal',id:change.id,title:change.title,when:whenOf({planned:change.at}),was:null,where:null,alert:null,minutes:null,must:false,renamedFrom:null};
  const entity=Object.keys(COLLECTION).find(k=>COLLECTION[k]===change.collection)??'task';
  let op;
  if(change.type==='create'){const list=ops.filter(o=>o.kind==='create'&&o.entity===entity);op=list[creates[entity]=(creates[entity]??-1)+1];}
  else op=ops.find(o=>o.entity===entity&&String(o.targetId)===String(change.id));
  const row=rows(data,change.collection).find(r=>String(r.id)===String(change.id));
  const old=before[`${entity}:${change.id}`]??null;
  const verb=change.type==='update'?updateVerb(op,old,row):(typeof VERB[change.type]==='string'?VERB[change.type]:VERB[change.type]?.[change.collection])??'Changed';
  const when=entity==='task'&&change.type!=='delete'?whenOf(row):null;
  const was=verb==='Moved'&&old&&(old.planned!==row?.planned||old.plannedDate!==row?.plannedDate)?whenOf(old)??'No date':null;
  const where=entity==='task'&&(change.type==='create'||verb==='Moved'&&old?.blockId!==row?.blockId)?blockTitle(data,row?.blockId)??'Inbox':null;
  const alert=entity==='task'&&change.type!=='delete'?alertOf(row):null;
  const minutes=entity==='task'&&change.type==='create'?row?.minutes??null:null;
  const repeat=entity==='task'&&change.type==='create'?repeatOf(row):null;
  const edit=change.type==='create'?editOf(data,entity,row,op,draft.missing??[]):null;
  return {verb,entity,id:change.id,title:row?.title??change.title??old?.title??'',when,was,where,alert,minutes,repeat,must:row?.must===true,renamedFrom:verb==='Renamed'?old?.title??null:null,edit};
 }),...parked,...(draft?.receipt?.removedProposals??[]).map(p=>({verb:'Removed from draft',entity:p.entity,id:p.opId,title:p.title,when:null,was:null,where:null,alert:null,minutes:null,must:false,renamedFrom:null}))];
}

/** A change to something already saved, or a plan the model filled in, is applied and then confirmed with Keep or Undo. */
export function needsConfirm(draft){
 return draft.mode==='plan'||(draft.operations??[]).some(op=>op.kind!=='create');
}
