import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';

function setup(model=async()=>{throw new Error('No model needed');}){
 const seed=freshStore(),backend=createMemoryBackend(seed),clock=()=>new Date('2026-10-19T16:26:00+05:30');
 const service=createIntentService({backend,model,changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock});
 let json='[]';const traces=createTraceStore({storage:{getItem:()=>json,setItem:(_,value)=>{json=value;}}});
 return {backend,service,traces,agent:createCaptureAgent({service,traces,clock}),conversationId:seed.conversations[0].id};
}
test('local reminder saves exact words first, applies 6 PM, offers one real flip and supports Undo',async()=>{
 const s=setup(),raw='remind me at 6 to call mom';
 const save=s.backend.save;
 s.backend.save=async(version,next)=>{if(next.entries.length)assert.equal(next.intentV2.captures.m.raw,raw);return save(version,next);};
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal(result.calls,0);
 let data=await s.backend.load();assert.equal(data.intentV2.captures.m.raw,raw);
 assert.equal(data.entries[0].planned,'2026-10-19T12:30:00.000Z');assert.equal(data.entries[0].title,'call mom');
 const card=(await s.service.view()).captures[0],help=card.draft.nextStep;
 assert.equal(help.label,'Make it 6 AM');assert.equal(card.draft.question,null);
 const trace=s.traces.get('m');assert.equal(trace.models.length,0);assert.equal(trace.timeInferences[0].rule,'next-12h');
 assert.equal(trace.timeInferences[0].anchorAt,'2026-10-19T10:56:00.000Z');
 await assert.rejects(s.agent.act({...help.action,at:'2026-10-21T00:30:00.000Z'},{actionId:'invented'}),/changed/);
 await s.agent.act(help.action,{actionId:actionIdFor(help.action)});
 data=await s.backend.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].planned,'2026-10-20T00:30:00.000Z');
 await s.agent.undo({draftId:`draft-${actionIdFor(help.action)}`,conversationId:s.conversationId,actionId:'undo-flip'});
 assert.equal((await s.backend.load()).entries[0].planned,'2026-10-19T12:30:00.000Z');
 assert.equal((await s.service.view()).captures.find(c=>c.messageId==='m').draft.nextStep,null);
 await assert.rejects(s.agent.act(help.action,{actionId:'repeat'}),/changed/);
});
test('original inferred capture Undo removes the saved reminder but keeps the words',async()=>{
 const s=setup(),result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:'alarm at 6'});
 await s.agent.undo({draftId:result.draftId,conversationId:s.conversationId,actionId:'undo'});
 assert.equal((await s.backend.load()).entries.length,0);assert.equal((await s.backend.load()).intentV2.captures.m.raw,'alarm at 6');
});
test('model AM/PM questions resolve from their own exact evidence and preserve other tasks',async()=>{
 const raw='Read tomorrow at nine. Walk in the evening at 7pm.';
 const op=operation([field('title','Read','Read'),field('time',null,'tomorrow at nine','stated','unknown')]);
 const second=operation([field('title','Walk','Walk'),field('time','tomorrow at 7pm','in the evening at 7pm')],{opId:'walk',sourceId:'s1'});
 second.fields[1].value='in the evening at 7pm';
 const s=setup(async()=>turn(raw,[op,second],{question:{opId:op.opId,field:'time',prompt:'9 AM or PM?',options:[{label:'9 AM',value:'9am'},{label:'9 PM',value:'9pm'}]}}));
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');const data=await s.backend.load();
 assert.equal(data.entries.find(e=>e.title==='Read').planned,'2026-10-20T03:30:00.000Z');
 assert.equal(data.entries.find(e=>e.title==='Walk').planned,'2026-10-19T13:30:00.000Z');
 assert.equal(s.traces.get('m').timeInferences[0].rule,'stated-day-waking');
});
test('a later edit invalidates a previously offered flip without changing the task',async()=>{
 const s=setup();await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:'remind me at 6 to call mom'});
 const action=(await s.service.view()).captures[0].draft.nextStep.action;
 const data=await s.backend.load();data.entries[0].title='Call Dad';await s.backend.save(data.version,data);
 assert.equal((await s.service.view()).captures[0].draft.nextStep,null);
 await assert.rejects(s.agent.act(action,{actionId:'stale'}),/changed/);
 assert.equal((await s.backend.load()).entries[0].title,'Call Dad');
});
for(const [raw,title,evidence,expected] of [
 ['Call mom tomorrow at 6','Call mom','at 6','2026-10-20T12:30:00.000Z'],
 ['Call mom tomorrow at 6am','Call mom','6','2026-10-20T00:30:00.000Z'],
 ['Exercise tomorrow at 6','Run','tomorrow at 6','2026-10-20T12:30:00.000Z'],
 ['Call mom after work tomorrow at 7','Call mom','tomorrow at 7','2026-10-20T13:30:00.000Z'],
])test(`the whole owning source keeps its day and period for ${raw}`,async()=>{
 const titleField=title==='Run'?field('title',title,null,'suggested'):field('title',title,title);
 const s=setup(async()=>turn(raw,[operation([titleField,field('time',null,evidence,'stated','unknown')])],{question:{opId:'task1',field:'time',prompt:'AM or PM?',options:[]}}));
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal((await s.backend.load()).entries[0].planned,expected);
});
test('a clock on one task never resolves another task with no time evidence',async()=>{
 const raw='Read tomorrow at 6 and buy milk';
 const s=setup(async()=>turn(raw,[operation([field('title','Read','Read'),field('time','tomorrow at 6','tomorrow at 6')]),operation([field('title','Buy milk','buy milk'),field('time',null,null,'stated','unknown')],{opId:'milk'})],{question:{opId:'milk',field:'time',prompt:'When for milk?',options:[]}}));
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'needs-answer');
 const draft=(await s.service.view()).captures[0].draft;
 assert.equal(draft.operations[1].fields.find(f=>f.name==='time').op,'unknown');assert.equal(draft.question.opId,'milk');
});
test('a quantity is not a clock even if the model labels it as time',async()=>{
 const raw='Buy 6 apples tomorrow',s=setup(async()=>turn(raw,[operation([field('title','Buy apples','apples'),field('time','6pm','6')])]));
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal((await s.backend.load()).entries[0].planned,null);
 assert.deepEqual(s.traces.get('m').timeInferences,[]);
});
test('retaining valid parts keeps shared-source ownership and the unanswered task question',async()=>{
 const raw='Read tomorrow at 6 and buy milk. Call dad at noon.';
 const s=setup(async()=>turn(raw,[
  operation([field('title','Read','Read'),field('time','tomorrow at 6','tomorrow at 6')]),
  operation([field('title','Buy milk','buy milk'),field('time',null,null,'stated','unknown')],{opId:'milk'}),
  operation([field('title','Call dad','Call dad'),field('time','tomorrow at 1pm','noon')],{opId:'dad',sourceId:'s1'}),
 ],{question:{opId:'milk',field:'time',prompt:'When for milk?',options:[]}}));
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'needs-answer');
 const draft=(await s.service.view()).captures[0].draft;
 assert.equal(draft.question.opId,'milk');assert.equal(draft.operations[1].fields.find(f=>f.name==='time').op,'unknown');
 assert.equal((await s.backend.load()).entries.length,0);
});
