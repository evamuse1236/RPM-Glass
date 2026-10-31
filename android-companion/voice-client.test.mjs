import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {startVoice,pcm16} from './voice-client.mjs';

const tick=()=>new Promise(r=>setTimeout(r,0));
function fakes({deny=false}={}){
 const log={sent:[],played:0,tracksStopped:0,closed:false,url:null,setupSent:null};
 class Socket{constructor(url){log.url=url;this.readyState=0;fakes.socket=this;setTimeout(()=>{this.readyState=1;this.onopen?.();},0);}
  send(text){const m=JSON.parse(text);if(m.setup){log.setupSent=m.setup;setTimeout(()=>this.serve({setupComplete:{}}),0);}else log.sent.push(m);}
  serve(m){this.onmessage?.({data:JSON.stringify(m)});}
  close(){log.closed=true;this.readyState=3;}}
 class Context{constructor(){this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{}};}
  createMediaStreamSource(){return {connect:()=>{}};}
  createBuffer(_c,length){return {duration:length/24000,copyToChannel:()=>{}};}
  createBufferSource(){return {connect:()=>{},start:()=>{log.played++;}};}
  close(){return Promise.resolve();}}
 class Node{constructor(){fakes.node=this;this.port={};}}
 const media={getUserMedia:async()=>{if(deny)throw Object.assign(new Error('Permission denied'),{name:'NotAllowedError'});return {getTracks:()=>[{stop:()=>log.tracksStopped++}]};}};
 return {log,options:{media,AudioContextImpl:Context,AudioWorkletNodeImpl:Node,WebSocketImpl:Socket,workletUrl:'voice-mic-worklet.js'}};
}

test('a ramble streams the mic after setup, answers tool calls, plays the reply and ends with the result', async () => {
 const {log,options}=fakes(),phases=[];
 const voice=startVoice({...options,data:freshStore(),timeZone:'Asia/Kolkata',setup:{model:'models/x'},token:async()=>({token:'t/1',url:'wss://live'}),onChange:s=>phases.push(s.phase)});
 await tick();fakes.node.port.onmessage({data:new Float32Array([0.5,-0.5])});
 await tick();await tick();await tick();
 assert.equal(log.url,'wss://live?access_token=t%2F1');
 assert.deepEqual(log.setupSent,{model:'models/x'});
 assert.deepEqual(Object.keys(log.sent[0].realtimeInput),['activityStart']);
 assert.ok(log.sent[1].realtimeInput.audio,'audio said before the socket was ready is sent after activityStart');
 voice.stop();
 assert.equal(log.tracksStopped,1,'the mic turns off when the person stops');
 assert.deepEqual(Object.keys(log.sent.at(-1).realtimeInput),['activityEnd']);
 const s=fakes.socket;
 s.serve({serverContent:{inputTranscription:{text:'Add pay rent'}}});
 s.serve({toolCall:{functionCalls:[{id:'1',name:'save_task',args:{title:'Pay rent'}}]}});
 assert.equal(log.sent.at(-1).toolResponse.functionResponses[0].response.result.saved>0,true);
 s.serve({serverContent:{turnComplete:true}});
 s.serve({serverContent:{outputTranscription:{text:'Added pay rent.'},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm16(new Float32Array(240))}}]}}});
 s.serve({serverContent:{turnComplete:true}});
 const result=await voice.done;
 assert.equal(result.heard,'Add pay rent');assert.equal(result.said,'Added pay rent.');assert.equal(result.batch.ops.length,1);
 assert.equal(log.played,1);assert.equal(log.closed,true);
 assert.deepEqual([...new Set(phases)],['listening','working','speaking','done']);
});

test('stopping before voice is ready keeps the queued speech and sends it once connected', async () => {
 const {log,options}=fakes();
 const voice=startVoice({...options,data:freshStore(),timeZone:'UTC',setup:{model:'models/x'},token:async()=>({token:'t',url:'wss://x'})});
 await tick();
 fakes.node.port.onmessage({data:new Float32Array([0.5,-0.5])});
 voice.stop();
 assert.equal(log.tracksStopped,1);
 let settled=false;
 voice.done.then(()=>{settled=true;});
 await tick();
 assert.equal(settled,false,'Done before setupComplete does not drop the turn');
 await tick();await tick();await tick();
 assert.ok(log.sent.some(m=>m.realtimeInput?.audio),'queued speech is sent after setup');
 assert.deepEqual(Object.keys(log.sent.at(-1).realtimeInput),['activityEnd']);
 fakes.socket.serve({serverContent:{inputTranscription:{text:'Call Amma tomorrow at 6 pm'}}});
 fakes.socket.serve({serverContent:{turnComplete:true}});
 const result=await voice.done;
 assert.equal(result.failed,null);
 assert.equal(result.heard,'Call Amma tomorrow at 6 pm');
});

test('a denied microphone ends at once with a plain message and never asks for a token', async () => {
 const {options}=fakes({deny:true});let asked=false,last;
 const voice=startVoice({...options,data:freshStore(),timeZone:'UTC',setup:{},token:async()=>{asked=true;return {};},onChange:s=>{last=s;}});
 const result=await voice.done;
 assert.equal(result.code,'no-mic');assert.match(last.error,/Allow the microphone/);assert.equal(asked,false);
});

test('a microphone that fails for another reason says so, not that permission is missing', async () => {
 const {options}=fakes();options.media={getUserMedia:async()=>{throw Object.assign(new Error('Could not start audio source'),{name:'NotReadableError'});}};
 const result=await startVoice({...options,data:freshStore(),timeZone:'UTC',setup:{},token:async()=>({})}).done;
 assert.equal(result.code,'mic-failed');assert.match(result.failed,/did not start/);
});

test('a socket that closes mid-answer fails the ramble and keeps the words heard so far', async () => {
 const {options}=fakes();
 const voice=startVoice({...options,data:freshStore(),timeZone:'UTC',setup:{},token:async()=>({token:'t',url:'wss://x'})});
 await tick();await tick();await tick();
 fakes.socket.serve({serverContent:{inputTranscription:{text:'Plan Friday'}}});voice.stop();
 fakes.socket.readyState=3;fakes.socket.onclose();
 const result=await voice.done;
 assert.equal(result.heard,'Plan Friday');assert.match(result.failed,/connection closed/);
});

test('no answer after stopping fails the ramble at the limit', async () => {
 const {options}=fakes();
 const voice=startVoice({...options,limits:{connectMs:1000,talkMs:5000,answerMs:20},data:freshStore(),timeZone:'UTC',setup:{},token:async()=>({token:'t',url:'wss://x'})});
 await tick();await tick();await tick();voice.stop();
 assert.match((await voice.done).failed,/too long/);
});

test('a ramble that talks past the connect limit keeps listening once voice is ready', async () => {
 const {options}=fakes();let last;
 const voice=startVoice({...options,limits:{connectMs:20,talkMs:5000,answerMs:1000},data:freshStore(),timeZone:'UTC',setup:{},token:async()=>({token:'t',url:'wss://x'}),onChange:s=>{last=s;}});
 await tick();await tick();await tick();
 await new Promise(r=>setTimeout(r,60));
 assert.equal(last.phase,'listening');
 voice.stop();fakes.socket.serve({serverContent:{turnComplete:true}});
 assert.ok(!(await voice.done).failed);
});
