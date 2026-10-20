import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {turn} from '../intent-v2/test/helpers.mjs';
const now=new Date('2026-10-19T04:30:00Z');
async function fixture(seed=freshStore()){
 const backend=createMemoryBackend(seed);let calls=0;
 const service=createIntentService({backend,model:async input=>{calls++;return turn(input.sourceUnits.map(u=>u.text).join(' '),[],{draftMode:'none'});},changePlanner,editPlan,undo,readCalendar:async()=>({status:'ready',start:0,end:Date.parse('2027-01-01'),events:[]}),clock:()=>now});
 return {backend,agent:createCaptureAgent({service,traces:createTraceStore({storage:null}),clock:()=>now}),conversationId:seed.conversations[0].id,calls:()=>calls};
}
for(const [text,title,date] of [['call mom at 6','Call mom','2026-10-19T12:30:00.000Z'],['buy milk tomorrow','Buy milk','2026-10-20'],['gym 7am','Gym','2026-10-20T01:30:00.000Z']])test('local Capture saves '+text+' with the normal receipt and Undo',async()=>{
 const s=await fixture(),result=await s.agent.capture({messageId:'local',conversationId:s.conversationId,text});
 assert.equal(s.calls(),0);assert.equal(result.applied?.status,'applied');
 const data=await s.backend.load(),task=data.entries[0];assert.equal(task.title,title);assert.equal(task.planned??task.plannedDate,date);assert.equal(task.raw,text);
 assert.ok(result.applied.undoId);
 await s.agent.undo({draftId:result.draftId,conversationId:s.conversationId,actionId:'undo'});
 assert.equal((await s.backend.load()).entries.length,0);
});
for(const text of ['drank 2 glasses','drank two glasses of water','I just drank water'])test('local water logs '+text+' once with Undo',async()=>{
 const s=await fixture(),input={messageId:'local',conversationId:s.conversationId,text};
 const result=await s.agent.capture(input);await s.agent.capture(input);
 assert.equal(s.calls(),0);const data=await s.backend.load();
 assert.equal(data.planner.body.water.glasses.length,/two|2/.test(text)?2:1);
 assert.ok(result.applied.undoId);assert.equal(data.entries.length,0);
 await s.agent.undo({draftId:result.draftId,conversationId:s.conversationId,actionId:'undo'});
 assert.equal((await s.backend.load()).planner?.body?.water?.glasses?.length??0,0);
});
test('uncertain task shapes, references and questions always use the model',async()=>{
 for(const text of ['call mom and dad at 6','do not call mom at 6','maybe call mom at 6','call mom at 6 or 7','call mom at 6 because she needs help','call mom in 6 months','buy 2 kg rice and 5 litre oil','call mom at 6?','send a WhatsApp to Neha at 6','gym 7am every day','drank around 2 glasses','drank 2 litres of water','drank 2 glasses yesterday','call 101 at 6']){
  const s=await fixture();await s.agent.capture({messageId:'ambiguous',conversationId:s.conversationId,text});assert.equal(s.calls(),1,text);
 }
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Gym morning',planned:'2026-10-20T07:00:00+05:30'}},now);
 const s=await fixture(seed);await s.agent.capture({messageId:'existing',conversationId:s.conversationId,text:'gym 7am'});assert.equal(s.calls(),1);
});

test('local creation abstains when family aliases or Block filing need interpretation',async()=>{
 for(const seed of [freshStore(),freshStore()]){
  if(!(seed.planner?.blocks??[]).length)editPlan(seed,{type:'saveEntity',collection:'blocks',fields:{title:'A healthy week',purpose:'Cook at home'}},now);
  const s=await fixture(seed);await s.agent.capture({messageId:'needs-filing',conversationId:s.conversationId,text:'buy milk tomorrow'});assert.equal(s.calls(),1);
 }
 const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Call Amma'}},now);
 const s=await fixture(seed);await s.agent.capture({messageId:'alias',conversationId:s.conversationId,text:'call mom at 6'});assert.equal(s.calls(),1);
});

test('water counts reject other drinks, estimates, dates and unsupported units',async()=>{
 for(const text of ['drank 2 glasses of wine','drank about two glasses of water','drank 31 glasses','drank 0 glasses','I will drink 2 glasses','I didnt drink 2 glasses','drank 2 glasses yesterday','he drank two glasses of water']){
  const s=await fixture();await s.agent.capture({messageId:'uncertain-water',conversationId:s.conversationId,text});assert.equal(s.calls(),1,text);
 }
});
