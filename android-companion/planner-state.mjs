import {randomUUID} from 'node:crypto';
import {occurrences,completeTask} from './planner-recurrence.mjs';

export const freshPlanner=()=>({schema:1,projects:[],blocks:[],areas:[],goals:[],events:[],drafts:[],context:{vision:'',goals:'',approved:false},undo:null});
export function planner(data){return data.planner??freshPlanner();}
export const tasks=data=>data.entries.filter(e=>!e.archived&&(e.kind??'plan')==='plan');
export const blockTasks=(data,id)=>tasks(data).filter(e=>(e.blockId??null)===(id??null)).sort((a,b)=>(a.priority??Infinity)-(b.priority??Infinity)||a.id-b.id);
export function totals(rows){return {all:rows.filter(e=>!e.done).reduce((s,e)=>s+(e.minutes??0),0),must:rows.filter(e=>e.must&&!e.done).reduce((s,e)=>s+(e.minutes??0),0),unknown:rows.filter(e=>!e.done&&e.minutes==null).length};}
const text=(v,max=2000)=>{if(typeof v!=='string'||v.length>max)throw new Error('Text is too long or invalid.');return v.trim();};
const title=v=>{const s=text(v,200);if(!s)throw new Error('Add a title.');return s;};
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error('Choose a valid number.');return v;};
const one=(rows,id)=>{const r=rows.find(x=>x.id===id);if(!r)throw new Error('This item no longer exists.');return r;};
const link=(rows,id)=>id==null||id===''?null:one(rows,id).id;
const snap=data=>({entries:structuredClone(data.entries),planner:structuredClone({...planner(data),undo:null})});
export function validatePlanner(data){
  const p=planner(data);if(p.schema!==1)throw new Error('Unsupported planner format.');
  for(const k of ['projects','blocks','areas','goals','events','drafts'])if(!Array.isArray(p[k]))throw new Error('Invalid planning data.');
  for(const k of ['projects','blocks','areas','goals']){const ids=new Set();for(const r of p[k]){if(typeof r.id!=='string'||ids.has(r.id))throw new Error('Duplicate planning ID.');ids.add(r.id);title(r.title);}}
  for(const b of p.blocks)link(p.projects,b.projectId);
  for(const a of p.areas)if(a.rating!=null&&(typeof a.rating!=='number'||!Number.isFinite(a.rating)||a.rating<0||a.rating>10))throw new Error('Choose a life area rating from 0 to 10.');
  for(const g of p.goals){link(p.areas,g.areaId);integer(g.year,2000,2200);if(!['yearly','quarterly','monthly'].includes(g.horizon??'yearly'))throw new Error('Choose a valid goal horizon.');if(g.horizon==='quarterly'||g.horizon==='monthly')integer(g.period,1,g.horizon==='quarterly'?4:12);}
  for(const pr of p.projects)link(p.goals,pr.goalId);
  for(const e of tasks(data)){link(p.blocks,e.blockId);if(e.minutes!=null)integer(e.minutes,1,1440);if(e.priority!=null)integer(e.priority,0,100000);}
  return data;
}

