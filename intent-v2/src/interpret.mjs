import {TURN_SCHEMA,validate,validateField} from './schema.mjs';
import {checkRemoval,REMOVALS} from './removal.mjs';
import {checkBodyOperation} from './body-intent.mjs';
import {CAPTURE_OPERATIONS} from './capabilities.mjs';
import {normalizeReminderTime} from '../../cli/interpret.mjs';
import {capitalizeTitle} from '../../cli/title.mjs';
const words=s=>String(s).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** A choice may only name what the model was shown, and only what its action can be done to. */
function checkClarification(c,visible){
 if(c.choices.length<2)throw new Error('A clarification offers two to four choices');
 const proposals=c.choices.flatMap(x=>x.targets).some(t=>t.entity==='proposal');
 if(proposals&&(c.action!=='remove'||c.choices.some(x=>x.targets.some(t=>t.entity!=='proposal'))))throw new Error('A proposal choice only removes proposals from the focused draft');
 const labels=new Set(c.choices.map(x=>words(x.label)));if(labels.size!==c.choices.length||labels.has(''))throw new Error('Choice labels must be distinct');
 for(const choice of c.choices){
  if(!choice.targets.length)throw new Error('Each choice names at least one item');
  for(const t of choice.targets){
   const key=t.entity==='alarm'?`task:${t.id}`:`${t.entity}:${t.id}`,row=visible.get(key);
   if(!row)throw new Error('A choice names an item that was not supplied in current context');
   if(t.entity==='alarm'&&!row.alert)throw new Error('A choice names an alarm on a task that has none');
   if(c.action==='remove'&&t.entity!=='proposal'&&!['archive','update'].includes(REMOVALS[t.entity]?.kind))throw new Error(`Removing a ${t.entity} is not supported`);
   if(c.action==='complete'&&t.entity!=='task')throw new Error('Only saved tasks can be completed');
  }
 }
}
export function interpretTurn(turn,{units,messageId,visibleEntities,activeDraft}={}){
 validate(turn,TURN_SCHEMA);
 turn=structuredClone(turn);
 for(const op of turn.operations){
  if(op.entity!=='task')continue;
  const alert=op.fields.find(f=>f.name==='alert'&&f.op==='set'&&['reminder','alarm'].includes(f.value))??visibleEntities.find(e=>e.entity==='task'&&e.id===op.targetId&&['reminder','alarm'].includes(e.alert));
  if(alert)for(const f of op.fields)if(f.name==='time'&&f.op==='set'&&typeof f.value==='string')f.value=normalizeReminderTime(f.value);
  if(op.kind!=='create')continue;
  const title=op.fields.find(f=>f.name==='title');
  if(!alert||title?.op==='set')continue;
  op.fields=op.fields.filter(f=>f.name!=='title');
  op.fields.unshift({name:'title',op:'set',value:alert.value==='alarm'?'Alarm':'Reminder',origin:'suggested',evidence:null});
  if(turn.question?.opId===op.opId&&turn.question.field==='title')turn.question=null;
 }
 const source=new Map(units.map(u=>[u.id,u.text])),decisions=new Map();
 for(const d of turn.decisions){if(!source.has(d.sourceId)||decisions.has(d.sourceId))throw new Error('Invalid/duplicate source decision');decisions.set(d.sourceId,d.disposition);}
 if(decisions.size!==source.size)throw new Error('Every source unit needs a disposition; keep non-actions too');
 if(['reflect','query'].includes(turn.mode)&&turn.operations.length)throw new Error('Reflection/query cannot silently become task mutations');
 if(turn.draftMode==='none'&&turn.operations.length)throw new Error('Operations require a draft');
 if(turn.draftMode==='amend'&&!activeDraft)throw new Error('Amendment requires an explicitly focused draft');
 const ids=new Set(),visible=new Set(visibleEntities.map(e=>`${e.entity}:${e.id}`));
 if(turn.clarification){if(turn.question)throw new Error('Ask one question at a time');checkClarification(turn.clarification,new Map(visibleEntities.map(e=>[`${e.entity}:${e.id}`,e])));}
 const operations=turn.operations.map(op=>{
  if(!/^[A-Za-z0-9_-]{1,50}$/.test(op.opId)||ids.has(op.opId))throw new Error('Stable, unique operation IDs are required');ids.add(op.opId);
  if(decisions.get(op.sourceId)!=='action')throw new Error('Only an action source can authorize an operation draft');
  if(op.kind==='discard'){
   const previous=activeDraft?.operations.find(o=>o.opId===op.opId);
   if(turn.draftMode!=='amend'||!previous||previous.entity!==op.entity||previous.targetId!==op.targetId||op.fields.length)throw new Error('Discard needs an unchanged proposal identity in the focused draft, without field patches');
   return {...op,sourceMessageIds:[messageId]};
  }
  if(op.kind==='create'&&op.targetId!==null||op.kind!=='create'&&op.targetId===null)throw new Error('Create/update target mismatch');
  if(op.targetId!==null&&!visible.has(`${op.entity}:${op.targetId}`))throw new Error('Target ID was not supplied in current context');
  if(op.kind==='archive'&&op.entity==='draft'&&op.targetId===activeDraft?.id){
   const raw=words(units.map(u=>u.text).join(' '));
   if(activeDraft.operations.some(p=>{const title=p.fields.find(f=>f.name==='title'&&f.op==='set')?.value;return title&&raw.includes(`keep ${words(title)}`);}))throw new Error('Keep the explicitly named proposal. Discard only the requested proposal IDs; do not set the whole draft aside.');
  }
  checkRemoval(op,turn);
  if(!CAPTURE_OPERATIONS[op.entity].actions[op.kind])throw new Error(`Capture cannot ${op.kind} a ${op.entity}`);
  const names=new Set();
  const fields=op.fields.map(f=>{
   validateField(f,op.entity);if(names.has(f.name))throw new Error('Duplicate field');names.add(f.name);
   if(f.op!=='unknown'&&f.origin==='stated'&&(!f.evidence?.trim()||!units.some(u=>u.text.includes(f.evidence))))throw new Error(`No exact current-source evidence for ${f.name}`);
   if(f.origin==='suggested'&&f.evidence!==null)throw new Error('Suggestions must not pretend to be quotations');
   return {...f,...(f.name==='title'&&f.op==='set'?{value:capitalizeTitle(f.value)}:{}),sourceMessageId:messageId,evidenceSourceId:f.evidence?(units.find(u=>u.id===op.sourceId&&u.text.includes(f.evidence))??units.find(u=>u.text.includes(f.evidence)))?.id??null:null};
  });
  return {...op,fields,sourceMessageIds:[messageId]};
 });
 // Merge amendments by identity: no omitted operation or field is deleted.
 let merged=operations;
 if(turn.draftMode==='amend'){
  const old=new Map(activeDraft.operations.map(o=>[o.opId,structuredClone(o)]));
  for(const op of operations){const previous=old.get(op.opId);
   if(op.kind==='discard'){old.delete(op.opId);continue;}
   if(previous){if(op.kind!==previous.kind||op.entity!==previous.entity||op.targetId!==previous.targetId)throw new Error('An amendment cannot retarget an existing operation');
    const fields=new Map(previous.fields.map(f=>[f.name,f]));for(const f of op.fields)fields.set(f.name,f);
    old.set(op.opId,{...previous,fields:[...fields.values()],sourceMessageIds:[...new Set([...previous.sourceMessageIds,messageId])]});
   }else old.set(op.opId,op);
  }merged=[...old.values()];
 }
 if(merged.length>30)throw new Error('A draft supports at most 30 operations');
 for(const op of merged){
  checkBodyOperation(op);
  if(op.kind==='create'&&!op.fields.some(f=>f.name==='title'&&f.op==='set'))throw new Error('A new entity needs a title');
  for(const f of op.fields){const linkEntity={blockId:'block',projectId:'project',goalId:'goal',areaId:'area'}[f.name];
   if(!linkEntity||f.op!=='set')continue;
   if(f.value.startsWith('$')){const target=merged.find(x=>x.opId===f.value.slice(1));if(!target||target.kind!=='create'||target.entity!==linkEntity)throw new Error('Invalid new-entity reference');}
   else if(!visible.has(`${linkEntity}:${f.value}`))throw new Error('Linked ID was not supplied in current context');
  }
 }
 if(turn.question){const op=merged.find(o=>o.opId===turn.question.opId),field=op?.fields.find(f=>f.name===turn.question.field);if(!field||field.op!=='unknown')throw new Error('A blocking question must name an unresolved field');for(const option of turn.question.options)validateField({name:field.name,op:'set',value:option.value,origin:'suggested',evidence:null},op.entity);}
 if(turn.card){if(turn.card.day!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(turn.card.day))throw new Error('A card day is YYYY-MM-DD or null');if(turn.card.kind==='task'&&!visible.has(`task:${turn.card.targetId}`))throw new Error('A task card needs a task ID supplied in context');}
 for(const m of turn.memoryCandidates)if(!m.evidence.trim()||!units.some(u=>u.text.includes(m.evidence)))throw new Error('Memory candidate lacks exact evidence');
 return {...turn,operations:merged,...(operations.some(o=>o.kind==='discard')?{discarded:operations.filter(o=>o.kind==='discard').map(o=>o.opId)}:{})};
}
