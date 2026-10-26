import {interpretTime,normalizeReminderTime,statedDays} from '../cli/interpret.mjs';
const bareClock=/^\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*$/i;
const clockWords=text=>bareClock.test(text)?'at '+text:text.replace(/^(?:no(?: wait)?\s+)?(\d{1,2}(?::\d{2})?)\s+(?=actually\b|(?:make it )?tomorrow\b)/i,'at $1 ').replace(/(?<!\bup\s)\bto\s+(\d{1,2}(?::\d{2})?)(?=\s*(?:[ap]\.?m\.?(?:\s|$)|$|[.!?;]|(?:today|tomorrow|on|next)\b))/gi,'at $1');
function clockSubject(op,sourceOperations,input){
 return [op.fields.find(f=>f.name==='title'&&f.op==='set')?.evidence,input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId)?.title].filter(Boolean).join(' ');
}
function clocks(text,now,evidence,subject,inferBareClock=false){
 const parsed=interpretTime(clockWords(text),now,{evidence,subject,inferBareClock});
 if(parsed.status==='parsed'&&(parsed.inference||(parsed.matched.length===1&&!parsed.matched[0].end&&Object.hasOwn(parsed.matched[0].known,'timezoneOffset')))){const date=new Date(parsed.planned);return [{hour:date.getHours(),minute:date.getMinutes(),explicit:true}];}
 return parsed.matched.flatMap(match=>[match,match.end&&{...match.end,text:match.text}].filter(Boolean).filter(m=>Number.isInteger(m.known.hour)).map(m=>withPart({hour:m.known.hour,minute:m.known.minute??0,explicit:Object.hasOwn(m.known,'meridiem')||Object.hasOwn(match.end?.known??{},'meridiem')||/\d{1,2}:\d{2}|\b(?:noon|midnight)\b/i.test(m.text)||m.known.hour>12},m.text)));
}
function inferClocks(parsed,input,now,sourceOperations){
 if(parsed.mode!=='capture')return;
 for(const op of parsed.operations){
  if(op.entity!=='task'||!['create','update'].includes(op.kind))continue;
  const source=input.sourceUnits.find(u=>u.id===op.sourceId),ownsSource=sourceOperations.filter(o=>o.sourceId===op.sourceId).length===1;
  const subject=clockSubject(op,sourceOperations,input);
  for(const f of op.fields){
   if(f.name!=='time'||!['set','unknown'].includes(f.op)||f.sourceMessageId!==input.messageId)continue;
   if(f.op==='set'&&typeof f.value==='string'&&ownsSource&&source?.text.includes(f.value)&&!input.sourceUnits.some(u=>f.evidence&&u.text.includes(f.evidence)))f.evidence=f.value;
   let proof=f.evidence;
   if(!proof&&ownsSource&&source){
    const title=op.fields.find(f=>f.name==='title'&&f.op==='set'&&f.origin==='stated')?.evidence;
    const index=title?source.text.indexOf(title):-1,tail=index>=0?source.text.slice(index+title.length).trim():'';
    if(/^(?:at|in|today|tomorrow|tonight|on|next)\b/i.test(tail)&&!/[;!?]|\b(?:and|or|also|then|but|because|so|aur)\b/i.test(tail))proof=tail;
   }
   if(!proof||!input.sourceUnits.some(u=>u.text.includes(proof)))continue;
   if(/^\d{1,2}$/.test(proof.trim())&&!new RegExp(`\\b(?:at|to|by|around|about)\\s+${proof.trim()}\\b|\\b${proof.trim()}\\s+baje\\b`,'i').test(source?.text??''))continue;
   let time=interpretTime(clockWords(proof),now,{subject,inferBareClock:true});
   if(time.status!=='parsed'||!time.inference&&f.evidence)continue;
   const owner=source??input.sourceUnits.find(u=>u.text.includes(proof)),whole=owner&&interpretTime(clockWords(owner.text),now,{subject,inferBareClock:true});
   if(!f.evidence&&!whole?.matched.some(m=>Number.isInteger(m.known.hour)))continue;
   if(ownsSource&&whole.status==='parsed'){
    const a=new Date(time.planned),b=new Date(whole.planned);
    if(a.getHours()%12!==b.getHours()%12||a.getMinutes()!==b.getMinutes())continue;
    time=whole;proof=owner.text;
   }else if(!f.evidence)continue;
   const savedDay=input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId)?.savedLocalDate;
   if(savedDay&&savedDay>input.context.nowLocal?.slice(0,10)&&!statedDays(time.normalized,now).length&&!/\bthis\s+(?:morning|afternoon|evening|night)\b/i.test(proof)){
    const retainDay=iso=>{const d=new Date(iso),[y,m,day]=savedDay.split('-').map(Number);d.setFullYear(y,m-1,day);return d.toISOString();};
    time={...time,planned:retainDay(time.planned),plannedDate:savedDay,
     inference:{...time.inference,selectedAt:retainDay(time.inference.selectedAt),alternateAt:retainDay(time.inference.alternateAt)}};
   }
   Object.assign(f,{op:'set',origin:'stated',value:time.planned,evidence:proof,evidenceSourceId:input.sourceUnits.find(u=>u.text.includes(proof))?.id??null});
   if(time.inference)f.inference={...time.inference,opId:op.opId,sourceMessageId:input.messageId};else delete f.inference;
   if(parsed.question?.opId===op.opId&&parsed.question.field==='time')parsed.question=null;
  }
 }
}
// An extraction can ask for a fact already supplied. Resolve only this narrow
// case: one explicit clock in exact evidence, updating a known future saved day.
function recoverExplicitSavedClock(parsed,input,now){
 if(parsed.mode!=='capture')return;
 for(const op of parsed.operations){
  if(op.kind!=='update'||op.entity!=='task')continue;
  const target=input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId);
  if(!target?.savedLocalDate||target.savedLocalDate<input.context.nowLocal?.slice(0,10))continue;
  for(const f of op.fields){
   if(f.name!=='time'||f.op!=='unknown'||f.origin!=='stated'||f.sourceMessageId!==input.messageId||!f.evidence||!input.sourceUnits.some(u=>u.text.includes(f.evidence)))continue;
   if(!/\d\s*[ap]\.?m\.?|\d{1,2}:\d{2}|\b(?:noon|midnight)\b/i.test(f.evidence))continue;
   const time=interpretTime(f.evidence,now),match=time.matched[0];
   if(time.status!=='parsed'||time.matched.length!==1||time.assumptions.some(a=>a.startsWith("AM/PM wasn't specified"))||!f.evidence.includes(match.text)||match.text.length>100)continue;
   f.op='set';f.value=match.text;
   if(parsed.question?.opId===op.opId&&parsed.question.field==='time')parsed.question=null;
  }
 }
}
function recoverNearWindow(parsed,input,sourceOperations,now){
 for(const op of parsed.operations){
  if(op.entity!=='task'||!['create','update'].includes(op.kind)||sourceOperations.filter(o=>o.sourceId===op.sourceId).length!==1)continue;
  const source=input.sourceUnits.find(u=>u.id===op.sourceId),match=source?.text.match(/\bthodi\s+der\s+mein\b/i);
  const window=op.fields.find(f=>f.name==='time'&&f.op==='set');
  if(op.kind==='create'&&window&&source&&/\b(?:this|next|coming)\s+(?:week|weekend|month)\b/i.test(window.value)&&interpretTime(source.text,now).status==='none'&&interpretTime(window.value,now).status==='none'){
   Object.assign(window,{op:'unknown',value:null});if(parsed.question?.opId===op.opId&&parsed.question.field==='time')parsed.question=null;continue;
  }
  if(!match||statedDays(source.text,now).length||/\d|\b(?:kal|parso|aaj|or|and|aur|ya|not|nahi|at|baje|am|pm|half|quarter|thirty|fifteen|forty|fifty)\b/i.test(source.text))continue;
  const f=op.fields.find(f=>f.name==='time'&&f.op==='unknown');
  if(!f)continue;
  Object.assign(f,{op:'set',value:match[0],origin:'stated',evidence:match[0],evidenceSourceId:source.id});
  if(parsed.question?.opId===op.opId&&parsed.question.field==='time')parsed.question=null;
 }
}
// A named task's explicit due clock outranks a contradictory relative nudge.
function preferDueClock(parsed,input,now,sourceOperations){
 for(const op of parsed.operations){
  if(op.kind!=='update'||op.entity!=='task'||sourceOperations.filter(o=>o.sourceId===op.sourceId).length!==1)continue;
  const target=input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId),source=input.sourceUnits.find(u=>u.id===op.sourceId);
  if(!target?.title||!source?.text.toLowerCase().startsWith(target.title.toLowerCase()+' '))continue;
  const match=source.text.slice(target.title.length).match(/^\s+(?:is\s+)?(?:now\s+)?due at\s+(.+?)(?=\s+not\b|[,!?;]|$)/i);
  if(!match)continue;
  const clock=interpretTime(clockWords(match[1]),now,{inferBareClock:true});
  if(clock.status!=='parsed'||clock.matched.length!==1||!Number.isInteger(clock.matched[0].known.hour)||clock.end)continue;
  const f=op.fields.find(f=>f.name==='time'&&['set','unknown'].includes(f.op));if(!f)continue;
  Object.assign(f,{op:'set',value:match[1],origin:'stated',evidence:match[1],sourceMessageId:input.messageId,evidenceSourceId:source.id});
  if(parsed.question?.opId===op.opId&&parsed.question.field==='time')parsed.question=null;
 }
}
// A day-only edit may echo the saved clock. Strip only a verified unchanged
// clock, then let the canonical updater carry it to the stated day.
function normalizeInheritedClocks(parsed,input,now,sourceOperations){
 for(const op of parsed.operations){
  if(op.kind!=='update'||op.entity!=='task')continue;
  const target=input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId);
  if(!target)continue;
  const source=input.sourceUnits.find(u=>u.id===op.sourceId);
  const sameDay=sourceOperations.filter(o=>o.sourceId===op.sourceId).length===1&&(source?.text.match(/\b(?:make|move|push|change)\s+(?:it|that)\s+(?:to\s+)?((?:the\s+)?day after(?: tomorrow)?|today|tomorrow|(?:next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?:\s+instead)?[\s,]+same time[.!?]*$/i)||source?.text.match(/^(?:wait\s+)?(today|tomorrow)\s+not\s+(?:today|tomorrow)[.!?]*$/i));
  for(const f of op.fields){
   if(f.name==='time'&&f.op==='set'&&sameDay&&interpretTime(sameDay[1],now).status==='date_only'){
    Object.assign(f,{value:sameDay[1],origin:'stated',evidence:sameDay[1],sourceMessageId:input.messageId,evidenceSourceId:source.id});delete f.inference;continue;
   }
   if(!target.startLocal)continue;
   if(f.name!=='time'||f.op!=='set'||f.origin!=='stated'||f.sourceMessageId!==input.messageId||!f.evidence||!input.sourceUnits.some(u=>u.text.includes(f.evidence)))continue;
   const proof=interpretTime(f.evidence,now);
   if(proof.status!=='date_only'||proof.matched.some(m=>Number.isInteger(m.known.hour))||!statedDays(proof.normalized,now).length)continue;
   // A day-only quotation must not conceal a fresh clock in the user's words.
   if(source&&(clocks(source.text,now,source.text,'').length||looseClocks(source.text).length))continue;
   const requested=clocks(f.value,now,f.evidence,'');
   const [h,m]=target.startLocal.slice(11).split(':').map(Number);
   if(requested.length!==1||requested[0].hour!==h||requested[0].minute!==m)continue;
   const value=interpretTime(f.value,now);
   if(value.plannedDate!==proof.plannedDate)continue;
   f.value=f.evidence;
  }
 }
}
function isolateTaskClock(parsed,input,sourceOperations,now){
 for(const op of parsed.operations){
  if(op.kind!=='create'||op.entity!=='task'||sourceOperations.filter(o=>o.sourceId===op.sourceId).length<2)continue;
  const title=op.fields.find(f=>f.name==='title'&&f.origin==='stated')?.evidence,field=op.fields.find(f=>f.name==='time'&&f.op==='set');
  if(!title||!field)continue;
  const source=input.sourceUnits.find(u=>u.id===op.sourceId),clauses=source?.text.split(/\b(?:and|also|then|aur)\b/i).filter(c=>c.includes(title))??[];
  if(clauses.length!==1||statedDays(clauses[0],now).length||!statedDays(field.value,now).length)continue;
  const time=interpretTime(clauses[0],now);
  if(time.status!=='parsed'||time.inference||time.end)continue;
  Object.assign(field,{value:clauses[0].trim(),origin:'stated',evidence:clauses[0].trim(),evidenceSourceId:source.id});
 }
}
function recoverStatedStart(parsed,input,sourceOperations,now){
 for(const op of parsed.operations){
  if(op.entity!=='task'||op.kind!=='create'||sourceOperations.filter(o=>o.sourceId===op.sourceId).length!==1)continue;
  const source=input.sourceUnits.find(u=>u.id===op.sourceId),text=source?.text??'';
  if(/\b(?:and|or|also|then|but|because|so|aur)\b/i.test(text)||!(/\bnow\b/i.test(text)||/\bfrom\s+\d.+\b(?:to|until|till)\s+\d/i.test(text)))continue;
  const time=interpretTime(text,now);
  if(time.status!=='parsed'||!time.end&&time.planned!==now.toISOString())continue;
  const field=op.fields.find(f=>f.name==='time');
  const value={name:'time',op:'set',value:text,origin:'stated',evidence:text,sourceMessageId:input.messageId,evidenceSourceId:source.id};
  if(field)Object.assign(field,value);else op.fields.push(value);
  if(parsed.question?.opId===op.opId&&parsed.question.field==='time')parsed.question=null;
 }
}
// A bare clock said with its part of day ("in the morning like 9 or 10", "shaam ko 7") has stated its AM/PM.
const MORNING=/\b(?:morning|subah|sakali)\b/i,LATER=/\b(?:afternoon|evening|tonight|night|shaam|sham|raat|dopahar)\b/i;
// Bare clocks the parser skips ("like 9 or 10", "7 baje"), read only beside a time word.
function looseClocks(evidence=''){
 const out=[];
 for(const m of evidence.matchAll(/\b(?:like|around|about|at|or|by)\s+(\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2})(?::(\d{2}))?\s+(?:or|baje)\b/gi)){
  const hour=Number(m[1]??m[3]),minute=Number(m[2]??m[4]??0);
  if(hour>=1&&hour<=12&&minute<60)out.push({hour,minute,explicit:false});
 }
 return out;
}
function withPart(c,evidence=''){
 if(c.explicit||c.hour<1||c.hour>12)return c;
 const am=MORNING.test(evidence),pm=LATER.test(evidence);
 if(am===pm)return c;
 if(am&&c.hour>=5&&c.hour<=11)return {...c,explicit:true};
 if(am&&c.hour===12)return {...c,hour:0,explicit:false};
 if(pm&&c.hour<12)return {...c,hour:c.hour+12,explicit:true};
 if(pm&&c.hour===12)return {...c,explicit:true};
 return c;
}
/** A bare clock uses its own evidence and the capture anchor, never another action's period. */
export function validateIntentTimes(parsed,{input,sourceOperations=parsed.operations}){
 const now=new Date(input.context.now),raw=input.sourceUnits.map(u=>u.text).join('\n');
 isolateTaskClock(parsed,input,sourceOperations,now);
 recoverStatedStart(parsed,input,sourceOperations,now);
 recoverNearWindow(parsed,input,sourceOperations,now);
 preferDueClock(parsed,input,now,sourceOperations);
 normalizeInheritedClocks(parsed,input,now,sourceOperations);
 recoverExplicitSavedClock(parsed,input,now);
 inferClocks(parsed,input,now,sourceOperations);
 for(const op of parsed.operations)for(const field of op.fields){
  if(field.name!=='time'||field.op!=='set'||field.origin!=='stated'||(field.sourceMessageId&&field.sourceMessageId!==input.messageId))continue;
  if(!field.evidence?.trim()||!input.sourceUnits.some(u=>u.text.includes(field.evidence)))throw Object.assign(new Error('The time has no exact source evidence.'),{code:'UNSUPPORTED_TIME'});
  const source=input.sourceUnits.find(u=>u.id===op.sourceId)?.text??field.evidence;
  const target=input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId);
  const shift=/\b(?:shift|move|push)\b[^.!?]*\b(?:by\s+)?(?:an?|one|1)\s+hour(?:\s+later)?\b/i.test(field.evidence)&&!/\b(?:not|never|earlier|before)\b/i.test(field.evidence);
  const named=target&&(/\bboth calls\b/i.test(field.evidence)&&/\bcall\b/i.test(target.title)||field.evidence.toLowerCase().includes(target.title.toLowerCase()));
  if(op.kind==='update'&&target?.planned&&shift&&named&&interpretTime(field.value,now).planned===new Date(Date.parse(target.planned)+3600000).toISOString())continue;
  if(/\bnow\b/i.test(field.value)&&interpretTime(field.value,now).planned===now.toISOString()&&interpretTime(source,now).planned!==now.toISOString())throw Object.assign(new Error('These words do not ask to start now.'),{code:'UNSUPPORTED_TIME'});
  const alert=op.fields.some(f=>f.name==='alert'&&f.op==='set'&&['reminder','alarm'].includes(f.value))||input.context.entities.some(e=>e.entity==='task'&&e.id===op.targetId&&['reminder','alarm'].includes(e.alert));
  const proof=alert?normalizeReminderTime(field.evidence??''):field.evidence??'';
  // An unresolved local parse already blocks Save without another model call.
  if(interpretTime(field.value,now,{evidence:raw}).status==='review')continue;
  const subject=clockSubject(op,sourceOperations,input);
  const requested=clocks(field.value,now,raw,subject),supported=[...clocks(proof,now,raw,subject,!!field.inference),...looseClocks(field.evidence)].map(c=>withPart(c,field.evidence)).filter(c=>c.explicit);
  for(const c of requested)if(!c.explicit||!supported.some(s=>s.hour===c.hour&&s.minute===c.minute)){
   const error=new Error('Time precision was not supported by the exact source words. Use the exact stated clock if present; when AM/PM is missing keep time unknown and ask AM or PM. Keep every other requested action. A saved date does not authorize inheriting its AM/PM.');
   error.code='UNSUPPORTED_TIME';throw error;
  }
 }
}

