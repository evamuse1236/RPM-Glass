import {completeExistingItems} from './follow-up.mjs';
import {checkRemovalWords} from './removal.mjs';
import {intentState} from './repository.mjs';
import {buildContext,findEntity,contextEntity,draftEntity} from './context.mjs';
import {activeStatus} from './draft-actions.mjs';
import {proposalEntities} from './proposal-removal.mjs';
import {completeShortReminder} from './short-reminder.mjs';
import {readSimpleCapture} from './simple-capture.mjs';
import {readBulkMove} from './bulk-move.mjs';
import {shortHash} from './hash.mjs';
import {completeWaterLog} from './body-intent.mjs';
import {orphanChoiceTurn} from './choice-reply.mjs';
import {interpretTurn} from './interpret.mjs';

export async function prepareRead(data,capture,{activeDraft,question,units,snapshot}){
 const v=intentState(data),messageId=capture.messageId;
 const targets=[...(activeDraft?.operations??[]).filter(o=>o.targetId!==null).map(o=>({entity:o.entity,id:String(o.targetId)})),...(question?.choices??[]).flatMap(c=>c.targets).map(t=>t.entity==='alarm'?{entity:'task',id:t.id}:t)];
 const meta={},context=buildContext(data,{messageId,raw:capture.raw,conversationId:capture.conversationId,focus:{draftId:activeDraft?.id??null,questionId:question?.id??null,targets},now:new Date(capture.at),timezone:capture.timezone,meta});
 // Referenced draft targets are explicitly visible, even when not keyword-relevant.
 if(activeDraft)for(const op of activeDraft.operations){
  const include=(entity,id)=>{if(!context.entities.some(e=>e.entity===entity&&e.id===String(id))){const row=findEntity(data,entity,id);if(row)context.entities.push(contextEntity(entity,row,capture.timezone));}};
  if(op.targetId!==null)include(op.entity,op.targetId);
  for(const f of op.fields){const entity={blockId:'block',projectId:'project',goalId:'goal',areaId:'area'}[f.name];if(entity&&f.op==='set'&&!f.value.startsWith('$'))include(entity,f.value);}
 }
 for(const d of [activeDraft,...(question?.choices??[]).flatMap(c=>c.targets).filter(t=>t.entity==='draft').map(t=>v.drafts[t.id])])
  if(activeStatus(d)&&!context.entities.some(e=>e.entity==='draft'&&e.id===d.id))context.entities.push(draftEntity(data,d));
 if(activeDraft)context.entities.push(...proposalEntities(activeDraft));
 const draftContext=activeDraft?{id:activeDraft.id,revision:activeDraft.revision,operations:activeDraft.operations.map(o=>({opId:o.opId,kind:o.kind,entity:o.entity,targetId:o.targetId,fields:o.fields.map(f=>({name:f.name,op:f.op,value:typeof f.value==='string'?f.value.slice(0,1000):f.value,origin:f.origin,truncated:typeof f.value==='string'&&f.value.length>1000}))})),question:activeDraft.question?{prompt:activeDraft.question.prompt,field:activeDraft.question.field,options:activeDraft.question.options.map(o=>o.label)}:null,reply:activeDraft.reply??null}:null;
 const plan=snapshot?await snapshot({data,capture,context}):null;
 if(plan?.truncated)meta.truncated={...meta.truncated,snapshot:plan.truncated};
 for(const e of plan?.entities??[])if(!context.entities.some(x=>x.entity===e.entity&&x.id===e.id))context.entities.push(e);
 const input={messageId,sourceUnits:units,context,activeDraft:draftContext,...(question?{openQuestion:{id:question.id,prompt:question.prompt,action:question.action,choices:question.choices}}:{}),...(plan?{snapshot:plan.summary}:{})};
 const bulk=readBulkMove(input,{data});
 if(bulk)for(const e of bulk.entities)if(!context.entities.some(x=>x.entity===e.entity&&x.id===e.id))context.entities.push(e);
 const simple=bulk?null:readSimpleCapture(input,{data});
 for(const e of simple?.entities??[])if(!context.entities.some(x=>x.entity===e.entity&&x.id===e.id))context.entities.push(e);
 const turn=bulk?.turn??simple?.turn??completeShortReminder(null,input);
 return {input,context,meta,local:turn?{turn,kind:bulk?'bulk-move':simple?.kind??'short-reminder'}:null};
}

export function readKey(input){
 const {messageId,...rest}=input;
 return shortHash(JSON.stringify({...rest,context:{...rest.context,now:null,nowLocal:null}}));
}

export function readOutput(output,{input,units,messageId,visibleEntities,activeDraft}){
 const existing=completeExistingItems(output,input),reminder=completeShortReminder(existing,input),water=completeWaterLog(reminder,input),completed=orphanChoiceTurn(water,input);
 const completion=completed===output?null:completed!==water?'closed-choice':water!==reminder?'water-log':reminder!==existing?'short-reminder':'existing-item';
 checkRemovalWords(completed,input);
 const {reviewReason,...turn}=completed;
 return {parsed:{...interpretTurn(turn,{units,messageId,visibleEntities,activeDraft}),...(reviewReason?{reviewReason}:{})},completion};
}
