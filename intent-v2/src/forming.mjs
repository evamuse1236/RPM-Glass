import {interpretTime,durationFromText,inferAlert} from '../../cli/interpret.mjs';
import {capitalizeTitle} from '../../cli/title.mjs';

export const FORMING_LIMIT=6;
const UNIT=String.raw`(\d+)\s*(min(?:ute)?s?|hours?|hrs?|h)\b`;
const WEEKDAY='(?:mon|tues|wednes|thurs|fri|satur|sun)day';
const LEAD=new RegExp(String.raw`\s*\b${UNIT}\s+(?:before|early|earlier|ahead)\b`,'i');
const REMIND=/,?\s*\b(?:and\s+)?(?:remind me|(?:set|with|add)\s+(?:me\s+)?an?\s+reminder|reminder)\b(?:\s+to\b)?/i;
const ALARM=/,?\s*\b(?:(?:and\s+)?(?:with|set|add)\s+(?:me\s+)?an?\s+)?alarm\b/i;
const WAKE=/\bwake\s+me(?:\s+up)?\b/i;
const MUST=/,?\s*\b(?:(?:i\s+|it'?s\s+an?\s+)?must)\b/i;
const LENGTH=/\s*\bfor\s+(?:about\s+)?(\d+|an?|one|two|three|half an?)\s*(minutes?|mins?|hours?|hrs?|h)\b/i;
const REPEATS=[
 [new RegExp(String.raw`\bevery\s+(${WEEKDAY})\b`,'i'),m=>({recurrence:'weekly',keep:m[1]})],
 [/\bevery\s+other\s+day\b/i,()=>({repeatAfterDays:2})],
 [/\bevery\s+(\d{1,3})\s+days\b/i,m=>({repeatAfterDays:Number(m[1])})],
 [/\b(?:every\s+weekdays?|on\s+weekdays)\b/i,()=>({recurrence:'weekdays'})],
 [/\b(?:every\s+(?:day|morning|evening|night)|daily)\b/i,()=>({recurrence:'daily'})],
 [/\b(?:every\s+week|weekly)\b/i,()=>({recurrence:'weekly'})],
];
const minutesOf=(n,unit)=>{const count=/^half/i.test(n)?.5:/^(?:an?|one)$/i.test(n)?1:n==='two'?2:n==='three'?3:Number(n);return Math.round(count*(/^h/i.test(unit)?60:1));};

export function formingClauses(text){
 return String(text??'').split(/(?<=[.!?;])\s+|\n+/).map(s=>s.trim()).filter(s=>/\p{L}{2}/u.test(s));
}

function tidy(text){
 return text.replace(/\s+,/g,',').replace(/[,.;!]+(?=\s|$)/g,' ').replace(/\s{2,}/g,' ').trim()
  .replace(/^(?:please\s+|to\s+|and\s+)+/i,'').replace(/\s+(?:and|at|on|by|to|with)$/i,'').trim();
}

export function readFormingClause(clause,{now=new Date()}={}){
 let rest=clause.replace(/[’]/g,"'"),alert=null,leadMinutes=null,minutes=null,must=false,recurrence=null,repeatAfterDays=null;
 const lead=rest.match(LEAD);
 const stated=inferAlert(clause);
 if(stated.type===null&&/no\b/i.test(stated.reason))rest=rest.replace(/\b(?:no|without|don't set|do not set)\s+(?:an?\s+)?(?:alarm|reminder|alert)\b/i,' ');
 else if(WAKE.test(rest)||/\balarm\b/i.test(rest))alert='alarm';
 else if(REMIND.test(rest))alert='reminder';
 if(alert&&lead){leadMinutes=minutesOf(lead[1],lead[2]);rest=rest.replace(lead[0],' ');}
 rest=rest.replace(REMIND,' ').replace(ALARM,' ');
 const wake=WAKE.test(rest);
 if(wake)rest=rest.replace(WAKE,'Wake up');
 if(MUST.test(rest)){must=true;rest=rest.replace(MUST,' ');}
 for(const [re,read] of REPEATS){
  const m=rest.match(re);if(!m)continue;
  const found=read(m);recurrence=found.recurrence??null;repeatAfterDays=found.repeatAfterDays??null;
  rest=rest.replace(m[0],found.keep?' on '+found.keep:' ');break;
 }
 const length=rest.match(LENGTH);
 if(length){minutes=durationFromText(length[0])??minutesOf(length[1],length[2]);rest=rest.replace(length[0],' ');}
 if(minutes!==null&&(minutes<1||minutes>1440))minutes=null;
 rest=tidy(rest);
 const subject=wake?'wake me up '+clause:clause;
 const time=rest?interpretTime(rest,now,{inferBareClock:true,subject}):null;
 const read=['parsed','date_only'].includes(time?.status);
 let title=rest;
 if(read)for(const m of time.matched){
  const at=title.toLowerCase().indexOf(m.text.toLowerCase());
  if(at<0)continue;
  const before=title.slice(0,at).replace(/\s*\b(?:on|at|by|in|for)\s*$/i,' ');
  title=before+' '+title.slice(at+m.text.length);
 }
 title=tidy(title);
 if(!title)title=wake?'Wake up':alert==='alarm'?'Alarm':alert==='reminder'?'Reminder':'';
 return {source:clause,title:title?capitalizeTitle(title):'',
  planned:read?time.planned:null,plannedDate:read?time.plannedDate:null,
  minutes,alert,leadMinutes,recurrence,repeatAfterDays,must};
}

export function readForming(text,{now=new Date(),limit=FORMING_LIMIT}={}){
 return formingClauses(text).slice(-limit).filter(c=>!/\?\s*$/.test(c)).map(c=>readFormingClause(c,{now})).filter(r=>r.title);
}
