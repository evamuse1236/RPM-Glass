/** Chips are capabilities bound to a conversation, draft and revision, not prose. */
export function draftActions(draft,{now=new Date()}={}){
 if(!draft||!['draft','review'].includes(draft.status))return [];
 const base={conversationId:draft.conversationId,draftId:draft.id,revision:draft.revision};
 const action=(kind,extra={})=>({...base,kind,...extra});
 if(draft.review)return [{label:'Keep this time',action:action('commit',{reviewToken:draft.review.token})},{label:'Leave as draft',action:action('dismiss')}];
 if(draft.question){const answers=draft.question.options.slice(0,3).map(o=>({label:o.label,action:action('answer',{opId:draft.question.opId,field:draft.question.field,value:o.value})}));if(answers.length<3)answers.push({label:'Leave as draft',action:action('dismiss')});return answers;}
 if(draft.operations.some(o=>o.fields.some(f=>f.op==='unknown')))return [{label:'Edit missing detail',action:action('open')},{label:'Leave as draft',action:action('dismiss')}];
 const hasTime=draft.operations.some(o=>o.fields.some(f=>f.name==='time'&&f.op==='set'));
 const anchor=Date.parse(draft.timeAnchorAt??draft.created??'');
 if(hasTime&&(!draft.schedulePreview||!Number.isFinite(anchor)||+now-anchor>15*60*1000))return [{label:'Refresh dates and times',action:action('refresh-time')},{label:'Edit the draft',action:action('open')},{label:'Not now',action:action('dismiss')}];
 return [{label:'Save this plan',action:action('commit')},{label:'Edit the draft',action:action('open')},{label:'Not now',action:action('dismiss')}];
}
export function checkAction(draft,action){
 if(!draft||draft.conversationId!==action.conversationId||draft.id!==action.draftId)throw new Error('This action belongs to another conversation or draft');
 if(draft.revision!==action.revision||!['draft','review'].includes(draft.status))throw new Error('STALE_ACTION: use the newest card');
}
