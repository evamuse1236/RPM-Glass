import {interpretTime} from '../cli/interpret.mjs';
const bareClock=/^\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*$/i;
function clocks(text,now,evidence){
 const parsed=interpretTime(bareClock.test(text)?'at '+text:text,now,{evidence});
 return parsed.matched.flatMap(match=>[match,match.end&&{...match.end,text:match.text}].filter(Boolean).filter(m=>Number.isInteger(m.known.hour)).map(m=>({hour:m.known.hour,minute:m.known.minute??0,explicit:Object.hasOwn(m.known,'meridiem')||Object.hasOwn(match.end?.known??{},'meridiem')||/\d{1,2}:\d{2}/.test(m.text)||m.known.hour>12})));
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
/** Saved day is inheritable; a newly stated bare clock does not inherit AM/PM. */
export function validateIntentTimes(parsed,{input}){
 const now=new Date(input.context.now),raw=input.sourceUnits.map(u=>u.text).join('\n');
 recoverExplicitSavedClock(parsed,input,now);
 for(const op of parsed.operations)for(const field of op.fields){
  if(field.name!=='time'||field.op!=='set'||field.origin!=='stated'||(field.sourceMessageId&&field.sourceMessageId!==input.messageId))continue;
  // An unresolved local parse already blocks Save without another model call.
  if(interpretTime(field.value,now,{evidence:raw}).status==='review')continue;
  const requested=clocks(field.value,now,raw),supported=clocks(field.evidence??'',now,raw).filter(c=>c.explicit);
  for(const c of requested)if(!c.explicit||!supported.some(s=>s.hour===c.hour&&s.minute===c.minute)){
   throw new Error('Time precision was not supported by the exact source words. Use the exact stated clock if present; when AM/PM is missing keep time unknown and ask AM or PM. Keep every other requested action. A saved date does not authorize inheriting its AM/PM.');
  }
 }
}
