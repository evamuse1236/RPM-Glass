import {normalizeSpokenTime} from './spoken-time.mjs';
import * as chrono from 'chrono-node';
export const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const formatTime = value => new Date(value).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export const normalizeReminderTime=raw=>raw.replace(/^\s*in\s+(\d+)\s*$/i,'in $1 minutes');
const hasDay = c => ['day','weekday','month','year'].some(k=>c.isCertain(k));
const clock = c => c.isCertain('hour');

// Local DST gaps and repeated wall clocks need a timezone/offset decision.
function clockProblem(component) {
  if(component.isCertain('timezoneOffset'))return null;
  const d=component.date();
  if(d.getHours()!==component.get('hour')||d.getMinutes()!==component.get('minute'))return 'That local clock time falls in a clock-change gap.';
  for(const delta of [-120,-60,-30,30,60,120]){
    const other=new Date(+d+delta*60000);
    if(localDate(other)===localDate(d)&&other.getHours()===d.getHours()&&other.getMinutes()===d.getMinutes())return 'That local clock time occurs twice during a clock change. Include a timezone offset.';
  }
  return null;
}
function rangeTime(result,base,text,now) {
  const review=reason=>({...base,status:'review',reason});
  if(!hasDay(result.start)){
    const current=chrono.parse(result.text,now,{forwardDate:false})[0];
    if(current?.end&&current.end.date()-current.start.date()===result.end.date()-result.start.date()&&current.start.date()<=now&&current.end.date()>now)result=current;
  }
  const {start,end}=result;
  if(!clock(start)||!clock(end))return review('Choose a single day and a start and end clock time.');
  // A shared AM/PM suffix is conventional (2–3pm). Two bare clocks are not.
  if(!start.isCertain('meridiem')&&!end.isCertain('meridiem')&&!(result.text.match(/\b\d{1,2}:\d{2}\b/g)?.length>=2))return review('AM or PM? Include it in the range, or use 24-hour times.');
  const problem=clockProblem(start)||clockProblem(end);if(problem)return review(problem);
  let from=start.date();const to=end.date(),minutes=(to-from)/60000;
  if(to<=now)return review('That time range is in the past. Choose a future end time.');
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440)return review('Choose an end after the start, with a duration of 1–1440 minutes.');
  // Chrono rolls a reversed clock to tomorrow. Accept normal overnight clocks,
  // but never silently interpret 3pm–2pm as a 23-hour task.
  const explicitEndDay=/\b(?:to|until|through|-)\s*(?:tomorrow|today|next|\d{4}-\d{2}-\d{2}|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/i.test(result.text);
  if(localDate(from)!==localDate(to)&&minutes>12*60&&!explicitEndDay)return review('Does this range end on the following day? Include the end date.');
  const statedDuration=durationFromText(text);
  if(statedDuration===null&&/\bfor\s+[-+\d.]+\s*(?:minutes?|mins?|hours?|hrs?)\b/i.test(text))return review('Use a duration of 1–1440 whole minutes.');
  if(statedDuration!==null&&statedDuration!==minutes)return review(`The time range is ${minutes} minutes, but the stated duration is ${statedDuration}. Choose which to keep.`);
  if(!hasDay(start))base.assumptions.push('No day specified; using the next occurrence.');
  if(start.isCertain('meridiem')!==end.isCertain('meridiem'))base.assumptions.push('Using the shared AM/PM marker for the range.');
  if(localDate(from)!==localDate(to))base.assumptions.push('The range ends on the following day.');
  if(from<now){from=new Date(now);base.assumptions.push('This range is already running; starting now and keeping its stated end.');}
  return {...base,status:'parsed',planned:from.toISOString(),plannedDate:localDate(from),end:to.toISOString(),minutes:Math.ceil((to-from)/60000)};
}