export function retainSupportedTimes(parsed,{input,activeDraft=null}){
 const kept=structuredClone(parsed),unapplied=[],sourceOperations=kept.operations;
 for(const op of kept.operations){
  try{validateIntentTimes({...kept,operations:[op]},{input,sourceOperations});}
  catch(error){
   if(error.code!=='UNSUPPORTED_TIME')throw error;
   const title=op.fields.find(f=>f.name==='title'&&f.op==='set')?.value??input.context.entities.find(e=>e.entity===op.entity&&e.id===op.targetId)?.title??op.entity;
   unapplied.push({opId:op.opId,field:'time',title,reason:'The clock did not match your words.'});
   op.fields=op.fields.filter(f=>f.name!=='time');
   if(kept.question?.opId===op.opId&&kept.question.field==='time')kept.question=null;
   const previous=parsed.draftMode==='amend'&&activeDraft?.operations.find(old=>old.opId===op.opId)?.fields.find(f=>f.name==='time');
   if(previous){
    op.fields.push(structuredClone(previous));
    if(previous.op==='unknown'&&activeDraft.question?.opId===op.opId&&activeDraft.question.field==='time')kept.question=structuredClone(activeDraft.question);
   }
  }
 }
 if(!unapplied.length)return null;
 kept.operations=kept.operations.filter(op=>op.kind!=='update'||op.fields.length);
 if(!kept.operations.length)kept.draftMode='none';
 kept.unapplied=unapplied;
 kept.notice=unapplied.map(x=>`${x.title}: time was not applied because it did not match your words. Your original words are saved.`).join(' ');
 validateIntentTimes(kept,{input,sourceOperations});return kept;
}
