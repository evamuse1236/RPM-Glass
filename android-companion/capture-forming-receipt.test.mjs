import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {installFakeDom,FakeElement} from './fake-dom.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan,localDay} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {installForming} from './capture-forming.mjs';
import {createChipCard} from './capture-chip-card.mjs';
import {receiptCard} from './capture-cards.mjs';

installFakeDom();
const NOW=new Date('2026-09-16T04:00:00.000Z');
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};

async function savedCapture(raw,ops){
 const backend=createMemoryBackend(freshStore());
 const service=createIntentService({backend,model:async()=>turn(raw,ops),changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,clock:()=>NOW,timezone:'Asia/Kolkata'});
 const traces=createTraceStore({storage:memoryStorage(),emit:()=>{},clock:()=>NOW});
 const agent=createCaptureAgent({service,traces,clock:()=>NOW});
 const conversationId=(await backend.load()).conversations[0].id;
 const result=await agent.capture({messageId:'m-'+raw.replace(/[^A-Za-z0-9]+/g,'-'),conversationId,text:raw});
 assert.equal(result.applied.status,'applied');
 return intentViewFromData(await backend.load(),{now:NOW}).captures[0];
}

function sendScreen(raw){
 const host=new FakeElement('div'),content=new FakeElement('div');
 const forming=installForming({host,platform:{},conversationId:()=>'c1'});
 forming.update(raw,{enabled:false,visible:true});
 forming.hold(raw);
 return {host,content,forming};
}

function showReceipt(content,capture){
 const chips=createChipCard({act:async()=>({ok:true}),refresh:()=>{},choices:()=>({blocks:[],projects:[],goals:[],areas:[]}),today:localDay});
 const node=receiptCard(capture,{canUndo:true,undoId:null,on:{chips,undo(){},openPlanner(){},keep(){},retry(){}}});
 content.replaceChildren(node);
 return node;
}

const create=(opId,title,time=null)=>({opId,kind:'create',entity:'task',title,time,minutes:null});
const CASES=[
 ['call mom at 8pm and buy milk tomorrow',
  [operation([field('title','Call mom','call mom'),field('time','today 8pm','at 8pm')],{opId:'mom'}),operation([field('title','Buy milk','buy milk'),field('time','tomorrow','tomorrow')],{opId:'milk',sourceId:'s0'})],
  [create('mom','Call mom','8pm'),create('milk','Buy milk','tomorrow')]],
 ['Exercise now 30 min',
  [operation([field('title','Exercise','Exercise'),field('minutes',30,'30 min')],{opId:'ex'})],
  [create('ex','Exercise')]],
];

for(const [raw,ops,partial] of CASES){
 test(`a saved receipt takes over the forming cards for "${raw}"`,async()=>{
  const capture=await savedCapture(raw,ops);
  const s=sendScreen(raw);
  s.forming.fill(partial);
  const land=s.forming.lift();
  const card=showReceipt(s.content,capture);
  assert.equal(land(s.content),true);
  assert.equal(s.host.children.length,0,'no unsaved copy is left under the receipt');
  assert.deepEqual([...card.querySelectorAll('.item-title')].map(n=>n.textContent),capture.draft.lines.map(l=>l.title));
  assert.doesNotMatch(card.textContent,/Not saved yet|Something went wrong/);
 });
}

test('a forming handoff that breaks clears its cards and reports the error, without throwing',async()=>{
 const capture=await savedCapture(CASES[0][0],CASES[0][1]);
 const s=sendScreen(CASES[0][0]);
 const land=s.forming.lift();
 showReceipt(s.content,capture);
 s.content.querySelectorAll=()=>{throw new TypeError('broken');};
 const reported=[],error=console.error;
 console.error=e=>reported.push(e);
 try{assert.equal(land(s.content),false);}finally{console.error=error;}
 assert.equal(s.host.children.length,0);
 assert.equal(s.host.getAttribute('aria-busy'),null);
 assert.match(String(reported[0]),/broken/);
});
