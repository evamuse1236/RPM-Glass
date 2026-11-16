const fixed=new Set(['daily','weekly','weekdays','days']);
/** A weekday (0 Sunday to 6 Saturday) a repeat lands on: weekdays skip the weekend, chosen days keep only those. */
export const repeatsOn=(e,weekday)=>e.recurrence==='weekdays'?weekday>0&&weekday<6:e.recurrence==='days'?(e.repeatDays??[]).includes(weekday):true;
export const repeats=e=>fixed.has(e.recurrence)&&(e.recurrence!=='days'||!!e.repeatDays?.length)||Number.isInteger(e.repeatAfterDays)&&e.repeatAfterDays>0;
export function occurrences(e,start,end){
  if(!e.planned||e.done||e.archived||e.state==='cancelled')return [];
  const base=new Date(e.planned),minutes=e.minutes??0,rows=[];
  if(!Number.isFinite(+base))return rows;
  const add=d=>{const key=d.toISOString();if(+d<end&&(minutes?+d+minutes*60000>start:+d>=start)&&!(e.completedOccurrences??[]).includes(key))rows.push({...e,occurrence:key,start:+d,end:+d+minutes*60000,source:'rpm'});};
  if(!repeats(e)||e.repeatAfterDays){add(base);return rows;}
  // Jump near the requested window in calendar days; preserve local clock through DST.
  const from=new Date(start-minutes*60000),step=e.recurrence==='weekly'?7:1;
  const days=Math.floor((Date.UTC(from.getFullYear(),from.getMonth(),from.getDate())-Date.UTC(base.getFullYear(),base.getMonth(),base.getDate()))/86400000);
  // Each step counts from base, so a day whose clock time does not exist (moved to 3:30) never shifts the days after it.
  const first=Math.max(0,Math.floor(days/step)),at=k=>{const d=new Date(base);d.setDate(base.getDate()+(first+k)*step);return d;};
  for(let i=0,d=at(0);i<400&&+d<end;d=at(++i))if(repeatsOn(e,d.getDay()))add(d);
  return rows;
}
export function nextOccurrence(e,now=new Date()){
  const start=new Date(now);start.setHours(0,0,0,0);
  return occurrences(e,+start,+start+370*86400000)[0]?.occurrence??e.planned;
}
/** Explicit completion, not a boolean that stops the entire recurring series. */
export function completeTask(e,occurrence,now=new Date()){
  if(!repeats(e)){e.done=true;e.state='done';return;}
  const key=occurrence??nextOccurrence(e,now);
  if(!key||!Number.isFinite(Date.parse(key)))throw new Error('Schedule this repeating task first.');
  const valid=occurrences(e,Date.parse(key),Date.parse(key)+1).some(r=>r.occurrence===key);
  if(!valid)throw new Error('This occurrence was already completed or changed.');
  if(e.repeatAfterDays){
    const next=new Date(now);next.setDate(next.getDate()+e.repeatAfterDays);const clock=new Date(e.planned);next.setHours(clock.getHours(),clock.getMinutes(),0,0);e.planned=next.toISOString();
  }else e.completedOccurrences=[...(e.completedOccurrences??[]),key].slice(-512);
  e.completions=[...(e.completions??[]),{occurrence:key,completed:now.toISOString()}].slice(-512);
  e.done=false;e.state='active';
}
