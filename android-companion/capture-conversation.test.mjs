import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {sourceUnits} from '../intent-v2/src/context.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {planSnapshot} from './capture-snapshot.mjs';
import {cardKind} from './capture-session.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';

const NOW=new Date('2026-10-19T04:30:00.000Z');
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
const COOK='Cook dinner tonight at 7';
const cookDraft=()=>turn(COOK,[operation([field('title','Cook dinner',COOK),field('time',null,null,'stated','unknown')],{opId:'cook'})],{question:{opId:'cook',field:'time',prompt:'7 AM or 7 PM?',options:[{label:'7 PM',value:'7pm'},{label:'7 AM',value:'7am'}]}});
const asking=(raw,choices)=>turn(raw,[],{mode:'capture',draftMode:'none',reply:'Which one should I delete?',decisions:sourceUnits(raw).map(u=>({sourceId:u.id,disposition:'action',note:null})),clarification:{prompt:'Which one should I delete?',action:'remove',choices}});
const fragment=raw=>turn(raw,[],{mode:'reflect',draftMode:'none',reply:'',decisions:[{sourceId:'s0',disposition:'reflection',note:'Word fragment, no request to act on'}]});

function phone({second='task'}={}){
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Dinner with Asha',alert:'alarm'}},NOW);
 const backend=createMemoryBackend(seed),inputs=[];
 const choices=()=>[{label:'The cooking draft',targets:[{entity:'draft',id:'draft-m0'}]},{label:second==='task'?'Dinner with Asha':'The dinner alarm',targets:[{entity:second,id:'1'}]},{label:'Both',targets:[{entity:'draft',id:'draft-m0'},{entity:second,id:'1'}]}];
 const model=async(input,{route}={})=>{inputs.push({...input,route});const raw=input.sourceUnits.map(u=>u.text).join(' ');return raw===COOK?cookDraft():raw==='First'?fragment(raw):asking(raw,choices());};
 const service=createIntentService({backend,model,changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,snapshot:async({data})=>planSnapshot(data,{now:NOW,timezone:'Asia/Kolkata'}),clock:()=>NOW,timezone:'Asia/Kolkata'});
 const traces=createTraceStore({storage:memoryStorage(),clock:()=>NOW});
 const agent=createCaptureAgent({service,traces,clock:()=>NOW});
 return {backend,inputs,service,traces,agent};
}
const send=async(p,messageId,text)=>p.agent.capture({messageId,conversationId:(await p.backend.load()).conversations[0].id,text});
const view=async p=>intentViewFromData(await p.backend.load(),{now:NOW});

test('the 19 Oct conversation: focus survives, "Both" needs no model, one change, one Undo restores both',async()=>{
 const p=phone();
 await send(p,'m0',COOK);
 await send(p,'m1','Delete this');
 assert.equal(p.inputs[1].activeDraft.id,'draft-m0','turn 1 points at the cooking draft');
 assert.equal(cardKind((await view(p)).captures[0]),'question');
 await send(p,'m2','That one only');
 assert.equal(p.inputs[2].activeDraft.id,'draft-m0','turn 2 carries the cooking draft as focus');
 assert.equal(p.inputs[2].openQuestion.id,'q-m1');
 assert.equal(p.inputs[2].route.reason,'answer_to_question');assert.equal(p.inputs[2].route.effort,'high');
 assert.deepEqual(p.inputs[2].openQuestion.choices.map(c=>c.label),['The cooking draft','Dinner with Asha','Both']);
 assert.equal(p.inputs.length,3);
 const both=await send(p,'m3','Both');
 assert.equal(p.inputs.length,3,'"Both" resolves with zero model calls');
 assert.equal(both.applied.status,'applied');
 let data=await p.backend.load();
 assert.equal(data.entries.find(e=>e.id===1).archived,true);
 assert.equal(data.intentV2.drafts['draft-m0'].status,'parked');
 const card=(await view(p)).captures[0];
 assert.equal(card.messageId,'m3');assert.equal(cardKind(card),'confirm');
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.title]),[['Moved to Trash','Dinner with Asha'],['Set aside','Cook dinner']]);
 assert.equal(card.draft.lines[0].alert,null,'a task in Trash shows no alarm chip');
 assert.equal(p.traces.get('m3').models.length,0);
 const asked=(await view(p)).captures.find(c=>c.messageId==='m2').clarification;
 assert.equal(asked.open,false);assert.deepEqual(asked.actions,[],'an answered question shows no chips');
 await send(p,'m4','First');
 assert.equal(p.inputs.length,4,'"First" after the answer is a new thought for the model');
 data=await p.backend.load();
 assert.equal(data.entries.find(e=>e.id===1).archived,true);assert.equal(data.intentV2.drafts['draft-m0'].status,'parked');
 await p.agent.undo({draftId:card.draft.id,conversationId:card.conversationId,actionId:'undo-both'});
 data=await p.backend.load();
 assert.equal(data.entries.find(e=>e.id===1).archived,false,'Undo brings the task back');
 assert.equal(data.intentV2.drafts['draft-m0'].status,'draft','Undo brings the draft back');
});

test('when the question offered the alarm, "Both" turns the alarm off and sets the draft aside; Undo restores both',async()=>{
 const p=phone({second:'alarm'});
 await send(p,'m0',COOK);await send(p,'m1','Delete this');
 await send(p,'m2','Both');
 assert.equal(p.inputs.length,2);
 let data=await p.backend.load(),task=data.entries.find(e=>e.id===1);
 assert.equal(task.archived,false);assert.equal(task.alertIntent.type,'off');
 assert.equal(data.intentV2.drafts['draft-m0'].status,'parked');
 const card=(await view(p)).captures[0];
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.title]),[['Alarm off','Dinner with Asha'],['Set aside','Cook dinner']]);
 await p.agent.undo({draftId:card.draft.id,conversationId:card.conversationId,actionId:'undo-alarm'});
 data=await p.backend.load();
 assert.equal(data.entries.find(e=>e.id===1).alertIntent.type,'alarm');assert.equal(data.intentV2.drafts['draft-m0'].status,'draft');
});

test('a chip tap answers the question with no model call; a repeat tap does nothing more; a later tap is refused',async()=>{
 const p=phone();
 await send(p,'m0',COOK);await send(p,'m1','Delete this');
 const [cooking,dinner]=(await view(p)).captures[0].clarification.actions;
 assert.deepEqual([cooking.label,dinner.label],['The cooking draft','Dinner with Asha']);
 const id=actionIdFor(cooking.action);
 await p.agent.choose(cooking.action,{actionId:id});
 await p.agent.choose(cooking.action,{actionId:id});
 assert.equal(p.inputs.length,2);
 let data=await p.backend.load();
 assert.equal(data.intentV2.drafts['draft-m0'].status,'parked');assert.equal(data.entries.find(e=>e.id===1).archived,false);
 assert.equal(Object.values(data.intentV2.captures).filter(c=>c.choice).length,1);
 assert.equal((await view(p)).captures[0].raw,'The cooking draft');
 await assert.rejects(p.agent.choose(dinner.action,{actionId:actionIdFor(dinner.action)}),/already answered/);
 data=await p.backend.load();
 assert.equal(data.entries.find(e=>e.id===1).archived,false,'the expired choice changed nothing');
});
