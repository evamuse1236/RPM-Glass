// Presentation of already-resolved dates only. This module never parses input.
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
