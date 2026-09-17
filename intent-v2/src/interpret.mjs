import {TURN_SCHEMA,validate,validateField} from './schema.mjs';
export function interpretTurn(turn,{units,messageId,visibleEntities,activeDraft}={}){
 validate(turn,TURN_SCHEMA);
 const source=new Map(units.map(u=>[u.id,u.text])),decisions=new Map();
 for(const d of turn.decisions){if(!source.has(d.sourceId)||decisions.has(d.sourceId))throw new Error('Invalid/duplicate source decision');decisions.set(d.sourceId,d.disposition);}
 if(decisions.size!==source.size)throw new Error('Every source unit needs a disposition; keep non-actions too');
 if(['reflect','query'].includes(turn.mode)&&turn.operations.length)throw new Error('Reflection/query cannot silently become task mutations');
 if(turn.draftMode==='none'&&turn.operations.length)throw new Error('Operations require a draft');
 if(turn.draftMode==='amend'&&!activeDraft)throw new Error('Amendment requires an explicitly focused draft');
 const ids=new Set(),visible=new Set(visibleEntities.map(e=>`${e.entity}:${e.id}`));
 const operations=turn.operations.map(op=>{
  if(!/^[A-Za-z0-9_-]{1,50}$/.test(op.opId)||ids.has(op.opId))throw new Error('Stable, unique operation IDs are required');ids.add(op.opId);
  if(decisions.get(op.sourceId)!=='action')throw new Error('Only an action source can authorize an operation draft');
  if(op.kind==='create'&&op.targetId!==null||op.kind!=='create'&&op.targetId===null)throw new Error('Create/update target mismatch');
  if(op.targetId!==null&&!visible.has(`${op.entity}:${op.targetId}`))throw new Error('Target ID was not supplied in current context');
  if(['complete','archive'].includes(op.kind)&&(op.entity!=='task'||op.fields.length))throw new Error('Completion/archive pilot supports tasks only, without field patches');
  const names=new Set();
  const fields=op.fields.map(f=>{
   validateField(f,op.entity);if(names.has(f.name))throw new Error('Duplicate field');names.add(f.name);
   if(f.op!=='unknown'&&f.origin==='stated'&&(!f.evidence?.trim()||!units.some(u=>u.text.includes(f.evidence))))throw new Error(`No exact current-source evidence for ${f.name}`);
   if(f.origin==='suggested'&&f.evidence!==null)throw new Error('Suggestions must not pretend to be quotations');
   return {...f,sourceMessageId:messageId,evidenceSourceId:f.evidence?(units.find(u=>u.id===op.sourceId&&u.text.includes(f.evidence))??units.find(u=>u.text.includes(f.evidence)))?.id??null:null};
  });
  return {...op,fields,sourceMessageIds:[messageId]};
 });
 // Merge amendments by identity: no omitted operation or field is deleted.
 let merged=operations;
 if(turn.draftMode==='amend'){
  const old=new Map(activeDraft.operations.map(o=>[o.opId,structuredClone(o)]));
  for(const op of operations){const previous=old.get(op.opId);
   if(previous){if(op.kind!==previous.kind||op.entity!==previous.entity||op.targetId!==previous.targetId)throw new Error('An amendment cannot retarget an existing operation');
    const fields=new Map(previous.fields.map(f=>[f.name,f]));for(const f of op.fields)fields.set(f.name,f);
    old.set(op.opId,{...previous,fields:[...fields.values()],sourceMessageIds:[...new Set([...previous.sourceMessageIds,messageId])]});
   }else old.set(op.opId,op);
  }merged=[...old.values()];
 }
 if(merged.length>30)throw new Error('A draft supports at most 30 operations');
 for(const op of merged){
  if(op.kind==='create'&&!op.fields.some(f=>f.name==='title'&&f.op==='set'))throw new Error('A new entity needs a title');
  for(const f of op.fields){const linkEntity={blockId:'block',projectId:'project',goalId:'goal',areaId:'area'}[f.name];
   if(!linkEntity||f.op!=='set')continue;
   if(f.value.startsWith('$')){const target=merged.find(x=>x.opId===f.value.slice(1));if(!target||target.kind!=='create'||target.entity!==linkEntity)throw new Error('Invalid new-entity reference');}
   else if(!visible.has(`${linkEntity}:${f.value}`))throw new Error('Linked ID was not supplied in current context');
  }
 }
 if(turn.question){const op=merged.find(o=>o.opId===turn.question.opId),field=op?.fields.find(f=>f.name===turn.question.field);if(!field||field.op!=='unknown')throw new Error('A blocking question must name an unresolved field');for(const option of turn.question.options)validateField({name:field.name,op:'set',value:option.value,origin:'suggested',evidence:null},op.entity);}
 for(const m of turn.memoryCandidates)if(!m.evidence.trim()||!units.some(u=>u.text.includes(m.evidence)))throw new Error('Memory candidate lacks exact evidence');
 return {...turn,operations:merged};
}
