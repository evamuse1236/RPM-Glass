import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {entryView} from '../chat-prototype/companion-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {bindSuggestionActions,executeCaptureAction,goalDraftAction,plannerReceipts,receiptsForMessage,resolveCaptureAction} from './capture-actions.mjs';

test('saved receipts route each current planner record directly without a model request',async()=>{
  const data=freshStore(),modelCalls=[];
  const projectId=editPlan(data,{type:'saveEntity',collection:'projects',fields:{title:'Learning',purpose:'',notes:'',goalId:null}});
  const taskId=editPlan(data,{type:'saveTask',fields:{title:'Read about cognitive load'}});
  const receipts=plannerReceipts(data,[{type:'create',collection:'projects',id:projectId,title:'Learning'},{type:'create',collection:'tasks',id:taskId,title:'Read about cognitive load'}],entryView);
  assert.deepEqual(receipts.map(r=>r.id),[projectId,taskId]);
  const nativeCalls=[];await executeCaptureAction(data,receipts[0].action,async(action,payload)=>nativeCalls.push({action,payload}));
  assert.equal(modelCalls.length,0);assert.deepEqual(nativeCalls,[{action:'planner',payload:{view:'projects',id:projectId,collection:'projects'}}]);
});

test('an old receipt cannot open a deleted or missing target',()=>{
  const data=freshStore();
  const id=editPlan(data,{type:'saveEntity',collection:'blocks',fields:{title:'Focus',purpose:'',notes:'',projectId:null}});
  const action={kind:'open_saved',collection:'blocks',id};
  assert.equal(resolveCaptureAction(data,action).payload.id,id);
  editPlan(data,{type:'removeEntity',collection:'blocks',id});
  assert.throws(()=>resolveCaptureAction(data,action),/no longer exists/);
  assert.throws(()=>resolveCaptureAction(data,{...action,id:'missing'}),/no longer exists/);
});

test('legacy saved messages hydrate every actual change or entry ID into separate direct actions',()=>{
  const data=freshStore(),projectId=editPlan(data,{type:'saveEntity',collection:'projects',fields:{title:'Learning',purpose:'',notes:'',goalId:null}}),taskId=editPlan(data,{type:'saveTask',fields:{title:'Read slowly'}});
  const oldPlanner={text:'Created Learning · Created Read slowly.',plannerChanges:[{type:'create',collection:'projects',id:projectId,title:'Learning'},{type:'create',collection:'tasks',id:taskId,title:'Read slowly'}],receipts:[entryView(data.entries[0])],suggestions:[{label:'Open',text:'Open the plan I just changed.'}]};
  const historical=oldPlanner.receipts[0];editPlan(data,{type:'saveTask',id:taskId,fields:{title:'Read carefully'}});
  const hydrated=receiptsForMessage(data,oldPlanner,entryView);assert.deepEqual(hydrated.map(r=>r.action.id),[projectId,taskId]);assert.equal(hydrated[1].entry.title,historical.title);assert.equal(data.entries[0].title,'Read carefully');
  const olderEntry={entryIds:[taskId],receipts:[entryView(data.entries[0])],suggestions:[{label:'Open',text:'Open the plan I just changed.'}]};
  assert.deepEqual(receiptsForMessage(data,olderEntry,entryView).map(r=>r.action),[{kind:'open_saved',collection:'tasks',id:taskId}]);
  assert.deepEqual(receiptsForMessage(data,{entryIds:[7],receipts:[{id:7,kind:'checkin',title:'Felt tired'}]},entryView),[]);
  assert.deepEqual(receiptsForMessage(data,{plannerChanges:[{collection:'old-format',id:1}]},entryView),[]);
});

test('typed goal drafts preserve a long source while respecting title and notes limits',()=>{
  const raw='I want to learn more about cognitive load and context shifting and its effects. '+ 'Twitter and WhatsApp have displaced deep focus hours. '.repeat(190);
  assert.ok(raw.length>8000&&raw.length<12000);
  const action=goalDraftAction({label:'Goal',text:'Turn this into a goal.',action:'goal_draft',title:'Understand how context shifting affects my deep focus'},raw,new Date(2026,8,16));
  assert.equal(action.draft.sourceRaw,raw);assert.equal(action.draft.notes,raw.slice(0,8000));assert.ok(action.draft.title.length<=200);assert.equal(action.draft.year,2026);
  const effect=resolveCaptureAction(freshStore(),action);assert.equal(effect.payload.draft.sourceRaw,raw);
});

test('legacy convert-to-goal bubbles are hydrated but generic goal ideas remain ordinary',()=>{
  const raw='I want to understand what constant context switching is doing to me.';
  const [legacy,generic]=bindSuggestionActions([{label:'A goal?',text:'Turn this thought into a goal.'},{label:'Goal ideas',text:'Show me some goal ideas.'}],raw,new Date(2026,8,16));
  assert.equal(legacy.captureAction.kind,'open_goal_draft');assert.equal(legacy.captureAction.draft.sourceRaw,raw);assert.equal(generic.captureAction,undefined);
});

test('opening and cancelling a goal draft never mutates planner data',async()=>{
  const data=freshStore(),before=structuredClone(data),action=goalDraftAction({label:'Goal',text:'Make this a goal.',action:'goal_draft',title:'Protect deep focus'},'I want to protect deep focus.',new Date(2026,8,16));
  await executeCaptureAction(data,action,async()=>{});
  assert.deepEqual(data,before);
});
