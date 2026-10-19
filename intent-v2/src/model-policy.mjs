import {isContextualFollowUp} from './follow-up.mjs';
/** Routing picks the model and effort only. It never authorizes a plan change. */
/** Planner suggestions and the older chat prototype; Capture uses the Claude models below. */
export const LUNA_MODEL='openai/gpt-6-luna';
export const HAIKU_MODEL='anthropic/claude-haiku-5.5';
export const SONNET_MODEL='anthropic/claude-sonnet-5.5';
/** OpenRouter providers that serve these models with strict structured outputs. */
export const CLAUDE_PROVIDERS=Object.freeze(['Anthropic','Google','Azure']);
export const MODEL_POLICY_VERSION='rpm-claude-v3';
export const MODEL_ROUTES=Object.freeze({
 quick:Object.freeze({model:HAIKU_MODEL,effort:'none',timeoutMs:25000,maxTokens:4000}),
 careful:Object.freeze({model:HAIKU_MODEL,effort:'high',timeoutMs:35000,maxTokens:6000}),
 long:Object.freeze({model:HAIKU_MODEL,effort:'high',timeoutMs:90000,maxTokens:6000}),
 hard:Object.freeze({model:SONNET_MODEL,effort:'high',timeoutMs:90000,maxTokens:16000}),
});
/** More changes to saved items than this in one capture is a re-plan, not a quick edit. */
export const HARD_CHANGE_COUNT=3;
const REPLAN_SORT_OR_ADVICE=/\b(?:re-?plan|re-?schedule (?:my|the|this) (?:day|week|morning|afternoon|evening)|plan (?:my|the|this|next|out) (?:day|week|weekend|month|today|tomorrow)|plan (?:a|my|the) result|sort (?:out )?(?:my |the )?(?:backlog|inbox|tasks|list)|organi[sz]e (?:my|the) (?:week|day|backlog|tasks|inbox)|prioriti[sz]e|weekly review|review (?:my|the|this|last) week|what should i|should i\b|how (?:should|could|can|do) i\b|advice|advise|help me (?:decide|choose|plan|figure|prioriti[sz]e|make)|suggest|ideas? for|trade-?offs?|choose between)/i;

/** A reply to something the app asked, or about the draft in focus, reads the conversation with care. */
const CAREFUL_REASONS=new Set(['answer_to_question','focused_draft','conversational_follow_up']);
const changesToSaved=output=>(output?.operations??[]).filter(op=>op.kind!=='create').length;

/** Which model reads this capture. A fast run that turns out to be a plan or a big edit gets one Sonnet follow-up. */
export function intentModelPolicy({input,attempt=0,output=null}={}){
 const raw=(input?.sourceUnits??[]).map(u=>u.text).join('\n');
 let reason='capture';
 if(attempt)reason='repair';
 else if(output&&(output.mode==='plan'||changesToSaved(output)>HARD_CHANGE_COUNT))reason='interpreted_hard';
 else if(REPLAN_SORT_OR_ADVICE.test(raw))reason='hard_request';
 else if(input?.openQuestion||input?.activeDraft?.question)reason='answer_to_question';
 else if(input?.activeDraft)reason='focused_draft';
 else if(isContextualFollowUp(raw))reason='conversational_follow_up';
 else if(/\?|\b(?:what(?:'s| is| are)|when|how (?:much|many|long)|do i have|am i|is there|timetable|schedule today|agenda)\b/i.test(raw))reason='question';
 const longCapture=raw.length>=1500&&(reason==='capture'||reason==='question'||CAREFUL_REASONS.has(reason));
 const route=longCapture?MODEL_ROUTES.long:reason==='capture'||reason==='question'?MODEL_ROUTES.quick:CAREFUL_REASONS.has(reason)?MODEL_ROUTES.careful:MODEL_ROUTES.hard;
 if(longCapture&&reason==='capture')reason='long_capture';
 return {...route,reason,version:MODEL_POLICY_VERSION};
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
