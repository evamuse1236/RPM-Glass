/** Words that make a title a sentence about the person instead of a short action. */
export const FILLER=/^(i('ll| will| want to| need to| have to| am going to|'m going to)|we (will|need to)|please|can you|remind me to|set (an? )?(alarm|reminder|task)( for| to)?)\b/i;
/** A clock time, a "now", or an "in N minutes" in a title: the time belongs in the time field. */
export const TIME_IN_TITLE=/\b\d{1,2}([:.]\d{2})?\s*(a\.?m\.?|p\.?m\.?|baje|vajta)\b|\b\d{1,2}:\d{2}\b|\bin (\d+|a|an|one|half an?) (min(ute)?s?|hours?)\b|\b(today|tomorrow|tonight)\b/i;
const GENERIC=/^(alarm|reminder|task|new task|alert)s?$/i;

/** A title is clean when it is a short action with no filler, no time and no bare alert word. */
export function titleProblem(title){
 const t=String(title??'').trim();
 if(!t)return 'empty';
 if(FILLER.test(t))return 'filler';
 if(TIME_IN_TITLE.test(t))return 'time';
 if(GENERIC.test(t))return 'generic';
 return null;
}

/**
 * Pass or fail per target for one case. A case has `kind` ('request' or 'noise') and `expect`:
 * `titles` (one array of words per task that must be made, each matched by word start) and `min` (tasks made at least).
 */
export function scoreVoice(c,run){
 if(run.end&&run.end!=='done')return Object.fromEntries(['noise','title','acts','notime','lead'].filter(t=>t==='noise'?c.kind==='noise':c.kind!=='noise'&&(t==='title'?c.expect?.titles?.length:t==='acts'?c.expect?.min!=null:c.expect?.[t]!=null)).map(t=>[t,false]));
 const tasks=run.created.filter(x=>x.entity==='task');
 if(c.kind==='noise')return {noise:run.ops===0};
 const out={};
 const want=c.expect?.titles??[];
 if(want.length){
  const words=t=>String(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const found=want.every(need=>tasks.some(x=>need.every(w=>words(x.title).some(t=>t.startsWith(w.toLowerCase())))));
  out.title=found&&tasks.length>0&&tasks.every(x=>!titleProblem(x.title));
 }
 if(c.expect?.min!=null)out.acts=tasks.length>=c.expect.min;
 if(c.expect?.notime)out.notime=tasks.length>0&&tasks.every(x=>!TIME_IN_TITLE.test(x.title));
 if(c.expect?.lead!=null)out.lead=tasks.some(x=>x.fields?.alertLead===c.expect.lead);
 return out;
}
