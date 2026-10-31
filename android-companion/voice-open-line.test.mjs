import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {startVoice,pcm16} from './voice-client.mjs';
import {createRamble} from './voice-turn.mjs';
import {liveSetup,OPEN_LINE_DETECTION} from './voice-tools.mjs';
import {createVoiceMode,MISSED} from './capture-voice.mjs';
import {voiceRows} from './capture-voice-rows.mjs';
import {intentViewFromData} from './intent-service.mjs';

const TZ='Asia/Kolkata',NOW=new Date('2026-10-27T12:00:00Z');
const tick=()=>new Promise(r=>setTimeout(r,0));
const ticks=async(n=6)=>{for(let i=0;i<n;i++)await tick();};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const call=(id,name,args={})=>({id,name,args});
const heard=text=>({serverContent:{inputTranscription:{text}}});
const tools=(...functionCalls)=>({toolCall:{functionCalls}});
const idle={serverContent:{turnComplete:true,interactionStatus:'IDLE'}};
const voice=(text='')=>({serverContent:{outputTranscription:{text},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm16(new Float32Array(2400))}}]}}});

function fakes(){
 const log={sockets:[],tokens:0,setups:[],minted:[],stopped:0,contexts:[]};
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];log.sockets.push(this);setTimeout(()=>{this.readyState=1;this.onopen?.();},0);}
  send(text){const m=JSON.parse(text);if(m.setup){log.setups.push(m.setup);setTimeout(()=>this.serve({setupComplete:{}}),0);}else this.sent.push(m);}
  serve(m){this.onmessage?.({data:JSON.stringify(m)});}
  close(){this.readyState=3;}
  get audio(){return this.sent.filter(m=>m.realtimeInput?.audio);}
  get answers(){return this.sent.filter(m=>m.toolResponse);}
 }
 class Context{
  constructor(){this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{}};log.contexts.push(this);}
  createMediaStreamSource(){return {connect:()=>{}};}
  createBuffer(_c,length){return {duration:length/24000,copyToChannel:()=>{}};}
  createBufferSource(){return {connect:()=>{},start:()=>{},stop:()=>{log.stopped++;}};}
  close(){return Promise.resolve();}
 }
 class Node{constructor(){fakes.node=this;this.port={};}}
 const media={getUserMedia:async()=>({getTracks:()=>[{stop:()=>{}}]})};
 const speak=level=>fakes.node.port.onmessage({data:new Float32Array(160).fill(level)});
 const speakerContext=()=>log.contexts.find(c=>c!==log.contexts[0]);
 return {log,speak,speakerContext,socket:()=>log.sockets.at(-1),
  options:{media,AudioContextImpl:Context,AudioWorkletNodeImpl:Node,WebSocketImpl:Socket,workletUrl:'w.js',
   token:async setup=>{log.tokens++;return {token:`t${log.tokens}`,url:'wss://live'};}}};
}

function day(){
 const data=freshStore();
 editPlan(data,{type:'saveTask',fields:{title:'Call Raj'}},NOW);
 return data;
}

function phone(data,{gate=null}={}){
 const platform={
  store:data,saves:0,
  voiceData:()=>structuredClone(platform.store),
  voiceRows:changes=>voiceRows(platform.store,changes,NOW),
  action:async name=>name==='voiceToken'?{token:'t',url:'wss://live'}:null,
  saveWith:async mutate=>{if(platform.gate)await platform.gate;const next=structuredClone(platform.store),out=mutate(next);if(out===false)return false;platform.saves++;platform.store=next;return out;},
  gate,
 };
 return platform;
}

function openLine(platform,f,{limits={},sounds=[]}={}){
 const saved=[];
 const mode=createVoiceMode({platform,conversationId:()=>'c-1',onChange(){},afterSave:id=>saved.push(id),now:()=>NOW,timeZone:TZ,doc:null,win:{},
  sound:()=>sounds.push('chime'),
  start:opts=>startVoice({...opts,...f.options,token:async setup=>{f.log.tokens++;f.log.minted.push(setup);return {token:`t${f.log.tokens}`,url:'wss://live'};},limits:{connectMs:1000,quietMs:5000,gapMs:5,...limits}})});
 return {mode,saved};
}
const taskTitles=data=>data.entries.filter(e=>!e.archived).map(e=>e.title);

