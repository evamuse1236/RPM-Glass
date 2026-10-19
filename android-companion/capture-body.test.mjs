import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';

const NOW=new Date('2026-10-19T07:00:00.000Z');
const water=(count=2)=>operation([field('title','Water',null,'suggested'),field('count',count,'two glasses')],{opId:'water1',entity:'water'});
function fixture(raw,operations){
 const backend=createMemoryBackend(freshStore());
 const service=createIntentService({backend,model:async()=>turn(raw,operations),changePlanner,undo,editPlan,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>NOW});
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 return {backend,service,agent:createCaptureAgent({service,traces:createTraceStore({storage,clock:()=>NOW}),clock:()=>NOW})};
}
async function capture(s,raw){
 const conversationId=(await s.backend.load()).conversations[0].id;
 const result=await s.agent.capture({messageId:'m-body',conversationId,text:raw});
 const data=await s.backend.load(),card=intentViewFromData(data,{now:NOW}).captures[0];
 return {result,data,card,conversationId};
}

test('Capture logs two glasses in the body store with a receipt and Undo, without inventing a task',async()=>{
 const raw='I just drank two glasses of water. Log those now.';
 const s=fixture(raw,[water()]),{result,data,card,conversationId}=await capture(s,raw);
 assert.equal(result.applied?.status,'applied');
 assert.equal(data.intentV2.captures['m-body'].raw,raw);
 assert.equal(data.entries.length,0);
 assert.deepEqual(data.planner.body.water.glasses,[NOW.toISOString(),NOW.toISOString()]);
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.entity,l.title]),[['Logged','water','2 glasses of water']]);
 assert.equal(card.draft.confirm,null);
 await s.agent.undo({draftId:card.draft.id,conversationId,actionId:'undo-water'});
 assert.equal((await s.backend.load()).planner?.body?.water?.glasses?.length??0,0);
});

test('Capture records skipped lunch without changing the recurring meal plan or inventing food',async()=>{
 const raw="Mark today's lunch skipped. Breakfast happened, dinner is still on.";
 const lunch=operation([field('title',"today's lunch skipped","today's lunch skipped"),field('slot','lunch','lunch'),field('state','skipped','skipped')],{opId:'lunch1',entity:'meal'});
 const s=fixture(raw,[lunch]),{result,data,card}=await capture(s,raw);
 assert.equal(result.applied?.status,'applied');
 assert.equal(data.entries.length,0);
 assert.deepEqual(data.planner.body.meals.map(({name,slot,state,at})=>({name,slot,state,at})),[{name:"today's lunch skipped",slot:'lunch',state:'skipped',at:NOW.toISOString()}]);
 assert.equal(data.planner.body.mealPlan,undefined);
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.title]),[['Skipped','Lunch']]);
});

test('a water log and a new task share one canonical Undo',async()=>{
 const raw='Log two glasses of water. Also add refill the water bottle.';
 const s=fixture(raw,[water(),operation([field('title','refill the water bottle','refill the water bottle')],{opId:'refill1'})]);
 const {result,data,card,conversationId}=await capture(s,raw);
 assert.equal(result.applied?.status,'applied');
 assert.equal(data.planner.body.water.glasses.length,2);
 assert.deepEqual(data.entries.map(e=>e.title),['refill the water bottle']);
 assert.equal(data.entries[0].raw,raw);
 assert.deepEqual(card.draft.lines.map(l=>l.title),['2 glasses of water','refill the water bottle']);
 await s.agent.undo({draftId:card.draft.id,conversationId,actionId:'undo-mixed'});
 const restored=await s.backend.load();
 assert.equal(restored.entries.length,0);
 assert.equal(restored.planner?.body?.water?.glasses?.length??0,0);
 assert.equal(restored.intentV2.captures['m-body'].raw,raw);
});

test('retrying the same captured water log never logs the glasses twice',async()=>{
 const raw='Log two glasses of water.';
 const s=fixture(raw,[water()]);
 await capture(s,raw);
 const {data}=await capture(s,raw);
 assert.equal(data.planner.body.water.glasses.length,2);
 assert.equal(Object.keys(data.intentV2.captures).length,1);
});

test('Capture logs the food named without a nutrition guess or task',async()=>{
 const raw='I ate poha for breakfast. Log that.';
 const meal=operation([field('title','poha','poha'),field('slot','breakfast','breakfast'),field('state','logged','ate')],{opId:'meal1',entity:'meal'});
 const s=fixture(raw,[meal]),{result,data,card}=await capture(s,raw);
 assert.equal(result.applied?.status,'applied');
 assert.equal(data.entries.length,0);
 assert.deepEqual(data.planner.body.meals.map(m=>[m.name,m.slot,m.state]),[['poha','breakfast',undefined]]);
 assert.deepEqual(data.planner.body.mealGuesses,{});
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.entity,l.title]),[['Logged','meal','poha']]);
});

test('an invalid meal after a water log saves neither record',async()=>{
 const data=freshStore(),before=structuredClone(data),evidence=['Log two glasses and a meal'];
 await assert.rejects(changePlanner(data,{operations:[
  {type:'create',collection:'water',id:null,ref:null,fields:{count:2},evidence},
  {type:'create',collection:'meals',id:null,ref:null,fields:{title:'',slot:'lunch',state:'logged'},evidence},
 ],continuation:false,question:null,choices:[]},{raw:evidence[0],conversationId:data.conversations[0].id,now:NOW}),/what you ate/);
 assert.deepEqual(data,before);
});
