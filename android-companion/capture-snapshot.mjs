import {contextEntity,localStamp} from '../intent-v2/src/context.mjs';
import {dayAgenda,bodyToday} from './capture-agenda.mjs';
import {localDay,shiftDay} from './planner-state.mjs';

export const LIMITS=Object.freeze({upcoming:25,overdue:10,inbox:15,recent:8,blocks:12,calendar:24,entities:40});
const cut=(list,limit)=>Math.max(0,list.length-limit);
const open=e=>(e.kind??'plan')==='plan'&&!e.archived&&e.state!=='cancelled';
const clockOf=(at,timezone)=>at==null?null:localStamp(new Date(at).toISOString(),timezone)?.slice(11)??null;
const dayOf=(e,timezone)=>e.planned?localStamp(e.planned,timezone)?.slice(0,10)??null:e.plannedDate??null;
const blockOf=(data,id)=>id?(data.planner?.blocks??[]).find(b=>b.id===id)?.title??null:null;

function row(data,e,timezone){
 return {id:String(e.id),title:e.title,day:dayOf(e,timezone),at:e.planned?clockOf(Date.parse(e.planned),timezone):null,done:!!e.done,...(e.must===true?{must:true}:{}),...(e.blockId?{block:blockOf(data,e.blockId)}:{})};
}

/**
 * The plan as Capture's model sees it: today's agenda with the calendar, the coming week, what is overdue,
 * the Inbox, what recent captures added, open Blocks, and water, meals and routines when RPM logs them.
 * Every task listed is also returned as a context entity, so the model may target it by ID.
 */
export function planSnapshot(data,{now=new Date(),timezone=Intl.DateTimeFormat().resolvedOptions().timeZone,events=[]}={}){
 const today=localDay(now),week=shiftDay(today,7),tasks=(data.entries??[]).filter(open),picked=new Map(),unpicked=new Set();
 const pick=e=>{if(!picked.has(e.id)){if(picked.size<LIMITS.entities)picked.set(e.id,e);else unpicked.add(e.id);}return row(data,e,timezone);};
 const agenda=dayAgenda(data,{day:today,events});
 const agendaRows=[...agenda.timed,...agenda.anytime].map(i=>i.kind==='event'
  ?{event:i.title,at:clockOf(i.start,timezone),end:clockOf(i.end,timezone)}
  :{...pick(tasks.find(e=>e.id===i.id)),at:clockOf(i.start,timezone),end:clockOf(i.end,timezone),done:i.done});
 const dated=tasks.filter(e=>!e.done&&dayOf(e,timezone));
 const upcomingAll=dated.filter(e=>{const d=dayOf(e,timezone);return d>today&&d<=week;});
 const upcoming=upcomingAll.sort((a,b)=>String(dayOf(a,timezone)).localeCompare(String(dayOf(b,timezone)))).slice(0,LIMITS.upcoming).map(pick);
 const overdueAll=dated.filter(e=>dayOf(e,timezone)<today&&!e.recurrence&&!e.repeatAfterDays),overdue=overdueAll.slice(-LIMITS.overdue).map(pick);
 const inboxAll=tasks.filter(e=>!e.done&&!e.blockId&&!dayOf(e,timezone)),inbox=inboxAll.slice(-LIMITS.inbox).map(pick);
 const recentAll=tasks.filter(e=>String(e.source??'').startsWith('intent-v2'));
 const recent=recentAll.sort((a,b)=>String(b.created??b.id).localeCompare(String(a.created??a.id))||b.id-a.id).slice(0,LIMITS.recent)
  .map(e=>({...pick(e),fromWords:String(e.raw??'').slice(0,160)}));
 const calendarAll=events.filter(ev=>ev.end>+now&&ev.start<Date.parse(week+'T23:59:59'));
 const calendar=calendarAll.slice(0,LIMITS.calendar)
  .map(ev=>({title:ev.title,day:localStamp(new Date(ev.start).toISOString(),timezone)?.slice(0,10),at:clockOf(ev.start,timezone),end:clockOf(ev.end,timezone)}));
 const blocksAll=(data.planner?.blocks??[]).filter(b=>!b.archived&&!b.achieved);
 const blocks=blocksAll.slice(0,LIMITS.blocks).map(b=>({id:String(b.id),title:b.title,purpose:String(b.purpose??'').slice(0,140)}));
 const health=bodyToday(data,{now});
 const summary={today,todayAgenda:agendaRows,calendarComing:calendar,upcomingWeek:upcoming,overdue,inbox,recentlyCaptured:recent,openBlocks:blocks,
  health:health??{tracked:false,note:'Water, meals and routines are not logged in RPM on this phone yet.'}};
 const truncated=Object.fromEntries(Object.entries({upcoming:cut(upcomingAll,LIMITS.upcoming),overdue:cut(overdueAll,LIMITS.overdue),inbox:cut(inboxAll,LIMITS.inbox),recent:cut(recentAll,LIMITS.recent),calendar:cut(calendarAll,LIMITS.calendar),blocks:cut(blocksAll,LIMITS.blocks),untargetable:unpicked.size}).filter(([,n])=>n>0));
 return {summary,entities:[...picked.values()].map(e=>contextEntity('task',e,timezone,data)),truncated};
}
