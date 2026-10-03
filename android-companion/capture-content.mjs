// Presentation of already-resolved dates only. This module never parses input.
import {clock} from './planner/format.mjs';
import {localDay} from './planner-state.mjs';

export function captureDuration(minutes){
 if(!Number.isFinite(minutes)||minutes<=0)return null;
 const hours=Math.floor(minutes/60),rest=minutes%60;
 return [hours?`${hours} hr`:null,rest?`${rest} min`:null].filter(Boolean).join(' ');
}
export function captureSchedule(item,{timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,reference=new Date()}={}){
 if(!item)return null;
 if(item.status==='review')return {review:item.reason??'Choose a date and time.',date:null,time:null,duration:null};
 const dateParts=(value,zone=timeZone)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const dayKey=value=>{const p=dateParts(value);return `${p.year}-${p.month}-${p.day}`;};
 const day=(value,year=false,zone=timeZone)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'numeric',month:'short',...(year?{year:'numeric'}:{})}).format(value);
 const currentYear=dateParts(new Date(reference)).year;
 const clock=value=>{
  const minute=new Intl.DateTimeFormat('en-GB',{timeZone,minute:'numeric'}).format(value);
  return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'numeric',...(Number(minute)?{minute:'2-digit'}:{}),hour12:true}).format(value).replace(/\s+/g,' ').toLowerCase();
 };
 const offset=value=>new Intl.DateTimeFormat('en-GB',{timeZone,timeZoneName:'shortOffset'}).formatToParts(value).find(p=>p.type==='timeZoneName').value;
 if(item.planned){
  const start=new Date(item.planned),end=item.end?new Date(item.end):null;
  if(!Number.isFinite(+start)||end&&(!Number.isFinite(+end)||+end<=+start))return {review:'Check this date and time.',date:null,time:null,duration:null};
  const year=dateParts(start).year!==currentYear||(end&&dateParts(end).year!==currentYear);
  if(end&&dayKey(start)!==dayKey(end))return {date:`${day(start,year)} to ${day(end,year)}`,time:`${clock(start)} to ${clock(end)}`,crossDay:true,startLabel:`${day(start,year)} · ${clock(start)}`,endLabel:`${day(end,year)} · ${clock(end)}`,duration:captureDuration(item.minutes)};
  const zoneChanged=end&&offset(start)!==offset(end);
  return {date:day(start,year),time:end?`${clock(start)}${zoneChanged?' '+offset(start):''} to ${clock(end)}${zoneChanged?' '+offset(end):''}`:clock(start),duration:captureDuration(item.minutes)};
 }
 if(/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate??'')){
  const date=new Date(item.plannedDate+'T12:00:00Z');
  if(Number.isFinite(+date)&&date.toISOString().startsWith(item.plannedDate))return {date:day(date,item.plannedDate.slice(0,4)!==currentYear,'UTC'),time:'Time not set',duration:captureDuration(item.minutes)};
 }
 return null;
}

/** Short weekday for a resolved schedule item ("Sat"), or null when there is no date. */
export function captureWeekday(item,{timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}={}){
 if(!item||item.status==='review')return null;
 const weekday=(value,zone)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short'}).format(value);
 if(item.planned){
  const start=new Date(item.planned);
  return Number.isFinite(+start)?weekday(start,timeZone):null;
 }
 if(/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate??'')){
  const date=new Date(item.plannedDate+'T12:00:00Z');
  return Number.isFinite(+date)?weekday(date,'UTC'):null;
 }
 return null;
}

/**
 * Assist-chip labels for one proposal's schedule. Same-day items get a date chip
 * and a time chip; overnight ranges keep both ends; a date without a clock says
 * "Time not set" rather than implying an all-day commitment.
 */
export function scheduleChips(schedule,weekday=null){
 if(!schedule||schedule.review)return [];
 if(schedule.crossDay){
  return [
   {icon:'event',label:schedule.startLabel,kind:'start'},
   {icon:'arrow_forward',label:schedule.endLabel,kind:'end'},
  ];
 }
 const chips=[{icon:'event',label:weekday?`${weekday} ${schedule.date}`:schedule.date,kind:'date'}];
 const unset=schedule.time==='Time not set';
 const time=unset?schedule.time:[schedule.time,schedule.duration].filter(Boolean).join(' · ');
 chips.push({icon:'schedule',label:time,kind:'time',muted:unset});
 if(unset&&schedule.duration)chips.push({icon:'timer',label:schedule.duration,kind:'estimate'});
 return chips;
}

/** "Today", otherwise an absolute day such as "Sun 4 Oct" (with the year when it differs), never "Tomorrow" beside a weekday. */
export function absoluteDay(day,today=localDay()){
 if(day===today)return 'Today';
 // Built from parts: engines differ on the commas en-GB puts between them.
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).formatToParts(new Date(day+'T12:00')).map(p=>[p.type,p.value]));
 return [parts.weekday,parts.day,parts.month,day.slice(0,4)!==today.slice(0,4)?parts.year:null].filter(Boolean).join(' ');
}

/**
 * One proposal's date and time as an absolute day ("Sun 4 Oct, 9:00 AM",
 * "Today, 2:00 PM–3:00 PM"), or null without one. Another timezone, an
 * overnight range or a time still to check keeps the explicit labels from scheduleChips.
 */
export function scheduleText(item,{timeZone,deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone,reference=new Date()}={}){
 if(!item||item.status==='review')return null;
 const zone=timeZone??deviceZone;
 if(zone===deviceZone){
  const start=item.planned?new Date(item.planned):null,end=item.end?new Date(item.end):null;
  if(start&&Number.isFinite(+start)&&(!end||Number.isFinite(+end)&&+end>+start&&localDay(end)===localDay(start))){
   return `${absoluteDay(localDay(start),localDay(reference))}, ${clock(start)}${end?'–'+clock(end):''}`;
  }
  if(!start&&/^\d{4}-\d{2}-\d{2}$/.test(item.plannedDate??''))return absoluteDay(item.plannedDate,localDay(reference));
 }
 const labels=scheduleChips(captureSchedule(item,{timeZone:zone,reference}),captureWeekday(item,{timeZone:zone})).map(c=>c.label);
 return labels.length?labels.join(', '):null;
}

/** A Result's deadline from dueInfo() plus its stored value, in the same absolute words: "Due Mon 5 Oct, 10:30 AM". */
export function dueText(due,today=localDay()){
 if(!due)return null;
 if(due.overdue||!due.value)return due.label;
 const day=absoluteDay(due.value.slice(0,10),today);
 return `Due ${day==='Today'?'today':day}${due.value.length>10?', '+clock(due.at):''}`;
}

const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

/**
 * One line describing what a committed draft added and where it went, e.g.
 * "3 tasks added · 2 to Explain the chapter, 1 to Inbox". Built only from the
 * reviewed operations, never from the model's prose.
 */
export function addedSummary(operations=[]){
 const created=operations.filter(op=>op.kind==='create');
 if(!operations.length)return 'Saved';
 if(created.length!==operations.length||created.some(op=>op.entity!=='task')){
  return operations.length===1?'Change saved':`${operations.length} changes saved`;
 }
 const places=new Map();
 for(const op of created){
  const block=op.fields?.find(f=>f.name==='blockId'&&f.op==='set');
  const place=block?(block.displayValue??'a Block'):'Inbox';
  places.set(place,(places.get(place)??0)+1);
 }
 const head=`${plural(created.length,'task')} added`;
 if(places.size===1){
  const [place]=places.keys();
  return `${head} to ${place}`;
 }
 return `${head} · `+[...places].map(([place,n])=>`${n} to ${place}`).join(', ');
}
