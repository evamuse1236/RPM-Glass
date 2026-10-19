import {interpretTime,normalizeReminderTime,statedDays} from '../cli/interpret.mjs';
const bareClock=/^\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*$/i;
const clockWords=text=>bareClock.test(text)?'at '+text:text.replace(/(?<!\bup\s)\bto\s+(\d{1,2}(?::\d{2})?)(?=\s*(?:[ap]\.?m\.?(?:\s|$)|$|[.!?;]|(?:today|tomorrow|on|next)\b))/gi,'at $1');
function clockSubject(op,sourceOperations,input){
 const ownsSource=sourceOperations.filter(o=>o.sourceId===op.sourceId).length===1;
 return [op.fields.find(f=>f.name==='title'&&f.op==='set')?.evidence,input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId)?.title,ownsSource?input.sourceUnits.find(u=>u.id===op.sourceId)?.text:null].filter(Boolean).join(' ');
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
   let proof=f.evidence??(ownsSource?source?.text:null);
   if(!proof||!input.sourceUnits.some(u=>u.text.includes(proof)))continue;
   let time=interpretTime(clockWords(proof),now,{subject,inferBareClock:true});
   if(time.status!=='parsed'||!time.inference)continue;
   const owner=source??input.sourceUnits.find(u=>u.text.includes(proof)),whole=owner&&interpretTime(clockWords(owner.text),now,{subject,inferBareClock:true});
   if(!whole?.matched.some(m=>Number.isInteger(m.known.hour)))continue;
   if(ownsSource&&whole.status==='parsed'){
    const a=new Date(time.planned),b=new Date(whole.planned);
    if(a.getHours()%12!==b.getHours()%12||a.getMinutes()!==b.getMinutes())continue;
    time=whole;proof=owner.text;
   }else if(!f.evidence||bareClock.test(proof))continue;
   const savedDay=input.context.entities.find(e=>e.entity==='task'&&e.id===op.targetId)?.savedLocalDate;
   if(savedDay&&savedDay>input.context.nowLocal?.slice(0,10)&&(MORNING.test(proof)||LATER.test(proof))&&!statedDays(proof,now).length&&!/\bthis\s+(?:morning|afternoon|evening|night)\b/i.test(proof)){
    const retained=interpretTime(`${savedDay} ${clockWords(proof)}`,now,{subject,inferBareClock:true});
    if(retained.status==='parsed')time=retained;
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
 recoverExplicitSavedClock(parsed,input,now);
 inferClocks(parsed,input,now,sourceOperations);
 for(const op of parsed.operations)for(const field of op.fields){
  if(field.name!=='time'||field.op!=='set'||field.origin!=='stated'||(field.sourceMessageId&&field.sourceMessageId!==input.messageId))continue;
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
