import {scheduleText} from './capture-content.mjs';
import {alertOf} from '../intent-v2/src/context.mjs';

const NEW={block:'New Block',project:'New Project',goal:'New Goal',area:'New Area'};
const COLLECTION={block:'blocks',project:'projects',goal:'goals',area:'areas'};

function verbOf(change){
 if(change.kind==='add')return change.entity==='task'?'Added':NEW[change.entity]??'Added';
 if(change.kind==='remove')return change.entity==='task'?'Moved to Trash':'Trash';
 return {complete:'Done',reopen:'Reopened',move:'Moved',order:'Reordered'}[change.kind]??'Changed';
}
const find=(list,id)=>id==null?null:(list??[]).find(x=>String(x.id)===String(id))??null;
const whenOf=(row,reference)=>row?.planned||row?.plannedDate?scheduleText(row.planned?{planned:row.planned}:{plannedDate:row.plannedDate},{reference}):null;
const blockTitle=(data,id)=>id==null?'Inbox':find(data.planner?.blocks,id)?.title??null;

/** A ramble's changes as Capture receipt rows, read from the saved plan so each row shows what is there now. */
export function voiceRows(data,changes,reference=new Date()){
 return (changes??[]).map(change=>{
  const verb=verbOf(change);
  const base={verb,entity:change.entity,id:change.id??null,title:change.title??'',when:null,was:null,where:null,alert:null,minutes:null,repeat:null,must:false,renamedFrom:null};
  if(change.kind==='move')return {...base,where:change.to??'Inbox'};
  if(change.entity!=='task'){
   const row=find(data.planner?.[COLLECTION[change.entity]],change.id);
   return {...base,title:row?.title??base.title};
  }
  const row=find(data.entries,change.id);
  if(!row||change.kind==='remove')return base;
  return {...base,title:row.title||base.title,when:whenOf(row,reference),alert:alertOf(row),minutes:row.minutes??null,must:row.must===true,
   where:change.kind==='add'?blockTitle(data,row.blockId):null};
 });
}