/** Validate on a copy, commit once, keep a single complete undo plus compact receipts. */
export function editPlan(data,op,now=new Date()){
  const next=structuredClone(data);next.planner??=freshPlanner();const p=next.planner,before=snap(data),at=now.toISOString();let result;
  if(op.type==='undo'){
    if(!p.undo)throw new Error('No planning change to undo.');
    const restored=p.undo;next.entries=restored.entries;next.planner=restored.planner;next.planner.undo=null;next.undo=null;
    validatePlanner(next);Object.assign(data,next);return null;
  }
  if(op.type==='saveEntity'){
    if(!['projects','blocks','areas','goals'].includes(op.collection))throw new Error('Unknown planning group.');
    let r=op.id?one(p[op.collection],op.id):{id:randomUUID(),created:at};
    r.title=title(op.fields.title);r.purpose=text(op.fields.purpose??'');r.notes=text(op.fields.notes??'',8000);
    if(op.collection==='blocks')r.projectId=link(p.projects,op.fields.projectId);
    if(op.collection==='projects')r.goalId=link(p.goals,op.fields.goalId);
    if(op.collection==='areas'&&'rating' in op.fields){const value=op.fields.rating;if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10))throw new Error('Choose a life area rating from 0 to 10.');r.rating=value==null?null:Math.round(value*10)/10;}
    if(op.collection==='goals'){r.areaId=link(p.areas,op.fields.areaId);r.year=integer(op.fields.year,2000,2200);if('horizon' in op.fields)r.horizon=op.fields.horizon;if('period' in op.fields)r.period=op.fields.period;if(r.horizon==='yearly')r.period=null;}
    if(!op.id)p[op.collection].push(r);result=r.id;
  }else if(op.type==='removeEntity'){
    if(!['projects','blocks','areas','goals'].includes(op.collection))throw new Error('Unknown planning group.');one(p[op.collection],op.id);
    p[op.collection]=p[op.collection].filter(x=>x.id!==op.id);
    if(op.collection==='blocks')for(const e of next.entries)if(e.blockId===op.id)e.blockId=null;
    if(op.collection==='projects')for(const b of p.blocks)if(b.projectId===op.id)b.projectId=null;
    if(op.collection==='areas')for(const g of p.goals)if(g.areaId===op.id)g.areaId=null;
    if(op.collection==='goals')for(const pr of p.projects)if(pr.goalId===op.id)pr.goalId=null;
  }else if(op.type==='saveTask'){
    const f=op.fields;let e=op.id?one(tasks(next),op.id):{id:Math.max(0,...next.entries.map(e=>e.id))+1,kind:'plan',raw:title(f.title),created:at,state:'active',done:false,archived:false,minutes:30,durationSource:'default_estimate',planned:null,plannedDate:null,alertIntent:{type:null},recurrence:null,revisions:[],source:'planner'};
    const {revisions:ignoredRevisions,...oldFields}=e;const old=structuredClone(oldFields);
    if('title'in f)e.title=title(f.title);
    for(const k of ['purpose','notes','leverage'])if(k in f)e[k]=text(f[k]??'',k==='notes'?8000:2000);
    if('minutes'in f){e.minutes=f.minutes==null?null:integer(f.minutes,1,1440);e.durationSource='user_words';}
    if('planned'in f){if(f.planned!==null&&(typeof f.planned!=='string'||!Number.isFinite(Date.parse(f.planned))))throw new Error('Choose a valid date and time.');e.planned=f.planned;e.plannedDate=null;}
    if('plannedDate'in f){if(f.plannedDate!==null&&(typeof f.plannedDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(f.plannedDate)||!Number.isFinite(Date.parse(f.plannedDate+'T12:00'))))throw new Error('Choose a valid day.');if(e.planned&&f.plannedDate)throw new Error('Use either a scheduled time or a day without a time.');e.plannedDate=f.plannedDate;}
    if('blockId'in f)e.blockId=link(p.blocks,f.blockId);
    if('priority'in f)e.priority=integer(f.priority,1,100000);
    if('must'in f){if(typeof f.must!=='boolean')throw new Error('Must must be on or off.');e.must=f.must;}
    if('done'in f){if(typeof f.done!=='boolean')throw new Error('Invalid completion.');e.done=f.done;e.state=f.done?'done':'active';}
    if('alert'in f){if(!['alarm','reminder','off',null].includes(f.alert))throw new Error('Invalid alert.');e.alertIntent={type:f.alert};}
    if('recurrence'in f){if(![null,'daily','weekly','weekdays'].includes(f.recurrence))throw new Error('Invalid recurrence.');e.recurrence=f.recurrence;}
    if('repeatAfterDays'in f)e.repeatAfterDays=f.repeatAfterDays==null?null:integer(f.repeatAfterDays,1,365);
    if(e.repeatAfterDays&&e.recurrence)throw new Error('Choose one repeat pattern.');
    if((e.recurrence||e.repeatAfterDays)&&!e.planned)throw new Error('Add the first date and time for a repeating task.');
    if('planned'in f&&f.planned!==old.planned||'recurrence'in f&&f.recurrence!==old.recurrence)e.completedOccurrences=[];
    if(f.done===true){e.done=false;e.state='active';completeTask(e,op.occurrence,now);}
    e.revisions.push({at,reason:'Edited in planner',before:old,snapshot:{title:e.title,planned:e.planned,minutes:e.minutes,blockId:e.blockId,must:e.must,done:e.done}});
    e.revisions=e.revisions.slice(-100);
    if(!op.id)next.entries.push(e);
    const oldBlock=old.blockId??null,newBlock=e.blockId??null;
    if(!op.id||oldBlock!==newBlock||'priority'in f){const rows=blockTasks(next,newBlock).filter(t=>t.id!==e.id),index='priority'in f?Math.min(rows.length,f.priority-1):rows.length;rows.splice(index,0,e);rows.forEach((t,i)=>{t.priority=i+1;});if(oldBlock!==newBlock)blockTasks(next,oldBlock).forEach((t,i)=>{t.priority=i+1;});}
    result=e.id;
  }else if(op.type==='reopenTask'){
    const e=one(tasks(next),op.id),occurrence=op.occurrence??e.completions?.at(-1)?.occurrence;if(occurrence){const hit=(e.completions??[]).find(c=>c.occurrence===occurrence);if(!hit)throw new Error('That completion no longer exists.');if(e.repeatAfterDays)e.planned=occurrence;e.completedOccurrences=(e.completedOccurrences??[]).filter(k=>k!==occurrence);e.completions=e.completions.filter(c=>c!==hit);}e.done=false;e.state='active';result=e.id;
  }else if(op.type==='archiveTask'||op.type==='restoreTask'){
    const e=one(next.entries,op.id);if((e.kind??'plan')!=='plan')throw new Error('Choose a task.');
    e.archived=op.type==='archiveTask';if(e.blockId&&!p.blocks.some(b=>b.id===e.blockId))e.blockId=null;
    e.revisions??=[];e.revisions.push({at,reason:e.archived?'Deleted from planner (recoverable)':'Restored in planner',snapshot:{archived:e.archived}});e.revisions=e.revisions.slice(-100);result=e.id;
  }else if(op.type==='moveTask'){
    const e=one(tasks(next),op.id),target=link(p.blocks,op.blockId),oldBlock=e.blockId??null;
    const rows=blockTasks(next,target).filter(t=>t.id!==e.id);const index=op.beforeId==null?rows.length:rows.findIndex(t=>t.id===op.beforeId);
    if(index<0)throw new Error('The destination task moved. Try again.');
    e.blockId=target;rows.splice(index,0,e);rows.forEach((t,i)=>{t.priority=i+1;});
    if(oldBlock!==target)blockTasks(next,oldBlock).forEach((t,i)=>{t.priority=i+1;});result=e.id;
  }else if(op.type==='reorder'){
    const rows=blockTasks(next,op.blockId);if(!Array.isArray(op.ids)||op.ids.length!==rows.length||new Set(op.ids).size!==rows.length||op.ids.some(id=>!rows.some(e=>e.id===id)))throw new Error('Task order changed. Try again.');
    op.ids.forEach((id,i)=>{one(next.entries,id).priority=i+1;});
  }else if(op.type==='aiDraft'){
    if(!Array.isArray(op.blocks)||!op.blocks.length||op.blocks.length>12)throw new Error('The AI returned an invalid set of blocks.');
    const assigned=new Set(),ids=[];
    for(const b of op.blocks){if(!Array.isArray(b.taskIds)||b.taskIds.length>60)throw new Error('The AI returned invalid task links.');const projectId=link(p.projects,b.projectId);let row=b.blockId?one(p.blocks,b.blockId):{id:randomUUID(),title:title(b.title),projectId,purpose:'',notes:'',created:at};if(!b.blockId)p.blocks.push(row);ids.push(row.id);let rank=blockTasks(next,row.id).length;
      for(const id of b.taskIds){if(assigned.has(id))throw new Error('The AI assigned a task twice.');const e=one(tasks(next),id);if(e.done)throw new Error('A completed task cannot be sorted by this draft.');assigned.add(id);e.blockId=row.id;e.priority=++rank;}
    }
    p.drafts.push({id:randomUUID(),at,status:'unreviewed',proposed:op.blocks.map(b=>({blockId:b.blockId??null,title:text(b.title??'',200),projectId:b.projectId??null,taskIds:[...b.taskIds]})),blockIds:[...new Set(ids)],initial:arrangement(next),final:null});p.drafts=p.drafts.slice(-40);
  }else if(op.type==='acceptDraft'){
    const draft=one(p.drafts,op.id);if(draft.status!=='unreviewed')throw new Error('This draft was already reviewed.');draft.status='accepted';draft.acceptedAt=at;draft.final=arrangement(next);
  }else if(op.type==='dismissDraft'){
    const draft=one(p.drafts,op.id);draft.status='dismissed';draft.final=null;
  }else if(op.type==='context'){
    if(typeof op.approved!=='boolean')throw new Error('Review state is required.');p.context={...p.context,vision:text(op.vision,10000),goals:text(op.goals,10000),coreValues:text(op.coreValues??p.context.coreValues??'',10000),approved:op.approved,updated:at};
  }else throw new Error('Unknown planning action.');
  validatePlanner(next);p.events.push({id:randomUUID(),at,type:op.type,target:result??op.id??op.blockId??null,fields:op.fields?Object.keys(op.fields):[]});p.events=p.events.slice(-300);p.undo=before;next.undo=null;
  Object.assign(data,next);return result;
}