test('requests in one session give one capture, one batch and one working Undo each', async () => {
 const f=fakes(),platform=phone(day()),sounds=[];
 const {mode,saved}=openLine(platform,f,{sounds});
 const ended=mode.begin();
 await ticks();
 const s=f.socket();
 assert.equal(f.log.sockets.length,1,'one session');
 assert.deepEqual(s.sent.filter(m=>m.realtimeInput?.activityStart||m.realtimeInput?.activityEnd),[],'automatic detection: no activity signals');
 s.serve(heard('Add pay rent'));s.serve(tools(call('a','save_task',{title:'Pay rent'})));s.serve(voice('Added pay rent.'));s.serve(idle);
 await ticks();
 assert.equal(saved.length,1,'the first request is saved on its idle turn');
 assert.equal(mode.active(),true,'the session keeps listening');
 assert.equal(await mode.undo(saved[0]),null,'its Discard works while the session is open');
 assert.deepEqual(taskTitles(platform.store),['Call Raj']);
 s.serve(heard('And buy milk'));s.serve(tools(call('b','save_task',{title:'Buy milk'})));s.serve(idle);
 await ticks();
 s.serve(heard('And call the bank'));s.serve(tools(call('c','save_task',{title:'Call the bank'})));s.serve(idle);
 await ticks();
 assert.equal(saved.length,3);
 assert.deepEqual(mode.receipts(),saved,'each request has its own receipt, oldest first');
 assert.deepEqual(sounds,['chime','chime','chime'],'a sound for each saved request');
 await mode.hangUp();await ended;
 assert.equal(f.log.sockets.length,1,'still one session');
 const captures=intentViewFromData(platform.store,{conversationId:'c-1'}).captures;
 const byId=Object.fromEntries(captures.map(c=>[c.messageId,c]));
 assert.deepEqual(saved.map(id=>byId[id].raw),['Add pay rent','And buy milk','And call the bank']);
 assert.deepEqual(saved.map(id=>byId[id].voice.changes.map(c=>c.title)),[['Pay rent'],['Buy milk'],['Call the bank']]);
 assert.equal(new Set(saved.map(id=>byId[id].voice.undoEvent)).size,3,'three batches');
 assert.equal(byId[saved[1]].voice.canUndo,false,'Discard shows only on the newest change');
 assert.equal(byId[saved[2]].voice.canUndo,true);
 assert.equal(await mode.undo(saved[2]),null);
 assert.deepEqual(taskTitles(platform.store),['Call Raj','Buy milk']);
 assert.match(platform.store.intentV2.captures[saved[0]].raw,/pay rent/,'the words stay');
});

test('a new request starts from the saved store, and its tool calls wait for the last save', async () => {
 const f=fakes(),platform=phone(day());
 let release;platform.gate=new Promise(r=>{release=r;});
 const {mode,saved}=openLine(platform,f);
 const ended=mode.begin();
 await ticks();
 platform.gate=null;
 const s=f.socket();
 platform.gate=new Promise(r=>{release=r;});
 s.serve(heard('Add pay rent'));s.serve(tools(call('a','save_task',{title:'Pay rent'})));s.serve(idle);
 s.serve(heard('What is in my inbox'));s.serve(tools(call('b','get_plan')));
 await ticks();
 assert.equal(s.answers.length,1,'the second request waits for the first save');
 release();platform.gate=null;
 await ticks();
 assert.equal(s.answers.length,2);
 const plan=s.answers[1].toolResponse.functionResponses[0].response.result;
 assert.deepEqual(plan.inbox.map(t=>t.title),['Call Raj','Pay rent'],'its working copy holds the first request');
 s.serve(idle);
 await mode.hangUp();await ended;
 assert.equal(saved.length,2);
});

