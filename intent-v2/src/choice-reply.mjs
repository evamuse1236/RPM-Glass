import {sourceUnits,findEntity,contextEntity,draftEntity} from './context.mjs';
import {removalOperations} from './removal.mjs';
import {proposalEntities,proposalFor} from './proposal-removal.mjs';

const words=s=>String(s??'').toLocaleLowerCase().replace(/[’‘]/g,"'").replace(/[^\p{L}\p{N}']+/gu,' ').trim().split(' ').filter(Boolean);
const IGNORED=new Set('ok okay yes yeah yep sure please just only um so then and the a an one ones option choice number do delete remove drop cancel trash clear get rid of mark finish complete done pick choose take go with'.split(' '));
const ORDINAL={first:0,'1st':0,'1':0,second:1,'2nd':1,'2':1,third:2,'3rd':2,'3':2,fourth:3,'4th':3,'4':3};
const ALL=new Set(['all','everything','both']);
const POINTING=new Set(['that','this','it']);
const sameTargets=(a,b)=>a.length===b.length&&a.every(t=>b.some(u=>u.entity===t.entity&&String(u.id)===String(t.id)));

export function orphanChoiceTurn(output,input){
 if(input.activeDraft||input.openQuestion||input.sourceUnits.length!==1)return output;
 const unit=input.sourceUnits[0],tokens=words(unit.text).filter(t=>!['the','one','ones','only','please','and','of','them'].includes(t));
 if(!tokens.length||!tokens.every(t=>ALL.has(t)||POINTING.has(t)||Object.hasOwn(ORDINAL,t)||t==='last'))return output;
 return {schemaVersion:1,mode:'capture',draftMode:'none',reply:'Nothing is waiting for a choice. Name the item you want to change.',
  decisions:[{sourceId:unit.id,disposition:'reference',note:null}],operations:[],question:null,clarification:null,memoryCandidates:[],card:null};
}

/** One part of a reply ("first", "the alarm", "both") as choice indexes, or null when it is not clearly one of them. */
function part(tokens,question,{focus}){
 const {choices}=question,content=tokens.filter(t=>!IGNORED.has(t));
 const allWord=tokens.find(t=>ALL.has(t));
 if(allWord&&content.every(t=>ALL.has(t)||t==='of'||t==='them')){
  const named=choices.findIndex(c=>words(c.label).some(w=>ALL.has(w))&&words(c.label).every(w=>ALL.has(w)||IGNORED.has(w)||w==='of'||w==='them'));
  if(named>=0)return [named];
  if(allWord==='both')return choices.length===2?[0,1]:null;
  return choices.map((_,i)=>i);
 }
 const ordinals=content.filter(t=>t in ORDINAL||t==='last');
 if(ordinals.length===1&&content.length===1){const i=ordinals[0]==='last'?choices.length-1:ORDINAL[ordinals[0]];return i<choices.length?[i]:null;}
 if(content.length&&content.every(t=>POINTING.has(t))){
  if(!focus?.explicit||!focus.draftId)return null;
  const hits=choices.map((c,i)=>sameTargets(c.targets,[{entity:'draft',id:focus.draftId}])?i:-1).filter(i=>i>=0);
  return hits.length===1?hits:null;
 }
 if(!content.length)return null;
 const hits=choices.map((c,i)=>{const label=new Set(words(c.label));return content.every(t=>label.has(t))?i:-1;}).filter(i=>i>=0);
 return hits.length===1?hits:null;
}

/**
 * A reply to an open choice question, read without the model: a tap, or words such as "both", "all", "first",
 * "second", "last", "the alarm", "first and third". "That one" counts only when the person pointed at a draft
 * with an Edit tap. Anything less certain returns null and the model reads the words with the question in view.
 */
export function readChoiceReply(raw,question,{choiceId=null,focus=null}={}){
 if(!question?.choices?.length)return null;
 if(choiceId!==null){
  const i=question.choices.findIndex(c=>c.id===choiceId);
  if(i<0)throw new Error('That choice was not offered. Nothing changed.');
  return [question.choices[i].id];
 }
 if(typeof raw!=='string'||raw.length>80)return null;
 const parts=words(raw).join(' ').split(/\band\b|&/).map(p=>p.trim().split(' ').filter(Boolean)).filter(p=>p.length);
 if(!parts.length)return null;
 const picked=new Set();
 for(const tokens of parts){const hit=part(tokens,question,{focus});if(!hit)return null;hit.forEach(i=>picked.add(i));}
 return [...picked].sort((a,b)=>a-b).map(i=>question.choices[i].id);
}

/** The items the chosen choices name, as the interpreter's visible entities. Every one must still exist. */
export function choiceEntities(data,question,choiceIds,timezone,{activeDraft=null}={}){
 const out=[];
 for(const t of question.choices.filter(c=>choiceIds.includes(c.id)).flatMap(c=>c.targets)){
  if(t.entity==='proposal'){
   const row=proposalEntities(activeDraft).find(e=>e.id===t.id);if(!row)throw new Error('That proposal is no longer in this draft. Nothing changed.');
   if(!out.some(e=>e.id===row.id))out.push(row);
   continue;
  }
  const entity=t.entity==='alarm'?'task':t.entity,row=findEntity(data,entity,t.id);
  const open=entity==='draft'?['draft','review'].includes(row?.status):entity==='task'?row&&!row.archived:!!row;
  if(!open)throw new Error('One of those items is no longer in your plan. Nothing changed.');
  if(!out.some(e=>e.entity===entity&&e.id===String(t.id)))out.push(entity==='draft'?draftEntity(data,row):contextEntity(entity,row,timezone,data));
 }
 return out;
}

/** The chosen choices as a turn in the model's own format, so the same checks, guards and Undo apply. */
export function choiceTurn(raw,question,choiceIds,{activeDraft=null}={}){
 const chosen=question.choices.filter(c=>choiceIds.includes(c.id)),targets=[];
 for(const t of chosen.flatMap(c=>c.targets))if(!targets.some(u=>u.entity===t.entity&&String(u.id)===String(t.id)))targets.push(t);
 const units=sourceUnits(raw),sourceId=units[0].id;
 let operations;
 const proposals=targets.every(t=>t.entity==='proposal');
 if(question.action==='remove'&&proposals)operations=targets.map(t=>{
  const op=proposalFor(activeDraft,t.id);if(!op)throw new Error('That proposal is no longer in this draft. Nothing changed.');
  return {opId:op.opId,sourceId,kind:'discard',entity:op.entity,targetId:op.targetId,fields:[]};
 });
 else if(question.action==='remove')operations=removalOperations(targets,{sourceId});
 else if(question.action==='complete'&&targets.every(t=>t.entity==='task'))operations=targets.map((t,i)=>({opId:`done${i+1}`,sourceId,kind:'complete',entity:'task',targetId:String(t.id),fields:[]}));
 else return null;
 return {schemaVersion:1,mode:'capture',draftMode:proposals?'amend':'new',reply:'',decisions:units.map(u=>({sourceId:u.id,disposition:'action',note:null})),operations,question:null,clarification:null,memoryCandidates:[],card:null};
}
