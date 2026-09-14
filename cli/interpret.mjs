import * as chrono from 'chrono-node';
export const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const formatTime = value => new Date(value).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const hasDay = c => ['day','weekday','month','year'].some(k=>c.isCertain(k));
const clock = c => c.isCertain('hour');

/** Explicit calendar choices only; an implied day from "afternoon" is not one. */
export function statedDays(raw,now=new Date()) {
  const text=raw.replace(/\bday after tomorrow\b/gi,'in 2 days');
  return [...new Set(chrono.parse(text,now,{forwardDate:true}).filter(r=>hasDay(r.start)).map(r=>localDate(r.start.date())))];
}

/** Keep the parser's evidence and assumptions alongside the untouched input. */
export function interpretTime(raw, now = new Date()) {
  const base={parser:'chrono-node',reference:now.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,matched:[],assumptions:[],candidates:[],planned:null,plannedDate:null,status:'none'};
  // "for 20 minutes" is a duration, while "in 20 minutes" is a start time.
  const normalized=raw.replace(/\b(?:the\s+)?day after tomorrow\b/gi, "in 2 days").replace(/\b(?:the\s+)?day after tmrw\b/gi,"in 2 days").replace(/\b(?:tmrw|tmr)\b/gi,"tomorrow").replace(/\b(\d{1,2})\.(\d{2})\s*([ap]\.?m\.?)/gi,"$1:$2 $3");
  const spoken={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
  const clockText=normalized.replace(/\b(half past|quarter past|quarter to)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,(_,part,h)=>`${part.toLowerCase()==='quarter to'?(spoken[h.toLowerCase()]+10)%12+1:spoken[h.toLowerCase()]}:${part.toLowerCase()==='half past'?'30':part.toLowerCase()==='quarter to'?'45':'15'}`).replace(/\bat\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,(_,h)=>'at '+spoken[h.toLowerCase()]).replace(/(\d(?::\d{2})?)\s*(?:o'clock\s*)?in the (morning|afternoon|evening)\b/gi,(_,h,p)=>h+(p.toLowerCase()==='morning'?'am':'pm'));
  base.normalized=clockText;
  const text=clockText.replace(/\bfor\s+(?:(?:\d+(?:\.\d+)?|one|two|three|ten|fifteen|twenty|thirty|forty[- ]five|sixty|half an?)\s+)(?:minutes?|mins?|m\b|hours?|hrs?|h\b)/gi,m=>' '.repeat(m.length));
  const results=chrono.parse(text,now,{forwardDate:true});
  base.matched=results.map(r=>({text:clockText.slice(r.index,r.index+r.text.length),index:r.index,known:{...r.start.knownValues},implied:{...r.start.impliedValues}}));
  if(!results.length){if(/\b(today|tomorrow|at\s+\d|\d{4}-\d{2}-\d{2})\b|\d\s*[ap]\.?m\.?/i.test(text)){base.status='review';base.reason='I could not resolve that date or time.';}return base;}
  if(/\b(every|daily|weekly|monthly)\b/i.test(text)){return {...base,status:'review',reason:'This sounds recurring. Recurrence is not implemented yet.'};}
  let start=results[0].start, explicitDay=hasDay(start), source=results[0].text;
  if(results.some(r=>r.end))return {...base,status:'review',reason:'This contains a time range. Choose a start time.'};
  if(results.length>1){
    const dates=results.filter(r=>hasDay(r.start)&&!clock(r.start));
    const times=results.filter(r=>clock(r.start)&&!hasDay(r.start));
    if(results.length===2&&dates.length===1&&times.length===1){
      const d=dates[0].start.date(),t=times[0].start;
      const combined=chrono.parse(`${localDate(d)} ${times[0].text}`,now,{forwardDate:true});
      if(combined.length!==1||!clock(combined[0].start))return {...base,status:'review',reason:'The date and time need clarification.'};
      start=combined[0].start;explicitDay=true;source=times[0].text;
    }else{
      base.candidates=results.filter(r=>clock(r.start)&&r.start.date()>now).map(r=>({at:r.start.date().toISOString(),label:formatTime(r.start.date()),source:r.text}));
      return {...base,status:'review',reason:'There is more than one possible date or time.'};
    }
  }
  if(!clock(start)){
    // Do not turn Chrono's implied noon into a time the user chose.
    base.plannedDate=localDate(start.date());base.status='date_only';
    if(/\bat\s+\d|\d+:\d+/.test(text)){base.reason='The date was recognized, but the clock time needs correction.';base.status='review';}
    return base;
  }
  let d=start.date();
  const bareClock=!start.isCertain('meridiem')&&start.get('hour')>=1&&start.get('hour')<=12&&!start.isCertain('timezoneOffset')&&!/\d{1,2}:\d{2}|\b(noon|midnight|morning|afternoon|evening|night)\b/i.test(source);
  if(bareClock){
    if(!explicitDay){
      const candidates=[start.get('hour')%12,start.get('hour')%12+12].map(h=>{const x=new Date(now);x.setHours(h,start.get('minute')||0,0,0);if(x<=now)x.setDate(x.getDate()+1);return x;}).sort((a,b)=>a-b);d=candidates[0];
    }
    base.assumptions.push(`AM/PM wasn't specified; using ${d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}.`);
    const alternate=new Date(d);alternate.setHours((d.getHours()+12)%24);if(alternate>now)base.candidates.push({at:alternate.toISOString(),label:formatTime(alternate)});
  }
  if(!explicitDay)base.assumptions.push('No day specified; using the next occurrence.');
  if(d<=now)return {...base,status:'review',reason:'That explicit time is in the past. I kept it in your original text instead of moving it silently.'};
  // Reject a clock silently rolled through a DST gap in the machine's local zone.
  if(!start.isCertain('timezoneOffset')&&!bareClock&&(d.getHours()!==start.get('hour')||d.getMinutes()!==start.get('minute')))return {...base,status:'review',reason:'That local clock time falls in a clock-change gap.'};
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
