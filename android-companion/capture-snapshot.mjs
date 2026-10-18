import {contextEntity,localStamp} from '../intent-v2/src/context.mjs';
import {dayAgenda,bodyToday} from './capture-agenda.mjs';
import {localDay,shiftDay} from './planner-state.mjs';

const LIMITS=Object.freeze({upcoming:25,overdue:10,inbox:15,recent:8,blocks:12,calendar:24,entities:40});
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
 const today=localDay(now),week=shiftDay(today,7),tasks=(data.entries??[]).filter(open),picked=new Map();
 const pick=e=>{if(!picked.has(e.id)&&picked.size<LIMITS.entities)picked.set(e.id,e);return row(data,e,timezone);};
 const agenda=dayAgenda(data,{day:today,events});
 const agendaRows=[...agenda.timed,...agenda.anytime].map(i=>i.kind==='event'
  ?{event:i.title,at:clockOf(i.start,timezone),end:clockOf(i.end,timezone)}
  :{...pick(tasks.find(e=>e.id===i.id)),at:clockOf(i.start,timezone),end:clockOf(i.end,timezone),done:i.done});
 const dated=tasks.filter(e=>!e.done&&dayOf(e,timezone));
 const upcoming=dated.filter(e=>{const d=dayOf(e,timezone);return d>today&&d<=week;}).sort((a,b)=>String(dayOf(a,timezone)).localeCompare(String(dayOf(b,timezone)))).slice(0,LIMITS.upcoming).map(pick);
 const overdue=dated.filter(e=>dayOf(e,timezone)<today&&!e.recurrence&&!e.repeatAfterDays).slice(-LIMITS.overdue).map(pick);
 const inbox=tasks.filter(e=>!e.done&&!e.blockId&&!dayOf(e,timezone)).slice(-LIMITS.inbox).map(pick);
 const recent=tasks.filter(e=>String(e.source??'').startsWith('intent-v2')).sort((a,b)=>String(b.created??b.id).localeCompare(String(a.created??a.id))||b.id-a.id).slice(0,LIMITS.recent)
  .map(e=>({...pick(e),fromWords:String(e.raw??'').slice(0,160)}));
 const calendar=events.filter(ev=>ev.end>+now&&ev.start<Date.parse(week+'T23:59:59')).slice(0,LIMITS.calendar)
  .map(ev=>({title:ev.title,day:localStamp(new Date(ev.start).toISOString(),timezone)?.slice(0,10),at:clockOf(ev.start,timezone),end:clockOf(ev.end,timezone)}));
 const blocks=(data.planner?.blocks??[]).filter(b=>!b.archived&&!b.achieved).slice(0,LIMITS.blocks).map(b=>({id:String(b.id),title:b.title,purpose:String(b.purpose??'').slice(0,140)}));
 const health=bodyToday(data,{now});
 const summary={today,todayAgenda:agendaRows,calendarComing:calendar,upcomingWeek:upcoming,overdue,inbox,recentlyCaptured:recent,openBlocks:blocks,
  health:health??{tracked:false,note:'Water, meals and routines are not logged in RPM on this phone yet.'}};
 return {summary,entities:[...picked.values()].map(e=>contextEntity('task',e,timezone,data))};
}