test('a tool call after the first audio of a request lands in that request', async () => {
 const f=fakes(),platform=phone(day());
 const {mode,saved}=openLine(platform,f);
 const ended=mode.begin();
 await ticks();
 const s=f.socket();
 s.serve(heard('Add pay rent'));s.serve(voice('Sure, '));
 s.serve({serverContent:{turnComplete:true,interactionStatus:'IN_PROGRESS'}});
 await ticks();
 assert.equal(saved.length,0,'a turn that is still in progress is not the end of the request');
 s.serve(tools(call('a','save_task',{title:'Pay rent'})));s.serve(voice('added it.'));s.serve(idle);
 await ticks();
 await mode.hangUp();await ended;
 assert.equal(saved.length,1);
 const capture=platform.store.intentV2.captures[saved[0]];
 assert.deepEqual(capture.voice.changes.map(c=>c.title),['Pay rent']);
 assert.equal(capture.reply,'Sure, added it.');
});

test('a tool call cancellation drops that call and keeps the rest with the same ids', async () => {
 const data=day();
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(tools(call('a','save_block',{title:'Health'})));
 r.receive(tools(call('b','save_task',{title:'Pay rent'}),call('c','save_block',{title:'Home'})));
 const before=r.result(),blocks=before.changes.map(c=>c.id);
 r.receive({toolCallCancellation:{ids:['b']}});
 const after=r.result();
 assert.deepEqual(after.changes.map(c=>c.title),['Health','Home']);
 assert.deepEqual(after.changes.map(c=>c.id),[blocks[0],blocks[2]],'kept Blocks keep the ids the model was told');
 assert.equal(after.batch.ops.length,2);
 assert.deepEqual(after.created,[]);
 r.receive(tools(call('d','save_task',{title:'Pay rent'})));
 assert.equal(r.result().created.length,1,'a cancelled add can be made again');

 const f=fakes(),platform=phone(day());
 const {mode,saved}=openLine(platform,f);
 const ended=mode.begin();
 await ticks();
 const s=f.socket();
 s.serve(heard('Add pay rent and buy milk'));s.serve(tools(call('a','save_task',{title:'Pay rent'}),call('b','save_task',{title:'Buy milk'})));
 s.serve({toolCallCancellation:{ids:['a']}});s.serve(idle);
 await ticks();await mode.hangUp();await ended;
 assert.equal(saved.length,1);
 assert.deepEqual(taskTitles(platform.store),['Call Raj','Buy milk']);
});

test('the uplink is muted while the speaker plays, and interrupted clears the speaker', async () => {
 const f=fakes(),platform=phone(day());
 const {mode}=openLine(platform,f);
 const ended=mode.begin();
 await ticks();
 const s=f.socket();
 f.speak(0.2);
 assert.equal(s.audio.length,1);
 s.serve(heard('Add pay rent'));s.serve(voice('Added.'));
 f.speak(0.2);f.speak(0.2);
 assert.equal(s.audio.length,1,'nothing is sent while RPM speaks');
 f.speakerContext().currentTime=10;
 f.speak(0.2);
 assert.equal(s.audio.length,2,'the mic is back once the speaker is caught up');
 f.speakerContext().currentTime=0;s.serve(voice('More.'));
 s.serve({serverContent:{interrupted:true}});
 assert.ok(f.log.stopped>0,'interrupted stops the queued speech');
 f.speak(0.2);
 assert.equal(s.audio.length,3);
 await mode.hangUp();await ended;
});

test('a tap while RPM speaks only cuts the speech; the next tap hangs up and saves the request first', async () => {
 const f=fakes(),platform=phone(day());
 const {mode,saved}=openLine(platform,f);
 const ended=mode.begin();
 await ticks();
 const s=f.socket();
 s.serve(heard('Add pay rent'));s.serve(tools(call('a','save_task',{title:'Pay rent'})));s.serve(voice('Adding'));
 mode.stop();
 assert.ok(f.log.stopped>0,'the speech is cut');
 assert.equal(mode.active(),true,'the session stays open');
 s.serve(voice(' it now.'));
 f.speak(0.2);
 assert.equal(s.audio.length,1,'the rest of that answer is not played, so the mic is open');
 mode.stop();
 const result=await ended;
 assert.equal(mode.active(),false);
 assert.equal(saved.length,1,'the request in progress is saved on hang-up');
 assert.deepEqual(taskTitles(platform.store),['Call Raj','Pay rent']);
 assert.equal(result,undefined);
});

