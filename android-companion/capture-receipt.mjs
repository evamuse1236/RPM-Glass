import {scheduleText} from './capture-content.mjs';

const VERB={create:{tasks:'Added',blocks:'New Block',projects:'New Project',goals:'New Goal',areas:'New Area'},complete:'Done',delete:{tasks:'Moved to Trash'},restore:'Restored',reopen:'Reopened'};
const rows=(data,collection)=>collection==='tasks'?data.entries??[]:data.planner?.[collection]??[];
const whenOf=row=>row?scheduleText(row.planned?{planned:row.planned}:row.plannedDate?{plannedDate:row.plannedDate}:null,{}):null;
const blockTitle=(data,id)=>id?(data.planner?.blocks??[]).find(b=>String(b.id)===String(id))?.title??null:null;
const COLLECTION={task:'tasks',block:'blocks',project:'projects',goal:'goals',area:'areas'};

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
 return 'Changed';
}

/**
 * One line per applied change, from the saved receipt and the plan as it is now: "Added · Call the bank ·
 * Today, 10:30 AM · Inbox", "Moved · Run · Today, 7:00 AM → Today, 6:00 AM". Never from the model's prose.
 */
export function receiptLines(data,draft){
 const changes=draft?.receipt?.changes??[],ops=draft?.operations??[],before=draft?.applied?.before??{};
 const creates={};
 return changes.map(change=>{
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
  const alertType=row?.alertIntent?.type??row?.alert??null;
  const alert=entity==='task'&&alertType&&alertType!=='off'?alertType:null;
  const minutes=entity==='task'&&change.type==='create'?row?.minutes??null:null;
  return {verb,entity,id:change.id,title:row?.title??change.title??old?.title??'',when,was,where,alert,minutes,must:row?.must===true,renamedFrom:verb==='Renamed'?old?.title??null:null};
 });
}

/** A change to something already saved, or a plan the model filled in, is applied and then confirmed with Keep or Undo. */
export function needsConfirm(draft){
 return draft.mode==='plan'||(draft.operations??[]).some(op=>op.kind!=='create');
}
