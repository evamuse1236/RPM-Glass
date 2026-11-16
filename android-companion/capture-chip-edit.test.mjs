import test from 'node:test';
import assert from 'node:assert/strict';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';

const now=new Date('2026-10-19T04:30:00Z'),raw='remind me at 6 pm to call mom';
async function captured(){
 const backend=createMemoryBackend(freshStore());
 const op=operation([field('title','Call mom','call mom'),field('time','6 pm','at 6 pm'),field('alert','reminder','remind me')]);
 const service=createIntentService({backend,model:async()=>turn(raw,[op]),changePlanner,editPlan,undo,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>now});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now});
 const conversationId=(await backend.load()).conversations[0].id;
 const result=await agent.capture({messageId:'m',conversationId,text:raw});
 assert.equal(result.applied.status,'applied');
 const data=await backend.load(),task=data.entries[0],draftId=data.intentV2.captures.m.draftId;
 return {backend,agent,conversationId,draftId,task,edit:(fieldName,value,actionId)=>agent.act({kind:'edit-item',conversationId,draftId,entity:'task',id:String(task.id),field:fieldName,...(value===null?{clear:true}:{value}),label:'Time set to 7 PM'},{actionId})};
}
const entry=async(backend,id)=>(await backend.load()).entries.find(e=>e.id===id);

test('a chip edit saves one field on the saved task and keeps the original words',async()=>{
 const s=await captured(),before=s.task;
 const result=await s.edit('time','2026-10-19 19:00','edit-1');
 assert.equal(result.status,'edited');
 const after=await entry(s.backend,before.id);
 assert.notEqual(after.planned,before.planned);
 assert.equal(new Date(after.planned).getHours(),19);
 assert.equal(after.alertIntent.type,'reminder');assert.equal(after.title,before.title);assert.equal(after.raw,raw);
 const draft=result.intent.captures[0].draft;
 assert.equal(draft.status,'committed');assert.equal(draft.edits.length,1);assert.equal(draft.edits[0].field,'time');assert.equal(draft.edits[0].label,'Time set to 7 PM');
});

test("a chip edit's Undo restores only that field and keeps the capture",async()=>{
 const s=await captured(),before=s.task;
 await s.edit('alert','alarm','edit-a');
 const r=await s.edit('time','2026-10-19 19:00','edit-t');
 await s.agent.act({kind:'undo-edit',conversationId:s.conversationId,draftId:s.draftId,undoId:r.edit.undoId},{actionId:'undo-t'});
 const after=await entry(s.backend,before.id);
 assert.equal(after.planned,before.planned);assert.equal(after.alertIntent.type,'alarm');
 const data=await s.backend.load();assert.equal(data.intentV2.drafts[s.draftId].edits.at(-1).undone,true);
 await assert.rejects(s.agent.act({kind:'undo-edit',conversationId:s.conversationId,draftId:s.draftId,undoId:r.edit.undoId},{actionId:'undo-t2'}),/already undone/);
});

test("the capture's own Undo still takes back the whole capture after chip edits",async()=>{
 const s=await captured();
 await s.edit('time','2026-10-19 19:00','edit-1');
 await s.edit('alert','alarm','edit-2');
 await s.agent.undo({draftId:s.draftId,conversationId:s.conversationId,actionId:'undo-all'});
 const data=await s.backend.load();
 assert.equal(data.entries.filter(e=>!e.archived).length,0);
 assert.equal(data.intentV2.drafts[s.draftId].status,'undone');
 assert.equal(data.intentV2.captures.m.raw,raw);
});

test('chip edits refuse fields, items and captures they do not own',async()=>{
 const s=await captured();
 await assert.rejects(s.agent.act({kind:'edit-item',conversationId:s.conversationId,draftId:s.draftId,entity:'task',id:String(s.task.id),field:'done',value:true},{actionId:'bad-field'}),/cannot be changed/);
 await assert.rejects(s.agent.act({kind:'edit-item',conversationId:s.conversationId,draftId:s.draftId,entity:'task',id:'999',field:'alert',value:'alarm'},{actionId:'bad-id'}),/not part of this capture/);
 await assert.rejects(s.edit('alert','loud','bad-value'));
 const r=await s.edit(  'minutes',30,'len');assert.equal((await entry(s.backend,s.task.id)).minutes,30);assert.equal(r.status,'edited');
 await s.edit('time',null,'clear');const cleared=await entry(s.backend,s.task.id);assert.equal(cleared.planned??null,null);
});