test('quiet waits for playback and for a tool call waiting on a save, then ends the session', async () => {
 const f=fakes(),platform=phone(day());
 const {mode,saved}=openLine(platform,f,{limits:{quietMs:40}});
 const ended=mode.begin();
 await ticks();
 const s=f.socket();
 s.serve(heard('Add pay rent'));s.serve(voice('Added.'));
 await wait(120);
 assert.equal(mode.active(),true,'no hang-up while the speaker is ahead');
 f.speakerContext().currentTime=10;
 let release;platform.gate=new Promise(r=>{release=r;});
 s.serve(tools(call('a','save_task',{title:'Pay rent'})));s.serve(idle);
 s.serve(heard('And milk'));s.serve(tools(call('b','save_task',{title:'Buy milk'})));
 await wait(120);
 assert.equal(mode.active(),true,'no hang-up while a tool call waits for the save');
 release();platform.gate=null;
 s.serve(idle);
 await ended;
 assert.equal(mode.active(),false,'quiet ends the session');
 assert.equal(saved.length,2);
 assert.equal(mode.live,null);
});

test('speech that gets no tool call and no answer before quiet shows "Didn’t catch that"', async () => {
 const f=fakes(),platform=phone(day());
 const {mode,saved}=openLine(platform,f,{limits:{quietMs:30}});
 const ended=mode.begin();
 await ticks();
 f.socket().serve(heard('Mm, what was it'));
 await ended;
 assert.deepEqual(mode.live,{phase:'failed',error:MISSED});
 assert.equal(saved.length,1,'the words are kept');
 assert.equal(MISSED,'Didn’t catch that. Try again.');
});

test('goAway saves the request in progress, waits, opens a new session from the current store and never replays audio', async () => {
 const f=fakes(),platform=phone(day());
 const {mode,saved}=openLine(platform,f,{limits:{gapMs:30}});
 const ended=mode.begin();
 await ticks();
 const first=f.socket();
 f.speak(0.2);
 first.serve(heard('Add pay rent'));first.serve(tools(call('a','save_task',{title:'Pay rent'})));
 first.serve({goAway:{timeLeft:'5s'}});
 await ticks();
 assert.equal(saved.length,1,'saved before reconnecting');
 assert.equal(f.log.sockets.length,1,'waits out the token gap');
 await wait(60);await ticks();
 assert.equal(f.log.sockets.length,2);
 assert.equal(f.log.tokens,2);
 assert.match(f.log.minted[1].systemInstruction.parts[0].text,/Pay rent/,'the new setup holds the saved change');
 assert.deepEqual(f.log.minted[1].realtimeInputConfig.automaticActivityDetection,OPEN_LINE_DETECTION);
 const second=f.socket();
 assert.deepEqual(f.log.setups[1],f.log.minted[1],'the socket sends the setup its token locks');
 assert.equal(second.audio.length,0,'old audio is not sent again');
 f.speak(0.2);
 assert.equal(second.audio.length,1);
 second.readyState=3;second.onclose();
 await wait(60);await ticks();
 assert.equal(f.log.sockets.length,3,'a dropped socket reconnects too');
 await mode.hangUp();await ended;
 assert.equal(mode.active(),false);
});

test('the website keeps one ramble per press: manual turns, its own prompt, and no open-line option', () => {
 const site=liveSetup(NOW,TZ),phoneSetup=liveSetup(NOW,TZ,{data:day(),continuous:true});
 assert.deepEqual(site.realtimeInputConfig,{automaticActivityDetection:{disabled:true}});
 assert.match(site.systemInstruction.parts[0].text,/They talk, then stop/);
 assert.deepEqual(phoneSetup.realtimeInputConfig,{automaticActivityDetection:{disabled:false,endOfSpeechSensitivity:'END_SENSITIVITY_HIGH',silenceDurationMs:500}});
 assert.doesNotMatch(phoneSetup.systemInstruction.parts[0].text,/then stop/);
 assert.match(phoneSetup.systemInstruction.parts[0].text,/answer every direct request with one short sentence/);
 assert.deepEqual(Object.keys(site),Object.keys(phoneSetup),'the open line adds no setup field');
 const web=fs.readFileSync(new URL('../web/app/voice-capture.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(web,/continuous/);
 assert.match(web,/liveSetup\(new Date\(\), timeZone\)/);
});
