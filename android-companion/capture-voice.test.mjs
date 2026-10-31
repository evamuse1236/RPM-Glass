import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {createRamble} from './voice-turn.mjs';
import {createVoiceMode,NO_MIC,NO_KEY} from './capture-voice.mjs';
import {voiceRows} from './capture-voice-rows.mjs';
import {cardKind} from './capture-session.mjs';
import {intentViewFromData} from './intent-service.mjs';

const TZ='Asia/Kolkata',NOW=new Date('2026-10-27T12:00:00Z');
const call=(id,name,args={})=>({id,name,args});
const tools=(...functionCalls)=>({toolCall:{functionCalls}});
const turnDone={serverContent:{turnComplete:true}};

function day(){
 const data=freshStore();
 const raj=editPlan(data,{type:'saveTask',fields:{title:'Call Raj'}},NOW);
 const milk=editPlan(data,{type:'saveTask',fields:{title:'Buy groceries'}},NOW);
 return {data,ids:{raj,milk}};
}

/** A platform over one in-memory store, logging each save the way runtime.mjs saveWith does. */
function phone(data,{micAccess={granted:false,canAsk:true}}={}){
 const saves=[];
 const platform={
  store:data,saves,
  voiceData:()=>structuredClone(platform.store),
  voiceRows:changes=>voiceRows(platform.store,changes,NOW),
  action:async name=>name==='micAccess'?micAccess:name==='voiceToken'?{token:'t',url:'wss://x'}:null,
  saveWith:async mutate=>{const next=structuredClone(platform.store),out=mutate(next);if(out===false)return false;saves.push(structuredClone(next.intentV2?.captures??{}));platform.store=next;return out;},
 };
 return platform;
}

/** A fake open line that plays one request (words, then the changes), saves it through onRequest, then hangs up. */
function rambleStart(ids,{code=null}={}){
 return ({data,onChange,onRequest,continuous})=>{
  let finish;const done=new Promise(resolve=>{finish=resolve;});
  assert.equal(continuous,true,'the phone always opens the line');
  queueMicrotask(async()=>{
   if(code){onChange({phase:'failed',code});finish({requests:0,missed:false,failed:NO_MIC,code});return;}
   const r=createRamble({data:data(),timeZone:TZ,now:()=>NOW});
   r.receive({serverContent:{inputTranscription:{text:'Finish calling Raj and delete buy groceries'}}});
   onChange({...r.state,phase:'listening'});
   r.stop();
   r.receive(tools(call('a','get_plan')));
   onChange(r.state);
   r.receive(tools(call('b','save_task',{id:ids.raj,done:true}),call('c','delete_task',{id:ids.milk})));
   onChange(r.state);
   r.receive(turnDone);r.receive({serverContent:{outputTranscription:{text:'Done Raj, removed groceries.'}}});r.receive(turnDone);
   onChange(r.state);
   await onRequest(r.result(),{index:1});
   finish({requests:1,missed:false,failed:null,code:null});
  });
  return {stop(){},cancel(){},done};
 };
}

const mode=(platform,start,extra={})=>{
 const ids=[];
 const voice=createVoiceMode({platform,conversationId:()=>'c-1',onChange(){},afterSave:id=>ids.push(id),start,now:()=>NOW,timeZone:TZ,doc:null,win:{},sound(){},...extra});
 return {voice,ids};
};

test('a request is saved with its words in one save, as one capture with one Undo', async () => {
 const {data,ids}=day(),platform=phone(data);
 const {voice,ids:saved}=mode(platform,rambleStart(ids));
 await voice.begin();
 assert.equal(platform.saves.length,1,'the words and the changes are saved together');
 const [capture0]=platform.saves.map(captures=>Object.values(captures)[0]);
 assert.match(capture0.raw,/Finish calling Raj/);
 assert.equal(capture0.status,'interpreted');
 assert.equal(saved.length,1);assert.equal(voice.live,null);
 const task=id=>platform.store.entries.find(e=>e.id===id);
 assert.equal(task(ids.raj).done,true);assert.equal(task(ids.milk).archived,true);
 const [capture]=intentViewFromData(platform.store,{conversationId:'c-1'}).captures;
 assert.equal(cardKind(capture),'voice');
 assert.deepEqual(voiceRows(platform.store,capture.voice.changes,NOW).map(r=>[r.verb,r.title]),[['Done','Call Raj'],['Moved to Trash','Buy groceries']]);

 assert.equal(await voice.undo(saved[0]),null);
 assert.equal(task(ids.raj).done,false);assert.equal(task(ids.milk).archived,false);
 assert.match(platform.store.intentV2.captures[saved[0]].raw,/Finish calling Raj/,'the words stay after Undo');
 assert.equal(await voice.undo(saved[0]),'This ramble has nothing to undo.','one Undo per ramble');
});

test('a mic Android refuses shows the no-mic card, with Settings only when Android will not ask again', async () => {
 for(const canAsk of [true,false]){
  const platform=phone(day().data,{micAccess:{granted:false,canAsk}});
  const {voice}=mode(platform,rambleStart({},{code:'no-mic'}));
  await voice.begin();
  assert.deepEqual(voice.failure,{phase:'no-mic',canAsk});
  assert.equal(platform.saves.length,0,'nothing is saved without words');
  assert.equal(voice.active(),false);
 }
 assert.equal(NO_MIC,'Allow the microphone to talk to RPM. Typing still works.');
});

test('a phone with no Gemini key gets a failed card that says how to connect one', async () => {
 const platform=phone(day().data);
 platform.action=async()=>({missingKey:true});
 const start=({token})=>({stop(){},cancel(){},done:token({}).then(()=>({}),error=>{throw error;})});
 const {voice}=mode(platform,start);
 await voice.begin();
 assert.deepEqual(voice.failure,{phase:'failed',error:NO_KEY});
});

test('leaving Capture hangs up', async () => {
 let stopped=0;
 const listeners={},doc={visibilityState:'visible',addEventListener:(type,fn)=>{listeners[type]=fn;}},win={};
 const start=()=>({stop(){},hangUp(){stopped++;},cancel(){},done:new Promise(()=>{})});
 const {voice}=mode(phone(day().data),start,{doc,win});
 voice.begin();
 await Promise.resolve();
 doc.visibilityState='hidden';listeners.visibilitychange();
 win.rpmVoiceBackground();
 assert.equal(stopped,2);
 assert.equal(voice.active(),true,'the session saves and ends on its own after hang-up');
});
