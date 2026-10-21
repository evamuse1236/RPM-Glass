import {checkExecution,checkExpectation,visibleQuestions} from './checks.mjs';

export function evaluateCase(test,{before,after,turns,states,validate,schema}){
 const failures=checkExecution(turns,{validate,schema});
 if(test.expect.noOverlap)for(const turn of turns){
  const warnings=[turn.draft?.applied?.warning,turn.result?.applied?.warning,turn.draft?.review?.question].filter(Boolean);
  if(warnings.some(text=>/overlap|clash|save anyway/i.test(text)))failures.push({type:'false overlap',detail:warnings.join(' ')});
 }
 const checkpoints=test.expect.checkpoints??[];
 for(const [i,turn] of turns.entries()){
  const state=states[i],draft=turn.draft;
  const focusedId=test.turns.some(t=>t.focus==='dinner')?'draft-dinner':turn.capture?.focusDraftId??draft?.id;
  turn.focusDraft=state.intentV2?.drafts?.[focusedId]??null;
  const context={before,after:state,draft,focusDraft:turn.focusDraft,questions:visibleQuestions(turn)};
  const checkpoint=checkpoints.find(c=>c.turn===i+1);
  if(checkpoint)failures.push(...checkExpectation(checkpoint,context).map(f=>({...f,checkpoint:i+1})));
  const allowed={...test.expect,created:[...test.expect.created,...checkpoints.flatMap(c=>c.created)],
   maxNew:Math.max(test.expect.maxNew,...checkpoints.map(c=>c.maxNew)),
   changes:[...test.expect.changes,...checkpoints.flatMap(c=>c.changes)],forbidden:[],question:'allowed',unchanged:[],focusRemoved:[],focusRetained:[],health:undefined};
  failures.push(...checkExpectation(allowed,context).filter(f=>f.type==='invented item').map(f=>({...f,turn:i+1})));
 }
 const last=turns.at(-1);
 if(test.expect.flip!==undefined&&last?.draft?.nextStep?.label!==test.expect.flip)failures.push({type:'missing flip',detail:`Expected ${test.expect.flip}, got ${last?.draft?.nextStep?.label??'no chip'}`});
 failures.push(...checkExpectation(test.expect,{before,after,draft:last?.draft,focusDraft:last?.focusDraft,questions:visibleQuestions(last??{})}));
 if(!turns.every(t=>after.intentV2?.captures?.[t.capture?.messageId]?.raw===t.text))failures.push({type:'words lost',detail:'A later turn lost an earlier raw capture'});
 return [...new Map(failures.map(f=>[JSON.stringify(f),f])).values()];
}
