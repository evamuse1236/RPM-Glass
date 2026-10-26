import {interpretTime,statedDays,durationFromText} from '../../cli/interpret.mjs';
import {buildContext} from './context.mjs';

/** Effort hint only: this never grants permission to change a saved record. */
export function isContextualFollowUp(raw=''){
 return /\b(?:make|turn|put|add|save|move|change|convert|use|keep)\b[^.!?\n]{0,70}\b(?:it|that|this|those|these|the one)\b|\b(?:just|previously|earlier)\s+(?:mentioned|discussed|said)|\b(?:mentioned|discussed|said)\b[^.!?\n]{0,40}\b(?:before|earlier)|\b(?:the|that)\s+(?:task|idea|project|one)\b[^.!?\n]{0,40}\b(?:mentioned|discussed)\b/i.test(raw);
}
const normalize=s=>String(s??'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const generic=new Set('a an the i me my you your we our it that this those these task project idea one make create turn into for to of and or with want just now before mentioned help finish'.split(' '));
const words=s=>normalize(s).split(' ').filter(w=>w.length>2&&!generic.has(w));
const overlaps=(a,b)=>words(a).some(w=>new Set(words(b)).has(w));
const named=(raw,title)=>normalize(raw).includes(normalize(title));
export const FOLLOW_UP_NOTICE='This title may refer to the wrong thought. Check its title; your original words are saved.';

/** Catch unsupported provenance and a concrete failure: borrowing an unrelated
 * saved title for a new project. This is deliberately not a semantic oracle. */
export function followUpProblem(operations,{messageId,sourceUnits=[],context={},activeDraft=null}={}){
 const raw=sourceUnits.map(s=>s.text).join('\n');let notice=null;
 if(activeDraft||!isContextualFollowUp(raw))return null;
 const anchor=(context.recentMessages??[]).filter(m=>m.role==='user'&&!isContextualFollowUp(m.text)).at(-1)?.text??'';
 for(const op of operations){
  if(op.kind!=='create')continue;
  const f=op.fields.find(f=>f.name==='title'&&f.op==='set');
  if(!f||f.userActionId||f.sourceMessageId&&f.sourceMessageId!==messageId||named(raw,f.value))continue;
  const borrowed=(context.entities??[]).some(e=>normalize(e.title)===normalize(f.value));
  if(borrowed&&!overlaps(f.value,anchor))return 'FOLLOW_UP_TARGET: This proposed title is from a saved item unrelated to the preceding user thought. Resolve the reference from recentMessages; do not choose a saved task merely because it is visible. If unclear, return clarification with choices and no operations.';
  if(f.origin==='stated'&&!overlaps(f.value,raw))notice='FOLLOW_UP_EVIDENCE: A generic reference does not state this title. Resolve the preceding thought from recentMessages. A title inferred from earlier dialogue must be suggested with null evidence, not stated with a generic pronoun as proof.';
 }
 return notice;
}
// A shared verb is not the identity of a saved task. A literal new purchase
// may not silently rewrite a broad grocery run just because both involve buying.
function newActionTargetProblem(operations,{sourceUnits=[],context={},activeDraft=null,openQuestion=null}={}){
 const raw=sourceUnits.map(s=>s.text).join(' ');
 if(activeDraft||openQuestion||isContextualFollowUp(raw)||! /^(?:please\s+)?(?:buy|call|read|submit|pay|print|collect|book|wash|clean|return|finish)\b/i.test(raw)||/\b(?:this|that|those|these|it|instead|actually|meant|rename|change|move|shopping|list)\b/i.test(raw))return null;
 const family=text=>normalize(text).replace(/\b(?:amma|mum|mummy|mother)\b/g,'mom').replace(/\b(?:papa|daddy|father)\b/g,'dad');
 const verbs=new Set('buy call read submit pay print collect book wash clean return finish get go'.split(' '));
 const current=new Set(words(family(raw)).filter(w=>!verbs.has(w)));
 for(const op of operations){
  if(op.kind!=='update'||op.entity!=='task')continue;
  const target=context.entities?.find(e=>e.entity==='task'&&e.id===op.targetId);
  if(target&&!words(family(target.title)).filter(w=>!verbs.has(w)).some(w=>current.has(w)))
   return 'This new action does not name the saved item. Keep that saved item unchanged and capture the specific action separately. A shared verb or broad category does not identify a saved task.';
 }
 return null;
}
// Borrowing an unrelated saved title is a target conflict. Weak provenance for
// a new title is only a notice; no saved record is being changed.
export const blocksFollowUp=issue=>!!issue&&!issue.startsWith('FOLLOW_UP_EVIDENCE:');
export function validateFollowUp(parsed,{input}){
 const issue=newActionTargetProblem(parsed.operations,input)??followUpProblem(parsed.operations,input);
 if(blocksFollowUp(issue))throw new Error(issue);
 if(issue)parsed.notice=FOLLOW_UP_NOTICE;
}

/** Re-check uncommitted drafts created by older builds, without rewriting them. */
export function draftFollowUpProblem(data,draft){
 if(!draft||!['draft','review'].includes(draft.status))return null;
 let notice=null;
 const ids=new Set(draft.operations.flatMap(o=>o.fields.map(f=>f.sourceMessageId)).filter(Boolean));
 for(const messageId of ids){
  const c=data.intentV2?.captures?.[messageId];if(!c||c.focusDraftId||!isContextualFollowUp(c.raw))continue;
  const context=buildContext(data,{messageId,raw:c.raw,conversationId:c.conversationId,now:new Date(c.at),timezone:c.timezone??'Asia/Kolkata'});
  const issue=followUpProblem(draft.operations,{messageId,sourceUnits:[{text:c.raw}],context});if(blocksFollowUp(issue))return issue;if(issue)notice=issue;
 }
 return notice;
}

export function completeExistingItems(output,input){
 if(!output?.decisions?.some(d=>d.disposition==='existing'))return output;
 const turn=structuredClone(output),now=new Date(input.context.now);
 for(const decision of turn.decisions){
  if(decision.disposition!=='existing')continue;
  const unit=input.sourceUnits.find(u=>u.id===decision.sourceId),raw=unit.text;
  const title=decision.note?.replace(/^Already (?:on your list|done):\s*/i,'').trim();
  const time=interpretTime(raw,now),days=statedDays(raw,now),minutes=durationFromText(raw);
  const match=input.context.entities.find(e=>e.entity==='task'&&normalize(e.title)===normalize(title)&&(!days.length||days.includes(e.savedLocalDate))&&(!time.planned||e.planned===time.planned)&&(minutes===null||e.minutes===minutes));
  if(match)continue;
  decision.note=null;
  if(/^(?:done|finished|complete|sent it)[.!\s]*$/i.test(raw)){decision.disposition='reflection';turn.reply='Nothing changed.';continue;}
  decision.disposition='action';turn.mode='capture';turn.draftMode='new';turn.reply='';
  const field=(name,value,evidence)=>({name,op:'set',value,origin:'stated',evidence});
  const name=title&&normalize(raw).startsWith(normalize(title))?raw.slice(0,title.length):raw.trim().slice(0,200);
  const fields=[field('title',name,name)];
  if(['parsed','date_only'].includes(time.status))fields.push(field('time',raw,raw));
  if(minutes!==null)fields.push(field('minutes',minutes,raw));
  turn.operations.push({opId:`existing-${decision.sourceId}`,sourceId:decision.sourceId,kind:'create',entity:'task',targetId:null,fields});
 }
 return turn;
}
