import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';

const NOW=new Date('2026-10-18T18:00:00.000Z'),AT='2026-10-18T17:58:39.253Z',ID='9685108a-7142-4f1d-9c20-de0d85c62d89';
const RAW="okay for tonight's dinner I was thinking of getting some to meet us in the morning at about 6:00 a.m. that will take me 30 minutes and I really want to do it because getting good food is important to me";
const set=(name,value,evidence,evidenceSourceId)=>({name,op:'set',value,origin:'stated',evidence,sourceMessageId:ID,evidenceSourceId});
export function phoneStore(options=[{label:'Tomorrow at 6:00 AM',value:'tomorrow at 6:00 AM'},{label:'Tonight, no set time',value:'tonight'}]){
 const data=freshStore(),conversationId=data.conversations[0].id,draftId=`draft-${ID}`;
 const operations=[{opId:'op1',sourceId:'s0',kind:'create',entity:'task',targetId:null,fields:[set('title',"Get something for tonight's dinner",'for tonight\'s dinner I was thinking of getting some','s0'),{name:'time',op:'unknown',value:null,origin:'stated',evidence:null,sourceMessageId:ID,evidenceSourceId:null},set('minutes',30,'30 minutes','s2'),set('purpose','getting good food is important to me','getting good food is important to me','s2')]}];
 data.intentV2={schema:1,approvedMemories:[],sortPreviews:{},transactions:{},
  captures:{[ID]:{messageId:ID,conversationId,raw:RAW,at:AT,timezone:'Asia/Kolkata',focusDraftId:null,focusRevision:null,status:'interpreted',draftId,decisions:[{sourceId:'s0',disposition:'action',note:null}],reply:'Draft ready to review.',memoryCandidates:[],card:null,calls:1}},
  drafts:{[draftId]:{id:draftId,conversationId,revision:1,status:'draft',created:AT,updated:AT,operations,guards:{},question:{opId:'op1',field:'time',prompt:'When did you mean: 6 a.m. tomorrow morning, or tonight for dinner?',options},mode:'capture',review:null,sourceMessageIds:[ID],reply:'Draft ready to review.',timeAnchorAt:AT,schedulePreview:{anchorAt:AT,timezone:'Asia/Kolkata',items:[]}}}};
 return data;
}
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
function phone(seed=phoneStore()){
 const backend=createMemoryBackend(seed);
 const service=createIntentService({backend,model:async()=>{throw new Error('No model call is expected');},changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,clock:()=>NOW,timezone:'Asia/Kolkata'});
 const agent=createCaptureAgent({service,traces:createTraceStore({storage:memoryStorage()}),clock:()=>NOW});
 const card=async()=>intentViewFromData(await backend.load(),{now:NOW}).captures.find(c=>c.messageId===ID);
 return {backend,agent,card};
}

test('tapping "Tomorrow at 6:00 AM" on the phone draft answers it and adds the task',async()=>{
 const {backend,agent,card}=phone(),chip=(await card()).draft.actions.find(a=>a.label==='Tomorrow at 6:00 AM');
 await agent.act(chip.action,{actionId:actionIdFor(chip.action)});
 const after=await card(),task=(await backend.load()).entries.find(e=>e.title==="Get something for tonight's dinner");
 assert.equal(after.draft.status,'committed');
 assert.equal(task.planned,'2026-10-19T00:30:00.000Z');assert.equal(task.minutes,30);
});

test('tapping "Tonight, no set time" adds the task for today with no time',async()=>{
 const {backend,agent,card}=phone(),chip=(await card()).draft.actions.find(a=>a.label==='Tonight, no set time');
 await agent.act(chip.action,{actionId:actionIdFor(chip.action)});
 const task=(await backend.load()).entries.find(e=>e.title==="Get something for tonight's dinner");
 assert.equal((await card()).draft.status,'committed');assert.equal(task.planned??null,null);assert.equal(task.plannedDate,'2026-10-18');
});

const MODEL_ANSWER_VALUES=['tonight','tomorrow at 6:00 AM','this evening','no set time','6.30 p.m.',"Mum's place, after work",'कल सुबह 6 बजे','x'.repeat(2000),30,true];
test('every answer chip gets a short local action ID that the service accepts',async()=>{
 for(const value of MODEL_ANSWER_VALUES){
  const field=typeof value==='string'?(value.length>100?'notes':'time'):typeof value==='number'?'minutes':'must';
  const seed=phoneStore([{label:'This one',value}]);seed.intentV2.drafts[`draft-${ID}`].question.field=field;
  const {agent,card}=phone(seed),chip=(await card()).draft.actions.find(a=>a.label==='This one'),id=actionIdFor(chip.action);
  assert.match(id,/^[A-Za-z0-9:_-]{1,100}$/,String(value).slice(0,40));
  assert.equal(id,actionIdFor(structuredClone(chip.action)),'the same tap keeps the same ID');
  const result=await agent.act(chip.action,{actionId:id});
  assert.ok(['draft','committed'].includes(result.status),String(value).slice(0,40));
 }
 const ids=new Set(MODEL_ANSWER_VALUES.map(value=>actionIdFor({kind:'answer',draftId:'d',revision:1,opId:'op1',field:'time',value})));
 assert.equal(ids.size,MODEL_ANSWER_VALUES.length,'different answers never share an ID');
});
