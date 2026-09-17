import {findEntity,stable,checkGuards} from './context.mjs';
/** Store this preview in intentV2, NOT through legacy editPlan(type='aiDraft'). */
export function createSortPreview(data,{id,selectedTaskIds,blocks,leftUnsorted=[]}){
 if(typeof id!=='string'||!id||!Array.isArray(selectedTaskIds)||!selectedTaskIds.length||selectedTaskIds.length>60||new Set(selectedTaskIds.map(String)).size!==selectedTaskIds.length)throw new Error('Select 1–60 unique task IDs');
 if(!Array.isArray(blocks)||blocks.length>12||!Array.isArray(leftUnsorted))throw new Error('Invalid sort preview');
 const selected=new Set(selectedTaskIds.map(String)),used=new Set(),guards={};
 const guard=(entity,id)=>{const e=findEntity(data,entity,id);if(!e)throw new Error('Unknown grouping target');guards[`${entity}:${id}`]=stable(e);return e;};
 for(const id of selectedTaskIds){const t=guard('task',id);if(t.done||t.state==='cancelled')throw new Error('Only open tasks may be grouped');}
 const mark=id=>{if(!selected.has(String(id))||used.has(String(id)))throw new Error('Unselected or duplicate task assignment');used.add(String(id));};
 for(const b of blocks){
  if(!Array.isArray(b.taskIds))throw new Error('Task IDs required');b.taskIds.forEach(mark);
  if(b.blockId)guard('block',b.blockId);else if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200)throw new Error('A new outcome needs a title');
  if(b.projectId)guard('project',b.projectId);
 }
 leftUnsorted.forEach(mark);if(used.size!==selected.size)throw new Error('Every selected task must be assigned or explicitly left unsorted');
 return {id,revision:1,status:'preview',selectedTaskIds:[...selectedTaskIds],blocks:structuredClone(blocks),leftUnsorted:[...leftUnsorted],guards};
}
export function dismissSortPreview(preview){if(preview.status!=='preview')throw new Error('Preview already resolved');return {...structuredClone(preview),status:'dismissed',revision:preview.revision+1};}
/** Inject real editPlan. Canonical entries change only on this explicit call.
 * Enclose in the versioned repository transaction; this function itself is not durable.
 */
export function acceptSortPreview(data,preview,{revision,editPlan,now=new Date()}){
 if(preview.status!=='preview'||preview.revision!==revision)throw new Error('Stale sort approval');checkGuards(data,preview.guards);
 if(!preview.blocks.length)return {preview:{...preview,status:'accepted',revision:revision+1},changed:false};
 const working=structuredClone(data);
 const initial=(data.planner?.blocks??[]).map(b=>({id:b.id,title:b.title,projectId:b.projectId??null,purpose:b.purpose??'',tasks:data.entries.filter(e=>!e.archived&&e.blockId===b.id).map(e=>({id:e.id,title:e.title,must:!!e.must,priority:e.priority??null,minutes:e.minutes??null}))}));
 editPlan(working,{type:'aiDraft',blocks:preview.blocks},now);
 // The legacy editor supplies the authoritative pre-edit snapshot, including a
 // valid fresh planner when the original store has never opened planning.
 const before=structuredClone(working.planner.undo);
 if(!before?.planner||!Array.isArray(before.entries))throw new Error('Legacy planner did not provide a complete Undo snapshot');
 const draft=working.planner.drafts.at(-1);if(!draft)throw new Error('Legacy planner did not stage grouping');draft.initial=initial;
 editPlan(working,{type:'acceptDraft',id:draft.id},now);
 // The two legacy edits are ONE approval. Undo must restore the original grouping,
 // not merely roll back the metadata of acceptDraft.
 working.planner.undo=before;working.undo=null;
 data.entries=working.entries;data.planner=working.planner;data.undo=null;
 return {preview:{...preview,status:'accepted',revision:revision+1},changed:true};
}