/** Small, explicit transliteration vocabulary; untouched source stays in the journal. */
export function normalizeLocalTime(raw,{evidence=raw}={}){
 let text=raw,reason=null;
 // Near-future conversational window: keep today's day, never invent its clock.
 if(/^thodi\s+der\s+mein$/i.test(text.trim()))text='today';
 const hindiHours={ek:1,do:2,teen:3,chaar:4,char:4,paanch:5,panch:5,chhe:6,che:6,saat:7,aath:8,nau:9,das:10,gyarah:11};
 text=text.replace(/\b(?:saade|saadhe|sadhe)\s+(ek|do|teen|chaar|char|paanch|panch|chhe|che|saat|aath|nau|das|gyarah)(?=\s+baje\b)/gi,(_,h)=>`${hindiHours[h.toLowerCase()]}:30`);
 if(/^(?:make it\s+)?(?:the\s+)?day after(?:[,\s]+(?:instead|same time))*[.!]?$/i.test(text.trim()))text='in 2 days';
 if(/^(?:\s*kal)\b|\bkal\s+(?:subah|sakali|shaam|raat|dopahar|\d)/i.test(text)){
  // "karna hai", "leni hai", "jana hai": an infinitive with "hai" says it still has to happen.
  const future=/\b(?:karna hai|karni hai|karne hain|karunga|karungi|karo|remind me|schedule|tomorrow|utha dena)\b|\b\w+(?:na|ni|ne)\s+(?:hai|hain|h)\b/i.test(evidence);
  const past=/\b(?:kiya|ki thi|kiya tha|gaya|gayi|tha|thi|yesterday)\b/i.test(evidence);
  if(!future||past)reason='Does “kal” mean tomorrow or yesterday? Use an explicit day.';
  else text=text.replace(/\bkal\b/gi,'tomorrow');
 }
 text=text.replace(/\budya\b/gi,'tomorrow').replace(/\baaj\b/gi,'today').replace(/\bparso[n]?\b/gi,'in 2 days')
  .replace(/\b(?:shaam|sham)(?:\s+ko)?\b/gi,'evening').replace(/\braat(?:\s+ko)?\b/gi,'night').replace(/\bdopahar(?:\s+ko)?\b/gi,'afternoon');
 const morning=text.match(/\b(?:subah|sakali)\s+(\d{1,2})(?::(\d{2}))?\s*(?:baje|vajta|vajata|am|a\.m\.?)\b/i);
 if(morning&&(Number(morning[1])<1||Number(morning[1])>=12||Number(morning[2]??0)>59||/\bpm\b/i.test(text)))reason='The morning clock is unclear. Use an explicit time such as 8 AM.';
 text=text.replace(/\b(subah|sakali)\s+(\d{1,2}(?::\d{2})?)\s*(?:baje|vajta|vajata)\b/gi,(_,period,h)=>`at ${h}am`)
  .replace(/\b(subah|sakali)\s+(\d{1,2}(?::\d{2})?)\s*(?:am|a\.m\.?)\b/gi,(_,period,h)=>`at ${h}am`)
  .replace(/\b(subah|sakali)\b/gi,'morning');
 // Never let a leftover explicit clock silently degrade to a date-only result.
 if(/\b(?:baje|vajta|vajata)\b/i.test(text))text=text.replace(/\b(\d{1,2}(?::\d{2})?)\s*(?:baje|vajta|vajata)\b/gi,'at $1');
 return {text,reason};
}

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// "by the 16th" names a day of the month without one: the next 16th, this month or the following one.
function dayOfMonth(text,now){
 return text.replace(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)/gi,(match,n)=>{
  const day=Number(n);if(day<1||day>31)return match;
  const month=day>=now.getDate()?now.getMonth():now.getMonth()+1,at=new Date(now.getFullYear(),month,day);
  return at.getDate()===day?`${day} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`:match;
 });
}
/** Explicit calendar choices only; an implied day from "afternoon" is not one. */
export function statedDays(raw,now=new Date()) {
  const text=raw.replace(/\bday after tomorrow\b/gi,'in 2 days');
  return [...new Set(chrono.parse(text,now,{forwardDate:true}).filter(r=>hasDay(r.start)).map(r=>localDate(r.start.date())))];
}

function semanticClockPeriod(subject,hour){
 const morning=/\b(?:wake(?:\s+me)?\s+up|morning|breakfast|subah|sakali)\b/i.test(subject);
 const evening=/\b(?:dinner|evening|night|raat|shaam|sham|after\s+work)\b/i.test(subject);
 if(morning===evening)return null;
 if(morning&&hour>=5&&hour<=11)return 'morning';
 return evening?'evening':null;
}

