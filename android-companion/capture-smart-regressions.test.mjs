import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan,conflicts,timelineItems} from './planner-state.mjs';
import {occurrences,completeTask} from './planner-recurrence.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';

const now=new Date('2026-10-19T16:26:00+05:30');
function setup({model=async()=>{throw new Error('No model needed');},seed=freshStore(),calendar={status:'not_selected',events:[]}}={}){
 const backend=createMemoryBackend(seed),clock=()=>new Date(now);
 const service=createIntentService({backend,model,changePlanner,editPlan,undo,readCalendar:async()=>calendar,clock});
 let json='[]';const traces=createTraceStore({storage:{getItem:()=>json,setItem:(_,value)=>{json=value;}}});
 return {backend,service,agent:createCaptureAgent({service,traces,clock}),conversationId:seed.conversations[0].id};
}
for(const [raw,expected] of [['remind me at 6 to call mom','Call mom'],['remind me at 6 to call iPhone SUPPORT','Call iPhone SUPPORT'],['remind me at 6 to iPhone setup','iPhone setup']])
 test(`local titles preserve casing while beginning a sentence for ${raw}`,async()=>{
  const s=setup(),result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
  assert.equal(result.applied.status,'applied');assert.equal((await s.backend.load()).entries[0].title,expected);
 });
test('wake-up without a day saves tomorrow morning with a guarded PM flip',async()=>{
 const s=setup(),raw='wake me up at 7';
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal(result.calls,0);
 assert.equal((await s.backend.load()).entries[0].planned,'2026-10-20T01:30:00.000Z');
 const help=(await s.service.view()).captures[0].draft.nextStep;
 assert.equal(help.label,'Make it 7 PM');
 await s.agent.act(help.action,{actionId:actionIdFor(help.action)});
 assert.equal((await s.backend.load()).entries[0].planned,'2026-10-20T13:30:00.000Z');
 await assert.rejects(s.agent.act(help.action,{actionId:'stale'}),/changed/);
});
test('an after-work reminder keeps its exact clock locally and offers the guarded AM alternate',async()=>{
 const raw='remind me tomorrow at 7 to call mom after work',s=setup();
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied?.status,'applied');assert.equal(result.calls,0);assert.equal(result.applied.warning,null);
 const data=await s.backend.load();assert.equal(data.entries[0].planned,'2026-10-20T13:30:00.000Z');assert.equal(data.entries[0].raw,raw);
 const help=(await s.service.view()).captures[0].draft.nextStep;
 assert.equal(help.label,'Make it 7 AM');
 await s.agent.act(help.action,{actionId:actionIdFor(help.action)});
 assert.equal((await s.backend.load()).entries[0].planned,'2026-10-20T01:30:00.000Z');
 await assert.rejects(s.agent.act(help.action,{actionId:'stale'}),/changed/);
});
test('model titles and exact semantic evidence use the same boundary as local captures',async()=>{
 const raw='morning run at 9 and call iPhone SUPPORT at 7';
 const s=setup({model:async()=>turn(raw,[operation([field('title','morning run','morning run'),field('time',null,'at 9','stated','unknown')]),operation([field('title','call iPhone SUPPORT','call iPhone SUPPORT'),field('time',null,'at 7','stated','unknown')],{opId:'call'})])});
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');const entries=(await s.backend.load()).entries;
 assert.equal(entries[0].title,'Morning run');assert.equal(entries[0].planned,'2026-10-20T03:30:00.000Z');
 assert.equal(entries[1].title,'Call iPhone SUPPORT');assert.equal(entries[1].planned,'2026-10-19T13:30:00.000Z');
});
test('Hinglish morning and dinner clocks save independently from exact evidence',async()=>{
 const raw='subah 7 baje uthana. dinner at 8';
 const s=setup({model:async()=>turn(raw,[operation([field('title','uthana','uthana'),field('time','subah 7 baje','subah 7 baje'),field('alert','alarm','uthana')]),operation([field('title','dinner','dinner'),field('time',null,'at 8','stated','unknown')],{opId:'dinner',sourceId:'s1'})])});
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');const entries=(await s.backend.load()).entries;
 assert.equal(entries[0].planned,'2026-10-20T01:30:00.000Z');assert.equal(entries[1].planned,'2026-10-19T14:30:00.000Z');
});
test('a moment on either side never conflicts with a duration or a calendar event',()=>{
 const at=now.getTime()+3600000,calendar=[{id:'event',title:'Meeting',start:at-600000,end:at+3600000}];
 const data={entries:[{id:1,kind:'plan',planned:new Date(at).toISOString(),minutes:null}]};
 assert.deepEqual(conflicts(data,at,30),[]);
 assert.deepEqual(conflicts(data,at,null,calendar),[]);
 assert.deepEqual(conflicts(data,at,undefined,calendar),[]);
 data.entries[0].minutes=30;
 assert.equal(conflicts(data,at,30,calendar).length,2);
 assert.equal(conflicts(data,at+1800000,30).length,0);
});
for(const alert of ['reminder','alarm'])test(`${alert} with no duration saves over a calendar event`,async()=>{
 const at=Date.parse('2026-10-19T18:00:00+05:30'),s=setup({calendar:{status:'ready',start:+now-86400000,end:+now+86400000,events:[{id:'event',title:'Meeting',start:at-600000,end:at+3600000}]}});
 const result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:`${alert} at 6`});
 assert.equal(result.applied.status,'applied');assert.equal(result.applied.warning,null);assert.equal((await s.backend.load()).entries[0].minutes,null);
});
test('a durationless saved alert does not block a new duration, while real durations still clash',async()=>{
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Reminder',planned:'2026-10-19T12:30:00.000Z',minutes:null,alert:'reminder'}},now);
 const raw='Read at 6pm for 30 minutes',model=async()=>turn(raw,[operation([field('title','Read','Read'),field('time','at 6pm','at 6pm'),field('minutes',30,'for 30 minutes')])]);
 const s=setup({seed,model}),result=await s.agent.capture({messageId:'m',conversationId:s.conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal(result.applied.warning,null);assert.equal((await s.backend.load()).entries.length,2);
 const busy=structuredClone(seed);busy.entries[0].minutes=30;
 const clash=setup({seed:busy,model}),blocked=await clash.agent.capture({messageId:'m',conversationId:clash.conversationId,text:raw});
 assert.equal(blocked.applied.status,'applied');assert.match(blocked.applied.warning,/overlap/);assert.equal((await clash.backend.load()).entries.length,2);
});
test('new manual tasks and recurring alerts keep unknown duration as visible, completable moments',()=>{
 const data=freshStore();editPlan(data,{type:'saveTask',fields:{title:'call iPhone SUPPORT',planned:'2026-10-20T01:30:00.000Z',recurrence:'daily',alert:'alarm'}},now);
 const e=data.entries[0];assert.equal(e.minutes,null);assert.equal(e.title,'Call iPhone SUPPORT');
 const at=Date.parse(e.planned),rows=occurrences(e,at,at+1);
 assert.equal(rows.length,1);assert.equal(rows[0].end,rows[0].start);
 completeTask(e,e.planned,now);assert.equal(occurrences(e,at,at+1).length,0);
});
test('a moment at midnight remains in its day timeline',()=>{
 const data=freshStore();editPlan(data,{type:'saveTask',fields:{title:'Alarm',planned:new Date('2026-10-20T00:00:00').toISOString(),minutes:null}},now);
 const rows=timelineItems(data,'2026-10-20');assert.equal(rows.length,1);assert.equal(rows[0].start,rows[0].end);
});
