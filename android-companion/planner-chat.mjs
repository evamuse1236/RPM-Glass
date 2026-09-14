import {propose,entryView} from '../chat-prototype/companion-tools.mjs';
import {conflicts,alternatives} from './planner-state.mjs';
import {calendarRisk,calendarRows} from './planner-calendar.mjs';
import {completeTask,repeats,nextOccurrence,occurrences} from './planner-recurrence.mjs';

export const scheduleSchema={type:'object',properties:{start:{type:'string',maxLength:40},minutes:{type:'integer',minimum:1,maximum:1440},excludeId:{type:['integer','null']}},required:['start','minutes','excludeId'],additionalProperties:false};
export async function checkSchedule(data,args,readCalendar){
  const at=Date.parse(args.start);if(!Number.isFinite(at))throw new Error('Use an ISO date and time with a timezone.');
  const copy=await readCalendar(at),rows=calendarRows(copy);
  return {warning:calendarRisk(copy,at,at+args.minutes*60000),source:copy.status,conflicts:conflicts(data,at,args.minutes,rows,args.excludeId).slice(0,12).map(e=>({title:e.title,start:new Date(e.start).toISOString(),end:new Date(e.end).toISOString(),source:e.source})),alternatives:alternatives(data,at,args.minutes,rows,args.excludeId)};
}

/** Every schedule mutation is checked again, even when the model skipped its read tool. */
export async function phoneProposal(data,args,meta,readCalendar){
  if(data.pending?.kind==='planner')throw new Error('Resolve the pending planning transaction with change_planner, or cancel it first.');
  const copy=structuredClone(data),result=propose(copy,args,meta);
  if(copy.pending){Object.assign(data,copy);return result;}
  for(const e of copy.entries){const old=data.entries.find(x=>x.id===e.id);if(old&&!old.done&&e.done&&repeats(old)){e.done=false;e.state='active';completeTask(e,nextOccurrence(old,meta.now),meta.now);}
    if(args.operations.some(op=>op.type==='update'&&op.collection==='entries'&&op.id===e.id&&Object.hasOwn(op.fields,'recurrence')&&op.fields.recurrence===null))e.repeatAfterDays=null;
    if(e.recurrence)e.repeatAfterDays=null;
    if(old&&(e.planned!==old.planned||e.recurrence!==old.recurrence))e.completedOccurrences=[];
  }
  const checks=await scheduleChecks(data,copy,readCalendar,meta.now);
  const token=JSON.stringify(checks.map(({alternatives,...c})=>c));
  const accepted=args.continuation&&data.pending?.scheduleReview===token&&meta.raw.trim().toLowerCase()==='save anyway';
  if(checks.length&&!accepted){const first=checks[0],question=first.warning??`${first.title} overlaps ${first.conflicts.slice(0,3).map(c=>`${c.title} at ${new Date(c.start).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`).join(', ')}. Save anyway, or choose another time?`;
    const choices=first.alternatives.slice(0,3).map(t=>({label:new Date(t).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}),text:`Move ${first.title} to ${new Date(t).toLocaleString('en-CA',{hour12:true})}. Keep the other requested changes.`}));choices.push({label:'Save anyway',text:'Save anyway'});
    const held=propose(data,{...args,question,choices},meta);data.pending.scheduleReview=token;held.proposal=structuredClone(data.pending);return held;
  }
  if(copy.planner)copy.planner.undo=null;
  Object.assign(data,copy);result.receipts=(result.entryIds??[]).map(id=>entryView(data.entries.find(e=>e.id===id)));return result;
}

export async function scheduleChecks(data,copy,readCalendar,now=new Date()){
  const changed=copy.entries.filter(e=>e.planned&&!e.done&&!e.archived&&e.state!=='cancelled'&&(()=>{const old=data.entries.find(x=>x.id===e.id);return !old||e.planned!==old.planned||e.minutes!==old.minutes||e.recurrence!==old.recurrence||old.done||old.archived;})());
  const checks=[];
  for(const e of changed){const anchor=repeats(e)?nextOccurrence(e,now):e.planned,copyCalendar=await readCalendar(Date.parse(anchor)),rows=calendarRows(copyCalendar),window=occurrences(e,Date.parse(anchor),Date.parse(anchor)+(repeats(e)?21*86400000:1));
    const overlaps=window.flatMap(o=>conflicts(copy,o.start,e.minutes??30,rows,e.id));
    const warning=calendarRisk(copyCalendar,Date.parse(anchor),Date.parse(anchor)+(e.minutes??30)*60000);
    if(overlaps.length||warning)checks.push({id:e.id,title:e.title,planned:e.planned,minutes:e.minutes,recurrence:e.recurrence??null,warning,conflicts:overlaps.map(x=>({id:x.id,title:x.title,start:x.start,end:x.end})),alternatives:alternatives(copy,anchor,e.minutes??30,rows,e.id)});
  }return checks;
}

export function repeatSuggestion(data){const eligible=data.entries.filter(e=>!e.archived&&e.kind==='plan'),last=eligible.at(-1);if(!last||repeats(last))return null;
  const title=e=>(e.title??'').trim().toLowerCase();if(eligible.filter(e=>title(e)===title(last)).length<3)return null;
  return {label:'Recurring?',text:`Make #${last.id} recurring. Ask me which repeat schedule to use.`};
}
