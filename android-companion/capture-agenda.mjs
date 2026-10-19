import {occurrences,repeats} from './planner-recurrence.mjs';
import {localDay,shiftDay} from './planner-state.mjs';
import {WATER_DEFAULTS,SLOT_NAMES,mealText} from './body-state.mjs';

const open=e=>(e.kind??'plan')==='plan'&&!e.archived&&e.state!=='cancelled';
const blockTitle=(data,id)=>id?(data.planner?.blocks??[]).find(b=>b.id===id)?.title??null:null;
const bounds=day=>{const start=new Date(day+'T00:00:00');const end=new Date(start);end.setDate(end.getDate()+1);return [+start,+end];};

function taskItem(data,e,start=null,end=null){
 return {kind:'task',id:e.id,title:e.title,start,end,done:!!e.done,must:e.must===true,block:blockTitle(data,e.blockId),occurrence:null};
}

/** Every task and calendar event on a day, timed ones in order, then the ones with only a date. */
export function dayAgenda(data,{day=localDay(),events=[]}={}){
 const [from,to]=bounds(day),timed=[],anytime=[];
 for(const e of (data.entries??[]).filter(open)){
  if(repeats(e)&&e.planned){for(const o of occurrences(e,from,to))timed.push({...taskItem(data,e,o.start,o.end),occurrence:o.occurrence});continue;}
  const at=e.planned?Date.parse(e.planned):NaN;
  if(Number.isFinite(at)&&at>=from&&at<to)timed.push(taskItem(data,e,at,Number.isInteger(e.minutes)&&e.minutes>0?at+e.minutes*60000:null));
  else if(!e.planned&&e.plannedDate===day)anytime.push(taskItem(data,e));
 }
 for(const ev of events)if(ev.end>from&&ev.start<to)timed.push({kind:'event',id:ev.id,title:ev.title,start:ev.start,end:ev.end,done:false,must:false,block:null,allDay:!!ev.allDay});
 timed.sort((a,b)=>a.start-b.start||(a.kind==='event'?-1:1));
 return {day,timed,anytime};
}

/** The first thing still ahead: what is happening now, or the next timed item today or tomorrow. */
export function nextItem(data,{events=[],now=new Date()}={}){
 const today=localDay(now);
 for(const day of [today,shiftDay(today,1)]){
  const item=dayAgenda(data,{day,events}).timed.find(i=>!i.done&&(i.end??i.start+30*60000)>+now);
  if(item)return {...item,now:item.start<=+now};
 }
 return null;
}

/** Water, meals and routines for a day when RPM logs them (planner.body); otherwise null. */
export function bodyToday(data,{now=new Date()}={}){
 const body=data?.planner?.body;
 if(!body)return null;
 const day=localDay(now),onDay=at=>localDay(new Date(at))===day;
 const goal=body.water?.settings?.goal??WATER_DEFAULTS.goal;
 const glasses=(body.water?.glasses??[]).filter(onDay).length;
 const meals=(body.meals??[]).filter(m=>onDay(m.at)).map(m=>({slot:SLOT_NAMES[m.slot]??m.slot,text:mealText(m),...(m.state==='skipped'?{state:'skipped'}:{})}));
 const routines=(body.routines??[]).map(r=>{const run=(body.runs??[]).find(x=>x.routineId===r.id&&x.day===day);const steps=r.steps?.length??0;const done=run?Object.values(run.marks??{}).filter(m=>m?.state==='done').length:0;return {name:r.name,start:r.start,end:r.end,steps,done};});
 return {water:{glasses,goal},meals,routines};
}