test('every value a task chip sends saves as the planner reads it',async()=>{
 const s=await captured();
 await s.edit('time','2026-10-21','day');let row=await entry(s.backend,s.task.id);
 assert.equal(new Date(row.planned).getDate(),new Date('2026-10-21T12:00:00').getDate());assert.equal(new Date(row.planned).getHours(),18);
 await s.edit('alert','alarm','alarm');await s.edit('recurrence','weekdays','repeat');await s.edit('minutes',45,'length');
 row=await entry(s.backend,s.task.id);
 assert.equal(row.recurrence,'weekdays');assert.equal(row.minutes,45);assert.equal(row.alertIntent?.type??row.alert,'alarm');
 await s.edit('recurrence',null,'never');row=await entry(s.backend,s.task.id);assert.ok(!row.recurrence);
});

/** The receipt card wired to the real agent the way capture-app wires it: actionIdFor(action) is the transaction id. */
async function cardOn(s){
 const {installFakeDom,FakeElement}=await import('./fake-dom.mjs');
 const {createChipCard}=await import('./capture-chip-card.mjs');
 const {intentViewFromData}=await import('./intent-service.mjs');
 const {actionIdFor}=await import('../intent-v2/src/suggestions.mjs');
 installFakeDom();
 let capture=intentViewFromData(await s.backend.load(),{now}).captures.find(c=>c.draft?.id===s.draftId);
 assert.equal(typeof capture.draft.revision,'number');
 const h={card:null,sent:[]};
 const act=async action=>{h.sent.push(action);const r=await s.agent.act(action,{actionId:actionIdFor(action)});capture=intentViewFromData(await s.backend.load(),{now}).captures.find(c=>c.draft?.id===s.draftId);return r;};
 const render=()=>{h.card=new FakeElement('section');h.card.append(h.chips.items(capture,h.card));};
 h.chips=createChipCard({act,refresh:render,choices:()=>({blocks:[],projects:[],goals:[],areas:[]}),today:()=>'2026-10-19'});
 render();
 h.chip=key=>h.card.querySelector(`.edit-chip[data-chip=${key}]`);
 h.pick=async(key,text)=>{h.chip(key).click();[...h.card.querySelectorAll('.tray-pick')].find(b=>text.test(b.textContent)).click();await new Promise(r=>setTimeout(r,0));};
 h.undo=async()=>{const last=capture.draft.edits.at(-1);h.chips.changeRow(capture,last.undoId).querySelector('button').click();await new Promise(r=>setTimeout(r,0));};
 h.capture=()=>capture;
 return h;
}

test('the same chip tap after its Undo, or after another value, saves again; a retry of one tap does not',async()=>{
 const s=await captured(),h=await cardOn(s);
 await h.pick('alert',/^Alarm$/);
 assert.equal((await entry(s.backend,s.task.id)).alertIntent.type,'alarm');
 await h.undo();
 assert.equal((await entry(s.backend,s.task.id)).alertIntent.type,'reminder');
 await h.pick('alert',/^Alarm$/);
 assert.equal((await entry(s.backend,s.task.id)).alertIntent.type,'alarm','Alarm, Undo, Alarm ends as an alarm');
 await h.pick('time',/^7\sPM$/);await h.pick('time',/^3\sPM$/);await h.pick('time',/^7\sPM$/);
 assert.equal(new Date((await entry(s.backend,s.task.id)).planned).getHours(),19,'7 PM, 3 PM, 7 PM ends at 7 PM');
 const edits=(await s.backend.load()).intentV2.drafts[s.draftId].edits;
 assert.equal(edits.length,5);
 const {actionIdFor}=await import('../intent-v2/src/suggestions.mjs');
 const last=h.sent.at(-1),again=await s.agent.act(last,{actionId:actionIdFor(last)});
 assert.equal(again.status,'edited');
 assert.equal((await s.backend.load()).intentV2.drafts[s.draftId].edits.length,5,'a retry of the same tap applies nothing');
});
