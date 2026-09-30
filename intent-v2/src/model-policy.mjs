import {isContextualFollowUp} from './follow-up.mjs';
/** Routing changes effort only. It never authorizes a plan change. */
export const LUNA_MODEL='openai/gpt-6-luna';
export const MODEL_POLICY_VERSION='rpm-effort-v2';
export const MODEL_BUDGETS=Object.freeze({none:12000,high:30000});
export function intentModelPolicy({input,attempt=0,output=null}={}){
 const raw=input.sourceUnits.map(u=>u.text).join('\n');
 // These are conservative upgrades, not a semantic permission check. Quoted
 // planning words can cost an extra high call, but cannot cause a task write.
 const contextual=/\?|\b(help|plan|planning|suggest|ideas?|prioriti[sz]e|tradeoffs?|decide|choose between|how (?:can|should|do)|what (?:should|could|can)|free (?:time|hour)|available|availability)\b/i.test(raw);
 const reason=attempt?'repair':output&&['plan','query'].includes(output.mode)?'interpreted_reasoning':isContextualFollowUp(raw)?'conversational_follow_up':contextual?'contextual_request':'capture';
 const effort=reason==='capture'?'none':'high';
 return {model:LUNA_MODEL,effort,timeoutMs:MODEL_BUDGETS[effort],reason,version:MODEL_POLICY_VERSION};
}
/** Routine confirmations come from checked fields and the local time preview. */
export function captureReply({parsed,schedulePreview}){
 if(parsed.mode!=='capture'||!parsed.operations.length||parsed.operations.some(op=>op.fields.some(f=>f.origin==='suggested')))return parsed.reply;
 const times=schedulePreview?.items??[];
 const review=times.find(t=>t.status==='review');
 if(review)return `Draft kept for review. ${review.reason}`;
 const labels=times.filter(t=>t.label).map(t=>`${t.title}: ${t.label}.`);
 return ['Draft ready to review.',...labels,parsed.question?.prompt??''].filter(Boolean).join(' ');
}