/** Keep the parser's evidence and assumptions alongside the untouched input. */
export function interpretTime(raw, now = new Date(), options = {}) {
  const base={parser:'chrono-node',reference:now.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,matched:[],assumptions:[],candidates:[],planned:null,plannedDate:null,end:null,minutes:null,status:'none'};
  const localized=normalizeLocalTime(raw,options);
  if(localized.reason)return {...base,status:'review',reason:localized.reason,normalized:localized.text};
  // "for 20 minutes" is a duration, while "in 20 minutes" is a start time.
  const normalized=dayOfMonth(localized.text,now).replace(/\b(?:the\s+)?day after tomorrow\b/gi, "in 2 days").replace(/\b(?:the\s+)?day after tmrw\b/gi,"in 2 days").replace(/\b(?:tmrw|tmr)\b/gi,"tomorrow").replace(/\b(\d{1,2})\.(\d{2})\s*([ap]\.?m\.?)/gi,"$1:$2 $3");
  const rangeText=normalizeSpokenTime(normalized).replace(/(\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\s*(?:to|until|till|[–—-])\s*)(0[1-9]|1[0-2])([0-5]\d)\b(?!\s*[ap]\.?m)/gi,(_,prefix,startHour,startMinute,period,hour,minute)=>{
    const start=(Number(startHour)%12+(/^p/i.test(period)?12:0))*60+Number(startMinute??0),end=Number(hour)%12*60+Number(minute);
    const am=(end-start+1440)%1440||1440,pm=(end+720-start+1440)%1440||1440;
    return `${prefix}${hour}:${minute} ${am<pm?'am':'pm'}`;
  });
  base.normalized=rangeText;
  // A window such as "this week", "next week" or "someday" names no day. Chrono would pick one, so keep it undated.
  if(/\b(?:this|next|coming)\s+(?:week|weekend|month)\b|\bsome\s?(?:day|time)\b|\bsoon\b|\blater\b|\beventually\b/i.test(rangeText)
    &&!/\b(?:today|tonight|tomorrow|(?:mon|tues|wednes|thurs|fri|satur|sun)day|\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})\b/i.test(rangeText))return base;
  const text=rangeText.replace(/\b(?:for now|from now on|not now|until now)\b/gi,m=>' '.repeat(m.length)).replace(/\bnow\s+(\d+\s*(?:minutes?|mins?|hours?|hrs?))\b/gi,'now').replace(/\bfor\s+(?:(?:\d+(?:\.\d+)?|one|two|three|ten|fifteen|twenty|thirty|forty[- ]five|sixty|half an?)\s+)(?:minutes?|mins?|m\b|hours?|hrs?|h\b)/gi,m=>' '.repeat(m.length));
  let results=chrono.parse(text,now,{forwardDate:true});
  // Meal and bedtime windows mean today's routine unless a day was supplied.
  // Keep the window in the interpretation; it never supplies a clock or duration.
  if(/\b(?:after|before)\s+(?:breakfast|lunch|dinner)\b|\bbefore\s+bed\b/i.test(text)&&!results.some(r=>clock(r.start)||hasDay(r.start)))
    return {...base,status:'date_only',plannedDate:localDate(now),assumptions:['No day specified; using today for the meal or bedtime window.']};
  if(options.inferBareClock){
    const times=results.filter(r=>clock(r.start));
    if(times.length===1&&results.every(r=>r===times[0]||!hasDay(r.start)&&/^(?:morning|afternoon|evening|night)$/i.test(r.text)))results=times;
  }
  base.matched=results.map(r=>({text:rangeText.slice(r.index,r.index+r.text.length),index:r.index,known:{...r.start.knownValues},implied:{...r.start.impliedValues},...(r.end?{end:{known:{...r.end.knownValues},implied:{...r.end.impliedValues}}}:{})}));
  if(!results.length){if(/\b(today|tomorrow|at\s+\d|\d{4}-\d{2}-\d{2})\b|\d\s*[ap]\.?m\.?/i.test(text)){base.status='review';base.reason='I could not resolve that date or time.';}return base;}
  if(/\b(every|daily|weekly|monthly)\b/i.test(text)){return {...base,status:'review',reason:'This sounds recurring. Choose a single date and time, then set repetition separately.'};}
  let result=results[0],start=result.start,explicitDay=hasDay(start),source=result.text;
  if(results.length>1){
    const dates=results.filter(r=>hasDay(r.start)&&!clock(r.start));
    const times=results.filter(r=>clock(r.start)&&!hasDay(r.start));
    if(results.length===2&&dates.length===1&&times.length===1){
      const d=dates[0].start.date();
      const combined=chrono.parse(`${localDate(d)} ${times[0].text}`,now,{forwardDate:true});
      if(combined.length!==1||!clock(combined[0].start))return {...base,status:'review',reason:'The date and time need clarification.'};
      result=combined[0];start=result.start;explicitDay=true;source=times[0].text;
    }else{
      base.candidates=results.filter(r=>clock(r.start)&&r.start.date()>now).map(r=>({at:r.start.date().toISOString(),label:formatTime(r.start.date()),source:r.text}));
      return {...base,status:'review',reason:'There is more than one possible date or time.'};
    }
  }
  if(result.end)return rangeTime(result,base,rangeText,now);
  // A partially parsed range must not silently become a single-time task.
  if(/\b(?:from|between)\s+\d|\d\s*(?:[ap]\.?m\.?)?\s*(?:to|until|through|[–—])(?:\s|$)|\d(?:[ap]m)\s*-\s*(?:\d|$)/i.test(text))return {...base,status:'review',reason:'I could not resolve both ends of that time range. Include a valid start and end time.'};
  // "evening" alone names neither a day nor a clock: leave it undated rather than take Chrono's implied today.
  if(!clock(start)&&!hasDay(start))return base;
  if(!clock(start)){
    // Do not turn Chrono's implied noon into a time the user chose.
    base.plannedDate=localDate(start.date());base.status='date_only';
    // "before the 16th" is due the day before it, never on it (and never before today).
    if(/\bbefore\s+(?:the\s+)?$/i.test(text.slice(0,result.index))){
      const day=start.date();day.setDate(day.getDate()-1);
      if(localDate(day)>=localDate(now)){base.plannedDate=localDate(day);base.assumptions.push(`Due before ${result.text}; using the day before.`);}
    }
    if(/\bat\s+\d|\d+:\d+/.test(text)){base.reason='The date was recognized, but the clock time needs correction.';base.status='review';}
    return base;
  }
  let d=start.date();
  const semantic=options.inferBareClock?semanticClockPeriod(`${options.subject??''} ${raw}`,start.get('hour')%12||12):null;
  const writtenPeriod=/(?:\d\s*[ap]\.?m\.?\b)|\b(?:am|pm|noon|midnight)\b|(?:^|\s)0\d:|\bat\s+(?:1[3-9]|2[0-3])\b|\b(?:1[3-9]|2[0-3]):\d{2}\b/i.test(raw);
  const bareClock=!start.isCertain('timezoneOffset')&&(semantic&&!writtenPeriod||!start.isCertain('meridiem')&&start.get('hour')>=1&&start.get('hour')<=12&&!/\b(noon|midnight|morning|afternoon|evening|night)\b/i.test(source)&&!/(?:^|\s)0\d:/.test(source)&&(options.inferBareClock||!/\d{1,2}:\d{2}/.test(source)));
  if(bareClock){
    const period=semantic;
    if(period){
      d=explicitDay?d:new Date(now);
      d.setHours(start.get('hour')%12+(period==='evening'?12:0),start.get('minute')||0,0,0);
      if(!explicitDay&&d<=now)d.setDate(d.getDate()+1);
    }else if(!explicitDay){
      const candidates=[start.get('hour')%12,start.get('hour')%12+12].map(h=>{const x=new Date(now);x.setHours(h,start.get('minute')||0,0,0);if(x<=now)x.setDate(x.getDate()+1);return x;}).sort((a,b)=>a-b);d=candidates[0];
      if(d-now>12*3600000)return {...base,status:'review',reason:'That clock needs a timezone decision.'};
    }else if(options.inferBareClock){
      const subject=options.subject??'',hour=start.get('hour');
      const morning=/\b(?:wake|breakfast|run)\b|\bgym\s+morning\b/i.test(subject),evening=/\b(?:dinner|after work)\b/i.test(subject);
      const pm=hour===12||(hour<=6?!morning:evening);
      d.setHours(hour%12+(pm?12:0),start.get('minute')||0,0,0);
    }
    const alternate=new Date(d);alternate.setHours((d.getHours()+12)%24);
    if(options.inferBareClock&&!explicitDay&&alternate<=now)alternate.setDate(alternate.getDate()+1);
    const label=date=>`${date.getHours()%12||12}${date.getMinutes()?':'+String(date.getMinutes()).padStart(2,'0'):''} ${date.getHours()<12?'AM':'PM'}`;
    if(options.inferBareClock){
      base.inference={rule:explicitDay?'stated-day-waking':period?`semantic-${period}`:'next-12h',anchorAt:now.toISOString(),timezone:base.timezone,selectedAt:d.toISOString(),alternateAt:alternate.toISOString(),selectedLabel:label(d),alternateLabel:label(alternate)};
      base.assumptions.push(`Clock inferred by ${base.inference.rule}; using ${label(d)}.`);
    }else base.assumptions.push(`AM/PM wasn't specified; using ${label(d)}.`);
    if(alternate>now)base.candidates.push({at:alternate.toISOString(),label:formatTime(alternate)});
  }
  if(!explicitDay)base.assumptions.push('No day specified; using the next occurrence.');
  if(/^now$/i.test(source))return {...base,status:'parsed',planned:now.toISOString(),plannedDate:localDate(now),minutes:durationFromText(raw)};
  if(d<=now)return {...base,status:'review',reason:'That explicit time is in the past. I kept it in your original text instead of moving it silently.'};
  // Reject a clock silently rolled through a DST gap in the machine's local zone.
  const problem=!bareClock&&clockProblem(start);if(problem)return {...base,status:'review',reason:problem};
  return {...base,planned:d.toISOString(),plannedDate:localDate(d),status:'parsed'};
}
export function parseTime(raw,now=new Date()){return interpretTime(raw,now).planned;}
export function durationFromText(text){
  const m=text.match(/\b(?:for|spent|took)\s+(\d+(?:\.\d+)?|one|two|three|ten|fifteen|twenty|thirty|forty[- ]five|sixty|half an?)\s*(minutes?|mins?|m\b|hours?|hrs?|h\b)/i);
  const simple=m??text.match(/(?<!\bin\s)(\b\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if(!simple)return null;
  const words={one:1,two:2,three:3,ten:10,fifteen:15,twenty:20,thirty:30,'forty five':45,'forty-five':45,sixty:60,half:.5,'half an':.5};
  let n=words[simple[1].toLowerCase()]??Number(simple[1]);if(/^h/i.test(simple[2]))n*=60;
  return Number.isInteger(n)&&n>=1&&n<=1440?n:null;
}

// Evidence is retained; these are editable suggestions, never a diagnosis.
export function inferFeelings(raw) {
  const evidence=[];
  const clauses=raw.toLowerCase().replace(/[’]/g,"'").split(/[.!?;]|\bbut\b|\bnow\b/);
  const rules={mood:[['Low',/\b(sad|down|miserable|upset)\b/],['Uneasy',/\b(anxious|worried|stressed|overwhelmed|nervous)\b/],['Good',/\b(happy|good|content|calm|peaceful|proud)\b/],['Great',/\b(thrilled|delighted|fantastic|great)\b/]],energy:[['Low',/\b(tired|exhausted|drained|sleepy|worn out|low energy)\b/],['High',/\b(energized|energetic|full of energy|wide awake|high energy)\b/]]};
  const out={mood:null,energy:null,evidence};
  for(const clause of clauses){
    if(/\b(he|she|they|friend|colleague)\b/.test(clause)&&! /\b(i|i'm|feeling)\b/.test(clause))continue;
    if(/\b(yesterday|used to|earlier|was feeling)\b/.test(clause))continue;
    for(const [field,choices] of Object.entries(rules)){
      const hits=choices.flatMap(([value,re])=>{const m=re.exec(clause);if(!m)return [];const prefix=clause.slice(0,m.index);if(/\b(not|never|don't|wasn't|isn't|no longer)\b(?:\W+\w+){0,3}\W*$/.test(prefix))return [];if(field==='mood'&&!/\b(i|i'm|feel|feeling|felt)\b/.test(clause))return [];return [{field,value,text:clause.trim()}];});
      if(hits.length===1){out[field]=hits[0].value;evidence.push(hits[0]);}
      else if(hits.length>1){out[field]=null;evidence.push({field,text:clause.trim(),uncertain:true});}
    }
  }
  return out;
}
export function inferAlert(raw) {
  if(/\b(no|without|don't set|do not set)\s+(?:an?\s+)?(?:alarm|reminder|alert)\b/i.test(raw))return {type:null,reason:'You asked for no alert.'};
  if(/\bremind me\b|\breminder\b/i.test(raw))return {type:'reminder',reason:'You explicitly requested a reminder.'};
  if(/\balarm\b/i.test(raw))return {type:'alarm',reason:'You explicitly requested an alarm.'};
  if(/\b(meeting|appointment|interview|flight|train|class|webinar|must (?:be|arrive)|need to (?:be there|show up))\b/i.test(raw)&&! /\b(prepare for|notes for|plan a|schedule a|book a|cancel(?:led)?|canceled)\b/i.test(raw))return {type:'alarm',reason:'This sounds like a fixed-time commitment.'};
  return {type:'reminder',reason:'This sounds like a flexible task.'};
}
export function scheduledAlert(type,planned,now){
  const at=new Date(new Date(planned).getTime()-(type==='alarm'?600000:0));
  return {type,at:at.toISOString(),eventAt:planned,status:at>now?'scheduled':'needs_time',leadMinutes:type==='alarm'?10:0};
}
