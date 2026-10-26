import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';

for(const [id,variant] of [['A','original'],['B','original'],['C','original'],['D','original'],['A','omitted time'],['B','wrong range'],['B','false receipt']])test(`live Haiku replay retains the stated time: ${id} / ${variant}`,async()=>{
 const fixture=JSON.parse(await readFile(new URL(`../intent-v2/test/fixtures/runtime-haiku/${id}.json`,import.meta.url),'utf8'));
 const output=structuredClone(fixture.output);
 if(variant==='omitted time')output.operations[0].fields=output.operations[0].fields.filter(f=>f.name!=='time');
 if(variant==='wrong range'){const f=output.operations[0].fields.find(f=>f.name==='time');f.value='tomorrow from 12am to 1am';}
 if(variant==='false receipt'){output.operations=[];output.draftMode='none';output.reply='Saved a meeting for 12:00 AM to 1:00 AM tomorrow';}
 const seed=freshStore(),now=new Date(fixture.now);
 if(['B','D'].includes(id))editPlan(seed,{type:'saveTask',fields:{title:id==='B'?'Task preparation':'Meeting preparation'}},now);
 const initial=seed.entries.length,backend=createMemoryBackend(seed);let calls=0;
 const service=createIntentService({backend,model:async()=>{calls++;return output;},changePlanner,undo,editPlan,clock:()=>now,readCalendar:async()=>({status:'not_selected',events:[]})});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'live-'+id,conversationId:seed.conversations[0].id,text:fixture.raw});
 const data=await backend.load(),card=(await service.view()).captures[0];
 assert.equal(calls,1);
 if(variant==='false receipt'){assert.equal(data.entries.length,initial);assert.equal(card.reply,'Nothing changed.');return;}
 assert.equal(result.applied.status,'applied');assert.equal(data.entries.length,initial+1);
 assert.equal(data.intentV2.captures['live-'+id].raw,fixture.raw);assert.equal(card.lastError,null);
 assert.doesNotMatch(card.draft.notes.join(' '),/time was not applied/);
 const saved=data.entries.at(-1);
 if(id==='A'){assert.equal(saved.planned,fixture.now);assert.equal(saved.minutes,30);}
 if(id==='B'){assert.equal(saved.planned,'2026-10-27T18:30:00.000Z');assert.equal(saved.minutes,10);}
 if(id==='C')assert.equal(saved.planned,'2026-10-28T12:30:00.000Z');
 if(id==='D'){assert.equal(saved.planned,fixture.now);assert.equal(saved.minutes,12);}
 assert.ok(card.draft.lines.some(l=>l.title===saved.title));
});

test('a later action cannot lend its day to an explicit clock on the first task',async()=>{
 const f=JSON.parse(await readFile(new URL('../intent-v2/test/fixtures/runtime-haiku/multi-action-clock.json',import.meta.url),'utf8'));
 const seed=freshStore(),backend=createMemoryBackend(seed),now=new Date(f.now);let calls=0;
 const service=createIntentService({backend,model:async()=>{calls++;return f.output;},changePlanner,undo,editPlan,clock:()=>now,readCalendar:async()=>({status:'not_selected',events:[]})});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const result=await agent.capture({messageId:'multi',conversationId:seed.conversations[0].id,text:f.raw});
 const data=await backend.load();assert.equal(calls,1);assert.equal(result.applied.status,'applied');
 assert.equal(data.entries[0].planned,'2026-10-19T14:30:00.000Z');assert.equal(data.entries[1].plannedDate,'2026-10-20');
 assert.ok((await service.view()).captures[0].draft.lines.some(l=>l.title==='Call Mom'));
});

test('a vent acknowledges the feeling without an unsolicited follow-up question',async()=>{
 const f=JSON.parse(await readFile(new URL('../intent-v2/test/fixtures/runtime-haiku/vent.json',import.meta.url),'utf8'));
 const seed=freshStore(),backend=createMemoryBackend(seed),now=new Date(f.now);
 const service=createIntentService({backend,model:async()=>f.output,changePlanner,undo,editPlan,clock:()=>now,readCalendar:async()=>({status:'not_selected',events:[]})});
 await service.capture({messageId:'vent',conversationId:seed.conversations[0].id,text:f.raw});
 const data=await backend.load(),card=(await service.view()).captures[0];assert.equal(data.entries.length,0);assert.equal(data.intentV2.captures.vent.raw,f.raw);
 assert.match(card.reply,/That sounds draining/);assert.doesNotMatch(card.reply,/\?|Want to put/);
});

test('a suggested alert cannot make a checked evening clock ask AM or PM',async()=>{
 const f=JSON.parse(await readFile(new URL('../intent-v2/test/fixtures/runtime-haiku/shaam.json',import.meta.url),'utf8'));
 const seed=freshStore(),backend=createMemoryBackend(seed),now=new Date(f.now);
 const service=createIntentService({backend,model:async()=>f.output,changePlanner,undo,editPlan,clock:()=>now,readCalendar:async()=>({status:'not_selected',events:[]})});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 await agent.capture({messageId:'shaam',conversationId:seed.conversations[0].id,text:f.raw});
 assert.equal((await backend.load()).entries[0].planned,'2026-10-19T13:30:00.000Z');
 assert.doesNotMatch((await service.view()).captures[0].reply,/\?/);
});
