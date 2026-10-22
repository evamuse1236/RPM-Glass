import {shortHash} from './hash.mjs';

const ENTITY_IDS=40;

/**
 * What one model attempt was given, without its words or any key: IDs, roles, counts, sizes and fingerprints.
 * Two requests with the same token count still differ here when any message, focus, question or entity differs.
 */
export function inputSummary(input,meta={}){
 const json=JSON.stringify(input),context=input.context??{},entities=context.entities??[];
 const messages=(context.recentMessages??[]).map((m,i)=>({id:meta.messages?.[i]?.id??null,role:m.role,hash:shortHash(m.text)}));
 const draft=input.activeDraft,question=input.openQuestion;
 return {
  bytes:json.length,hash:shortHash(json),units:(input.sourceUnits??[]).length,
  messageCount:messages.length,messages,
  focus:draft||question?{draftId:draft?.id??null,revision:draft?.revision??null,questionId:question?.id??null}:null,
  question:question?{id:question.id,choiceIds:(question.choices??[]).map(c=>c.id)}:draft?.question?{draftField:draft.question.field}:null,
  entityCount:entities.length,entityIds:entities.slice(0,ENTITY_IDS).map(e=>`${e.entity}:${e.id}`),
  truncated:{...(meta.truncated??{}),...(entities.length>ENTITY_IDS?{entityIds:entities.length-ENTITY_IDS}:{})},
  ...(input.snapshot?{snapshotHash:shortHash(JSON.stringify(input.snapshot))}:{}),
  ...(input.repair?{repair:true}:{}),
 };
}