export function arrangement(data){return planner(data).blocks.map(b=>({id:b.id,title:b.title,projectId:b.projectId??null,purpose:b.purpose??'',tasks:blockTasks(data,b.id).map(e=>({id:e.id,title:e.title,must:!!e.must,priority:e.priority??null,minutes:e.minutes??null}))}));}

export function localDay(date=new Date()){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function shiftDay(day,offset){const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+offset);return localDay(d);}
export function dayRange(day){const start=new Date(day+'T00:00:00');const end=new Date(start);end.setDate(end.getDate()+1);end.setHours(1);return {start:+start,end:+end};}
export function conflicts(data,start,minutes,calendar=[],excludeId=null){
  const a=+new Date(start),b=a+minutes*60000;
  if(!Number.isFinite(a)||!Number.isFinite(b)||minutes<=0)throw new Error('Choose a valid time and duration.');
  return [...tasks(data).filter(e=>e.id!==excludeId).flatMap(e=>occurrences(e,a,b)),...calendar.filter(e=>e.busy!==false).map(e=>({...e,source:'calendar'}))].filter(e=>a<+e.end&&b>+e.start);
}
export function alternatives(data,start,minutes,calendar=[],excludeId=null){
  const slots=[],anchor=new Date(start);let t=Math.ceil(+anchor/900000)*900000;
  for(let i=0;i<192&&slots.length<3;i++,t+=900000){const d=new Date(t),limit=new Date(t);limit.setHours(23,0,0,0);if(d.getHours()<6||t+minutes*60000>+limit)continue;if(!conflicts(data,t,minutes,calendar,excludeId).length)slots.push(new Date(t).toISOString());}
  return slots;
}

/** Partition overlapping events into lanes so no commitment disappears behind another. */
export function timelineItems(data,day,calendar=[],minimumVisualMinutes=0){
  const {start,end}=dayRange(day);
  const rows=[...tasks(data).flatMap(e=>occurrences(e,start,end)),...calendar.map(e=>({...e,source:'calendar'}))].filter(e=>e.start<end&&e.end>start).sort((a,b)=>a.start-b.start||b.end-a.end);
  const visualEnd=e=>Math.max(e.end,e.start+minimumVisualMinutes*60000);
  let group=[],until=-Infinity;const finish=()=>{const ends=[];for(const e of group){let lane=ends.findIndex(t=>t<=e.start);if(lane<0)lane=ends.length;ends[lane]=visualEnd(e);e.lane=lane;}for(const e of group)e.lanes=ends.length;group=[];};
  for(const e of rows){if(e.start>=until){finish();until=visualEnd(e);}else until=Math.max(until,visualEnd(e));group.push(e);}finish();return rows;
}
