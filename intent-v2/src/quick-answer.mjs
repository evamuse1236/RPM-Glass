/**
 * Plain questions about the day that need no model: the whole message must be one of these, so anything
 * with more in it ("what's planned today, and move gym to 6") still goes to the model.
 */
const DAY='(?:today|tonight|tomorrow)';
const PATTERNS=[
 {kind:'agenda',re:new RegExp(`^(?:what(?:'s| is) (?:planned|on|happening|scheduled)(?: for)? ${DAY}|(?:give me|show(?: me)?|what(?:'s| is)) (?:my )?(?:${DAY}(?:'s)? )?(?:timetable|schedule|agenda|plan|day)(?: for)?(?: ${DAY})?|(?:my )?(?:${DAY}(?:'s)? )?(?:timetable|schedule|agenda|plan)(?: for)?(?: ${DAY})?)$`)},
 {kind:'next',re:/^(?:what(?:'s| is) next|what(?:'s| is) (?:my )?next (?:task|thing|item)|what should i (?:do|work on) (?:now|next))$/},
 {kind:'water',re:/^(?:how much water(?: have i (?:had|drunk|drank))?(?: today)?|(?:my )?water(?: today)?)$/},
 {kind:'meals',re:/^(?:what (?:did|have) i (?:eat|eaten|had)(?: today)?|(?:my )?meals(?: today)?)$/}
];

const clean=raw=>raw.toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').replace(/^(?:hey|ok|okay|so|please)[, ]+/,'').replace(/[, ]+please$/,'').replace(/[?.!\s]+$/,'').trim();

function isoDay(date,timezone){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=t=>parts.find(p=>p.type===t).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The answer card for a plain day question, or null when the model should read the words. */
export function quickAnswer(raw,{now,timezone='Asia/Kolkata'}){
 if(typeof raw!=='string'||raw.length>120)return null;
 const text=clean(raw),match=PATTERNS.find(p=>p.re.test(text));
 if(!match)return null;
 const day=new Date(now);if(/\btomorrow\b/.test(text))day.setTime(day.getTime()+86400000);
 return {kind:match.kind,day:match.kind==='agenda'?isoDay(day,timezone):null,targetId:null};
}
