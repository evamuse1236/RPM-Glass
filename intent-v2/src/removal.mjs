/**
 * What removing each kind of item means. interpret.mjs checks operations against it, the choice resolver builds
 * removals from it, and the prompt's removal rules are written from it, so the three cannot drift apart.
 */
export const REMOVALS=Object.freeze({
 task:Object.freeze({kind:'archive',effect:'trash',rule:'a saved task: kind archive with its id. The app moves it to Trash; Undo brings it back.'}),
 draft:Object.freeze({kind:'archive',effect:'park',rule:'a draft: kind archive, entity draft, with the id of activeDraft or of a draft named in openQuestion, in draftMode new. The app sets the draft aside; Resume brings it back.'}),
 alarm:Object.freeze({kind:'update',effect:'alert-off',rule:'an alarm or reminder: it belongs to its task (the task shows alert). Propose kind update on that task with alert off, and keep the task.'}),
 event:Object.freeze({kind:null,effect:'refuse',message:'Calendar events stay in your calendar app. Delete it there.',rule:'a calendar event: it is read-only. Propose nothing and reply "Calendar events stay in your calendar app. Delete it there."'}),
});

export const REMOVAL_RULES=Object.entries(REMOVALS).map(([,r])=>`- To remove ${r.rule}`).join('\n');

/** Completion and removal kinds an operation may use: complete is for tasks; archive only where the table allows it. */
export function checkRemoval(op,{draftMode}={}){
 if(op.entity==='draft'&&(op.kind!=='archive'||draftMode!=='new'))throw new Error('A draft can only be set aside, with kind archive in a new draft');
 if(op.kind==='complete'&&(op.entity!=='task'||op.fields.length))throw new Error('Only a saved task can be completed, without field patches');
 if(op.kind==='archive'&&(REMOVALS[op.entity]?.kind!=='archive'||op.fields.length))throw new Error(`Removing a ${op.entity} is not supported; only tasks go to Trash and drafts are set aside, without field patches`);
}

/** Removal operations for chosen targets. An alarm on a task that is also being removed needs no change of its own. */
export function removalOperations(targets,{sourceId}){
 const trashed=new Set(targets.filter(t=>t.entity==='task').map(t=>String(t.id)));
 const ops=[];
 for(const t of targets){
  const rule=REMOVALS[t.entity];
  if(!rule||rule.effect==='refuse')throw new Error(rule?.message??'That item cannot be removed here.');
  if(t.entity==='alarm'&&trashed.has(String(t.id)))continue;
  const opId=`remove${ops.length+1}`;
  ops.push(t.entity==='alarm'
   ?{opId,sourceId,kind:'update',entity:'task',targetId:String(t.id),fields:[{name:'alert',op:'set',value:'off',origin:'suggested',evidence:null}]}
   :{opId,sourceId,kind:'archive',entity:t.entity,targetId:String(t.id),fields:[]});
 }
 return ops;
}

export function checkRemovalWords(turn,input){
 for(const op of turn.operations??[]){
  if(op.kind!=='archive'||input.openQuestion?.action==='remove')continue;
  const text=input.sourceUnits.find(u=>u.id===op.sourceId)?.text??'';
  if(!/\b(?:delete|remove|archive|trash|cancel|discard|drop|forget|set aside)\b/i.test(text)||/\b(?:not|never|don't|do not)\b/i.test(text))throw new Error('Archive needs an explicit request to remove the item. Keep the requested action instead.');
 }
}
