import {randomUUID} from 'node:crypto';
import {planner,tasks,editPlan,validatePlanner,conflicts,alternatives} from './planner-state.mjs';
import {recordSnapshot} from '../chat-prototype/companion-state.mjs';
import {propose,entryView,validate} from '../chat-prototype/companion-tools.mjs';
import {calendarRisk,calendarRows} from './planner-calendar.mjs';
import {repeats,nextOccurrence,occurrences} from './planner-recurrence.mjs';
import {plannerReceipts} from './capture-actions.mjs';

const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const text={type:'string',maxLength:2000},id={type:['string','integer','null']},link={type:['string','null']};
const collections=['tasks','blocks','projects','areas','goals'];
const fields=object({title:{type:'string',maxLength:200},purpose:text,notes:{type:'string',maxLength:8000},leverage:text,time:{type:['string','null'],maxLength:100},minutes:{type:['integer','null'],minimum:1,maximum:1440},blockId:link,projectId:link,goalId:link,areaId:link,year:{type:'integer',minimum:2000,maximum:2200},must:{type:'boolean'},priority:{type:'integer',minimum:1,maximum:100000},recurrence:{type:['string','null'],enum:['daily','weekly','weekdays',null]},repeatAfterDays:{type:['integer','null'],minimum:1,maximum:365},alert:{type:['string','null'],enum:['alarm','reminder','off',null]}},[]);
const operation=object({type:{type:'string',enum:['create','update','delete','restore','complete','reopen']},collection:{type:'string',enum:collections},id,ref:{type:['string','null'],maxLength:50},fields,evidence:{type:'array',items:text,maxItems:8}});
export const changePlannerSchema=object({operations:{type:'array',items:operation,maxItems:30},continuation:{type:'boolean'},question:{type:['string','null'],maxLength:500},choices:{type:'array',items:object({label:{type:'string',maxLength:30},text:{type:'string',maxLength:800}}),maxItems:4}});
const allowed={tasks:['title','purpose','notes','leverage','time','minutes','blockId','must','priority','recurrence','repeatAfterDays','alert'],blocks:['title','purpose','notes','projectId'],projects:['title','purpose','notes','goalId'],goals:['title','purpose','notes','areaId','year'],areas:['title','purpose','notes']};
/** Resolve one task time with the exact canonical parser/update semantics, on a clone. */
export function resolvePlannerTime(data,{id=null,title,time,minutes,evidence=[]},{raw,conversationId,now=new Date()}={}){
 const old=id==null?null:data.entries.find(e=>e.id===id&&(e.kind??'plan')==='plan');if(id!=null&&!old)throw new Error('Task not found. Read current planning context.');
 const timeData=structuredClone(data),base={title:title??old?.title,kind:'plan',time};if(old)delete base.kind;if(minutes!=null)base.duration=minutes;
 const result=propose(timeData,{operations:[{type:old?'update':'create',collection:'entries',id:old?.id??null,fields:base,evidence}],continuation:false,question:null,choices:[]},{raw,conversationId,now});
 if(timeData.pending)return {status:'review',question:timeData.pending.question,choices:timeData.pending.choices??[]};
 const timed=timeData.entries.find(e=>e.id===result.entryIds[0]);return {status:timed.planned?'parsed':'date_only',planned:timed.planned,plannedDate:timed.planned?null:timed.plannedDate??null,minutes:timed.interpretation?.minutes??null,end:timed.interpretation?.end??null,assumptions:timed.interpretation?.assumptions??[]};
}
export function planningFocus(data,focus={}){
 const p=planner(data),task=tasks(data).find(e=>e.id===focus.taskId),block=p.blocks.find(b=>b.id===(task?.blockId??focus.blockId)),project=p.projects.find(pr=>pr.id===(block?.projectId??focus.projectId));
 return {view:['day','rpm','projects','life'].includes(focus.view)?focus.view:'day',date:/^\d{4}-\d{2}-\d{2}$/.test(focus.date??focus.day??'')?(focus.date??focus.day):null,task:task?{id:task.id,title:task.title}:null,block:block?{id:block.id,title:block.title}:null,project:project?{id:project.id,title:project.title}:null};
}
function hold(data,args,meta,question,choices=args.choices,token=null){
 data.pending={id:data.pending?.id??randomUUID(),kind:'planner',conversationId:meta.conversationId,operations:args.operations,raws:[...(args.continuation?data.pending?.raws??[]:[]),meta.raw],question,choices,created:meta.now.toISOString(),scheduleReview:token};
 return {text:question,proposal:structuredClone(data.pending),suggestions:choices};
}
async function scheduleChecks(data,copy,readCalendar,now=new Date()){
  const changed=copy.entries.filter(e=>e.planned&&!e.done&&!e.archived&&e.state!=='cancelled'&&(()=>{const old=data.entries.find(x=>x.id===e.id);return !old||e.planned!==old.planned||e.minutes!==old.minutes||e.recurrence!==old.recurrence||old.done||old.archived;})());
  const checks=[];
  for(const e of changed){const anchor=repeats(e)?nextOccurrence(e,now):e.planned,copyCalendar=await readCalendar(Date.parse(anchor)),rows=calendarRows(copyCalendar),window=occurrences(e,Date.parse(anchor),Date.parse(anchor)+(repeats(e)?21*86400000:1));
    const overlaps=window.flatMap(o=>conflicts(copy,o.start,e.minutes??30,rows,e.id));
    const warning=calendarRisk(copyCalendar,Date.parse(anchor),Date.parse(anchor)+(e.minutes??30)*60000);
    if(overlaps.length||warning)checks.push({id:e.id,title:e.title,planned:e.planned,minutes:e.minutes,recurrence:e.recurrence??null,warning,conflicts:overlaps.map(x=>({id:x.id,title:x.title,start:x.start,end:x.end})),alternatives:alternatives(copy,anchor,e.minutes??30,rows,e.id)});
  }return checks;
}
/** One validated transaction; every operation either saves together or stays a draft. */
export async function changePlanner(data,args,meta,readCalendar=async()=>({status:'not_selected',events:[]})){
 validate(args,changePlannerSchema);meta={...meta,now:meta.now??new Date()};const pending=data.pending;
 // A concrete, independent create must not be blocked by an older unresolved
 // edit. Apply it atomically while retaining the old proposal for later review.
 const independentCreate=!!pending&&!args.continuation&&args.operations.length>0&&args.operations.every(op=>op.type==='create');
 if(pending&&!independentCreate&&(!args.continuation||pending.kind!=='planner'))throw new Error('Resolve or cancel the pending request first.');
 if(args.continuation&&!pending)throw new Error('There is no planning proposal to continue.');
 if(args.continuation&&pending.operations.some(old=>!args.operations.some(op=>op.type===old.type&&op.collection===old.collection&&op.id===old.id&&op.ref===old.ref)))throw new Error('Include every operation from the pending request.');
 if(!args.operations.length)throw new Error('Supply a planning change, or respond without changing anything.');
 const evidence=[...(args.continuation?pending.raws:[]),meta.raw].join('\n');
 for(const op of args.operations){if(!op.evidence.length||op.evidence.some(s=>!s.trim()||!evidence.includes(s)))throw new Error('Changes need exact supporting words from the request.');if(Object.keys(op.fields).some(k=>!allowed[op.collection].includes(k)))throw new Error('That field does not belong to '+op.collection);}
 if(args.question){if(independentCreate)throw new Error('This new item still needs an answer. Finish or dismiss the open proposal first.');return hold(data,args,meta,args.question);}
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
    if('time'in op.fields){const resolved=resolvePlannerTime(copy,{id:old?.id??null,title:f.title??old?.title,time,minutes:f.minutes,evidence:op.evidence},{...meta,raw:evidence});
     if(resolved.status==='review'){if(independentCreate)throw new Error('This new item needs a scheduling answer. Finish or dismiss the open proposal first.');return hold(data,args,meta,resolved.question,resolved.choices);}
     f.planned=resolved.planned;f.plannedDate=resolved.plannedDate;if(resolved.minutes!==null)f.minutes=resolved.minutes;
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
 if(checks.length&&!(args.continuation&&pending.scheduleReview===token&&meta.raw.trim().toLowerCase()==='save anyway')){if(independentCreate)throw new Error('This new item needs a schedule review. Finish or dismiss the open proposal first.');const c=checks[0],question=c.warning??`${c.title} overlaps ${c.conflicts.slice(0,3).map(x=>x.title).join(', ')}. Save anyway, or choose another time?`;const choices=c.alternatives.map(at=>({label:new Date(at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}),text:`Move ${c.title} to ${new Date(at).toLocaleString('en-CA',{hour12:true})}. Keep all other requested changes.`}));choices.push({label:'Save anyway',text:'Save anyway'});return hold(data,args,meta,question,choices,token);}
 copy.planner.undo={entries:structuredClone(data.entries),planner:structuredClone({...planner(data),undo:null})};copy.undo={id:randomUUID(),at:meta.now.toISOString(),before:recordSnapshot(data)};copy.pending=independentCreate?structuredClone(pending):null;Object.assign(data,copy);
 const entryIds=[...new Set(changes.filter(c=>c.collection==='tasks').map(c=>c.id))];
 return {text:'Saved.',entryIds,receipts:[],plannerReceipts:plannerReceipts(data,changes,entryView),plannerChanges:changes,undoId:data.undo.id,suggestions:[]};
}
