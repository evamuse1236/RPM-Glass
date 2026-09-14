import {randomUUID} from 'node:crypto';
import {planner,tasks,editPlan,validatePlanner} from './planner-state.mjs';
import {recordSnapshot} from '../chat-prototype/companion-state.mjs';
import {propose,entryView,validate} from '../chat-prototype/companion-tools.mjs';
import {scheduleChecks} from './planner-chat.mjs';

const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const text={type:'string',maxLength:2000},id={type:['string','integer','null']},link={type:['string','null']};
const collections=['tasks','blocks','projects','areas','goals'];
const fields=object({title:{type:'string',maxLength:200},purpose:text,notes:{type:'string',maxLength:8000},leverage:text,time:{type:['string','null'],maxLength:100},minutes:{type:['integer','null'],minimum:1,maximum:1440},blockId:link,projectId:link,goalId:link,areaId:link,year:{type:'integer',minimum:2000,maximum:2200},must:{type:'boolean'},priority:{type:'integer',minimum:1,maximum:100000},recurrence:{type:['string','null'],enum:['daily','weekly','weekdays',null]},repeatAfterDays:{type:['integer','null'],minimum:1,maximum:365},alert:{type:['string','null'],enum:['alarm','reminder','off',null]}},[]);
const operation=object({type:{type:'string',enum:['create','update','delete','restore','complete','reopen']},collection:{type:'string',enum:collections},id,ref:{type:['string','null'],maxLength:50},fields,evidence:{type:'array',items:text,maxItems:8}});
export const changePlannerSchema=object({operations:{type:'array',items:operation,maxItems:30},continuation:{type:'boolean'},question:{type:['string','null'],maxLength:500},choices:{type:'array',items:object({label:{type:'string',maxLength:30},text:{type:'string',maxLength:800}}),maxItems:4}});
const allowed={tasks:['title','purpose','notes','leverage','time','minutes','blockId','must','priority','recurrence','repeatAfterDays','alert'],blocks:['title','purpose','notes','projectId'],projects:['title','purpose','notes','goalId'],goals:['title','purpose','notes','areaId','year'],areas:['title','purpose','notes']};
const compactTask=e=>({id:e.id,title:e.title,blockId:e.blockId??null,minutes:e.minutes,planned:e.planned,done:e.done,must:e.must,priority:e.priority,recurrence:e.recurrence,repeatAfterDays:e.repeatAfterDays,notes:e.notes,leverage:e.leverage});
export function planningFocus(data,focus={}){
 const p=planner(data),task=tasks(data).find(e=>e.id===focus.taskId),block=p.blocks.find(b=>b.id===(task?.blockId??focus.blockId)),project=p.projects.find(pr=>pr.id===(block?.projectId??focus.projectId));
 return {view:['day','rpm','projects','life'].includes(focus.view)?focus.view:'day',date:/^\d{4}-\d{2}-\d{2}$/.test(focus.date??focus.day??'')?(focus.date??focus.day):null,task:task?{id:task.id,title:task.title}:null,block:block?{id:block.id,title:block.title}:null,project:project?{id:project.id,title:project.title}:null};
}
export function plannerSummary(data,focus){const p=planner(data);return {focus:planningFocus(data,focus),counts:Object.fromEntries(['blocks','projects','areas','goals'].map(k=>[k,p[k].length])),blocks:p.blocks.slice(-25).map(({id,title,projectId})=>({id,title,projectId})),projects:p.projects.slice(-20).map(({id,title,goalId})=>({id,title,goalId})),readMore:'read_planner; supports search and pagination. Personal vision is not included automatically.'};}
export function readPlanner(data,{collection,query='',cursor=0}){
 const p=planner(data);let rows=collection==='tasks'?tasks(data).map(compactTask):collection==='trash'?data.entries.filter(e=>e.archived&&(e.kind??'plan')==='plan').map(compactTask):p[collection].map(r=>({...r}));
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);rows=rows.filter(r=>terms.every(t=>JSON.stringify(r).toLowerCase().includes(t)));
 return {items:rows.slice(cursor,cursor+20),total:rows.length,nextCursor:cursor+20<rows.length?cursor+20:null};
}
function hold(data,args,meta,question,choices=args.choices,token=null){
 data.pending={id:data.pending?.id??randomUUID(),kind:'planner',conversationId:meta.conversationId,operations:args.operations,raws:[...(args.continuation?data.pending?.raws??[]:[]),meta.raw],question,choices,created:meta.now.toISOString(),scheduleReview:token};
 return {text:question,proposal:structuredClone(data.pending),suggestions:choices};
}
/** One validated transaction; every operation either saves together or stays a draft. */
export async function changePlanner(data,args,meta,readCalendar=async()=>({status:'not_selected',events:[]})){
 validate(args,changePlannerSchema);meta={...meta,now:meta.now??new Date()};const pending=data.pending;
 if(pending&&(!args.continuation||pending.kind!=='planner'))throw new Error('Resolve or cancel the pending request first.');
 if(args.continuation&&!pending)throw new Error('There is no planning proposal to continue.');
 if(pending&&pending.operations.some(old=>!args.operations.some(op=>op.type===old.type&&op.collection===old.collection&&op.id===old.id&&op.ref===old.ref)))throw new Error('Include every operation from the pending request.');
 if(!args.operations.length)throw new Error('Supply a planning change, or respond without changing anything.');
 const evidence=[...(args.continuation?pending.raws:[]),meta.raw].join('\n');
 for(const op of args.operations){if(!op.evidence.length||op.evidence.some(s=>!s.trim()||!evidence.includes(s)))throw new Error('Changes need exact supporting words from the request.');if(Object.keys(op.fields).some(k=>!allowed[op.collection].includes(k)))throw new Error('That field does not belong to '+op.collection);}
 if(args.question)return hold(data,args,meta,args.question);
 const copy=structuredClone(data);copy.pending=null;const refs=new Map(),changes=[];
 const resolve=value=>typeof value==='string'&&value.startsWith('$')?(refs.has(value)?refs.get(value):(()=>{throw new Error('Unknown new-item reference '+value);})()):value;
 for(const op of args.operations){let targetId=resolve(op.id),f={...op.fields};for(const k of ['blockId','projectId','goalId','areaId'])if(k in f)f[k]=resolve(f[k]);
  if(op.type==='create'&&op.id!==null)throw new Error('New records must use id null and an optional ref.');
  if(op.type!=='create'&&targetId==null)throw new Error('Choose an existing record ID.');
  if(op.collection==='tasks'){
   const old=targetId==null?null:copy.entries.find(e=>e.id===targetId&&(e.kind??'plan')==='plan');if(targetId!==null&&!old)throw new Error('Task not found. Read current planning context.');
   if(op.type==='delete'||op.type==='restore')editPlan(copy,{type:op.type==='delete'?'archiveTask':'restoreTask',id:targetId},meta.now);
   else if(op.type==='complete'||op.type==='reopen')editPlan(copy,{type:op.type==='complete'?'saveTask':'reopenTask',id:targetId,fields:{done:true}},meta.now);
   else{
    const time=f.time;delete f.time;
    if('recurrence'in f)f.repeatAfterDays=null;else if('repeatAfterDays'in f)f.recurrence=null;
    // Apply scheduling first so a new recurring task is never temporarily invalid.
    if('time'in op.fields){const timeData=structuredClone(copy),base={title:f.title??old?.title,kind:'plan',time};if(old)delete base.kind;
     const r=propose(timeData,{operations:[{type:old?'update':'create',collection:'entries',id:old?.id??null,fields:base,evidence:op.evidence}],continuation:false,question:null,choices:[]},{...meta,raw:evidence});
     if(timeData.pending)return hold(data,args,meta,timeData.pending.question,timeData.pending.choices);
     const timed=timeData.entries.find(e=>e.id===r.entryIds[0]);f.planned=timed.planned;f.plannedDate=timed.planned?null:timed.plannedDate??null;
    }
    targetId=editPlan(copy,{type:'saveTask',id:targetId,fields:f},meta.now);
    const saved=copy.entries.find(e=>e.id===targetId);if(!old){saved.raw=meta.raw;saved.source='conversation';}
   }
  }else{
   const old=planner(copy)[op.collection].find(r=>r.id===targetId);
   if(op.type==='delete')editPlan(copy,{type:'removeEntity',collection:op.collection,id:targetId},meta.now);
   else if(op.type==='create'||op.type==='update'){if(op.type==='update'&&!old)throw new Error('Planning item not found.');targetId=editPlan(copy,{type:'saveEntity',collection:op.collection,id:targetId,fields:{...old,...f}},meta.now);}
   else throw new Error('Only tasks support completion or trash restoration; use Undo for removed groups.');
  }
  if(op.ref){const key=op.ref.startsWith('$')?op.ref:'$'+op.ref;if(refs.has(key))throw new Error('New-item reference used twice.');refs.set(key,targetId);}
  changes.push({type:op.type,collection:op.collection,id:targetId,title:op.fields.title??(op.collection==='tasks'?copy.entries:planner(data)[op.collection]).find(r=>r.id===targetId)?.title??''});
 }
 validatePlanner(copy);const checks=await scheduleChecks(data,copy,readCalendar,meta.now),token=JSON.stringify(checks.map(({alternatives,...c})=>c));
 if(checks.length&&!(args.continuation&&pending.scheduleReview===token&&meta.raw.trim().toLowerCase()==='save anyway')){const c=checks[0],question=c.warning??`${c.title} overlaps ${c.conflicts.slice(0,3).map(x=>x.title).join(', ')}. Save anyway, or choose another time?`;const choices=c.alternatives.map(at=>({label:new Date(at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}),text:`Move ${c.title} to ${new Date(at).toLocaleString('en-CA',{hour12:true})}. Keep all other requested changes.`}));choices.push({label:'Save anyway',text:'Save anyway'});return hold(data,args,meta,question,choices,token);}
 copy.planner.undo={entries:structuredClone(data.entries),planner:structuredClone({...planner(data),undo:null})};copy.undo={id:randomUUID(),at:meta.now.toISOString(),before:recordSnapshot(data)};copy.pending=null;Object.assign(data,copy);
 const entryIds=[...new Set(changes.filter(c=>c.collection==='tasks').map(c=>c.id))];
 return {text:changes.map(c=>`${({create:'Created',update:'Updated',delete:'Removed',restore:'Restored',complete:'Completed',reopen:'Reopened'})[c.type]} ${c.title||c.collection}`).join(' · ')+'.',entryIds,receipts:entryIds.map(id=>entryView(data.entries.find(e=>e.id===id))),plannerChanges:changes,undoId:data.undo.id,suggestions:[{label:'Open',text:'Open the plan I just changed.'}]};
}
export const plannerInstruction=`This phone has a full planner. The app tools override the earlier propose_changes-only restriction: use change_planner for any tasks/RPM blocks/projects/life areas/yearly goals request, including compound creates and moves. Use propose_changes for check-ins, history and explicit memories. Never claim planner tools are unavailable. Read/search current IDs with read_planner; use context.app.focus when "here" or "this block/project" clearly refers to it, otherwise ask. A new project's ref "project1" can be used as projectId "$project1" in a later block operation; a new block's ref "block1" can be used as blockId "$block1" on a task in the SAME transaction. Sparse fields preserve everything not requested. New rows use id null. A block has a result title and optional purpose and belongs to a project; a project belongs to a goal. Tasks use natural-language time, not guessed timestamps. Delete tasks is recoverable; deleting groups leaves their contents unassigned. Completion-relative repeats use repeatAfterDays. Questions hold every operation. Continue pending kind planner only through change_planner with ALL operations. For an existing legacy pending proposal with no kind field, continue through propose_changes with ALL operations; never switch its tool midway. Read tools may precede changes; change_planner finishes the turn with a saved receipt. Navigation and setting controls are available through app tools; system file pickers/permissions still require the person. Never read or expose a key.`;
export function createPlannerTools({readCalendar}={}){return [
 {name:'read_planner',description:'Read/search tasks, RPM blocks, projects, life areas, yearly goals or deleted tasks. Paginated current data; use IDs, never infer them.',schema:object({collection:{type:'string',enum:[...collections,'trash']},query:{type:'string',maxLength:300},cursor:{type:'integer',minimum:0}}),run:readPlanner},
 {name:'change_planner',description:'Create/edit/link/move/complete/delete planning records in ONE validated, undoable transaction. Exact request evidence required. Question holds all changes. Can create a project, block and tasks together using $ref links.',schema:changePlannerSchema,terminal:true,run:(d,args,meta)=>changePlanner(d,args,meta,readCalendar)}
 ];}
