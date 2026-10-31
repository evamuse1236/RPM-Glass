import {createRamble} from './voice-turn.mjs';
import {userMessage} from './user-message.mjs';
import {voiceMark, voiceSaidMark, resetSessionMarks, holdStage, beforeStage} from './voice-marks.mjs';

export const VOICE_LIMITS=Object.freeze({connectMs:10000,talkMs:120000,answerMs:30000,quietMs:20000,gapMs:3000});
const IN_RATE=16000,OUT_RATE=24000,SPEECH_LEVEL=0.12;
const IDLE=new Set(['IDLE','REQUIRES_ACTION','INTERACTION_STATUS_UNSPECIFIED']);

export class VoiceError extends Error{constructor(code,message){super(message);this.code=code;}}
const NO_MIC='Allow the microphone to talk to RPM. Typing still works.';

const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
export function pcm16(samples){
 const out=new Int16Array(samples.length);
 for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));out[i]=v<0?v*0x8000:v*0x7fff;}
 return base64(new Uint8Array(out.buffer));
}
/** How loud a chunk is, from 0 to 1, for the voice orb. */
export function loudness(samples){
 if(!samples.length)return 0;
 let sum=0;for(let i=0;i<samples.length;i++)sum+=samples[i]*samples[i];
 return Math.min(1,Math.sqrt(sum/samples.length)*6);
}
const floats=data=>{const bin=atob(data),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const ints=new Int16Array(bytes.buffer,0,bytes.length>>1),out=new Float32Array(ints.length);for(let i=0;i<ints.length;i++)out[i]=ints[i]/0x8000;return out;};

/** Plays the model's 24 kHz voice chunks back to back. `clear` cuts what is queued; `ahead` is true while it plays. */
function createSpeaker(AudioContextImpl,onLevel,onPlayed=()=>{}){
 let context=null,at=0;
 const playing=new Set();
 return {
  play(data){
   const first=!context;
   if(first)holdStage('T9');
   context??=new AudioContextImpl({sampleRate:OUT_RATE});
   const samples=floats(data),buffer=context.createBuffer(1,samples.length,OUT_RATE);buffer.copyToChannel(samples,0);
   const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
   at=Math.max(at,context.currentTime);source.start(at);
   playing.add(source);source.onended=()=>playing.delete(source);
   if(first)voiceMark('T9');
   const level=loudness(samples);setTimeout(()=>onLevel(level),Math.max(0,(at-context.currentTime)*1000));
   at+=buffer.duration;
   setTimeout(onPlayed,Math.max(0,(at-context.currentTime)*1000));
  },
  ahead(){return !!context&&at>context.currentTime;},
  clear(){for(const source of playing){try{source.stop();}catch{}}playing.clear();if(context)at=context.currentTime;onLevel(0);},
  close(){const c=context;context=null;if(c)setTimeout(()=>c.close().catch(()=>{}),Math.max(0,(at-c.currentTime)*1000)+200);},
 };
}

async function captureMic(media,AudioContextImpl){
 const host=globalThis;
 if(typeof host.__rpmMicProvider==='function')return host.__rpmMicProvider();
 if(!host.__rpmFakeMic)return media.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
 const importer=host.__rpmImport??(specifier=>import(specifier));
 const mod=await importer('/voice-fake-mic.js');
 const spec=typeof host.__rpmFakeMic==='string'?{id:host.__rpmFakeMic}:host.__rpmFakeMic;
 return mod.openFakeMic(spec,{AudioContextImpl});
}
const micError=e=>['NotAllowedError','SecurityError'].includes(e?.name)?new VoiceError('no-mic',NO_MIC):new VoiceError('mic-failed','The microphone did not start. Close other apps that use it, then try again.');

/**
 * One ramble from mic to spoken answer. `token(setup)` returns {token,url} for a locked Live session; the
 * key never reaches this code. Resolves `done` with the ramble's result; `onChange(state)` follows each step.
 * Phases: connecting → listening → working → speaking → done | failed.
 */
export function startVoice(options){
 resetSessionMarks();
 if(options.continuous)return startOpenLine(options);
 return startRamble(options);
}

function startRamble({data,timeZone,setup,token,onChange=()=>{},onLevel=()=>{},workletUrl,now=()=>new Date(),
 media=globalThis.navigator?.mediaDevices,AudioContextImpl=globalThis.AudioContext,AudioWorkletNodeImpl=globalThis.AudioWorkletNode,WebSocketImpl=globalThis.WebSocket,limits=VOICE_LIMITS}){
 const ramble=createRamble({data,timeZone,now}),speaker=createSpeaker(AudioContextImpl,onLevel),queue=[];
 let socket=null,mic=null,micContext=null,ready=false,stopped=false,finished=false,timer=null,talkTimer=null,phase='connecting',resolve;
 const done=new Promise(r=>{resolve=r;});
 const notify=()=>onChange({...ramble.state,phase:phase==='connecting'||phase==='listening'?phase:ramble.state.phase});
 const send=m=>{if(socket?.readyState===1)socket.send(JSON.stringify(m));};
 const wait=(ms,why)=>{clearTimeout(timer);timer=setTimeout(()=>finish(why),ms);};
 const releaseMic=()=>{try{mic?.__rpmStop?.();}catch{}mic?.getTracks().forEach(t=>t.stop());mic=null;micContext?.close().catch(()=>{});micContext=null;};
 function finish(failure){
  if(finished)return;finished=true;clearTimeout(timer);clearTimeout(talkTimer);releaseMic();
  if(failure)ramble.fail(failure);
  phase=ramble.state.phase;speaker.close();
  try{socket?.close();}catch{}
  notify();holdStage('T10');voiceMark('T10');resolve(ramble.result());
 }
 function audio(samples){onLevel(loudness(samples));const chunk={realtimeInput:{audio:{data:pcm16(samples),mimeType:`audio/pcm;rate=${IN_RATE}`}}};if(ready)send(chunk);else queue.push(chunk);}
 function stop(){
  if(stopped||finished)return;stopped=true;releaseMic();
  if(!ready)return;
  send({realtimeInput:{activityEnd:{}}});ramble.stop();phase='working';notify();wait(limits.answerMs,'Voice took too long to answer. Your words are saved.');
 }
 function receive(m){
  if(m.setupComplete){ready=true;clearTimeout(timer);voiceMark('T4');send({realtimeInput:{activityStart:{}}});for(const c of queue.splice(0))send(c);if(stopped){stopped=false;stop();}else{phase='listening';notify();}return;}
  for(const part of m.serverContent?.modelTurn?.parts??[])if(part.inlineData?.mimeType?.startsWith('audio/pcm'))speaker.play(part.inlineData.data);
  for(const out of ramble.receive(m))send(out);
  if(stopped)wait(limits.answerMs,'Voice took too long to answer. Your words are saved.');
  notify();
  if(ramble.state.phase==='done')finish();
 }
 (async()=>{
  try{
   try{mic=await captureMic(media,AudioContextImpl);}
   catch(e){throw micError(e);}
   if(finished){releaseMic();return;}
   micContext=new AudioContextImpl({sampleRate:IN_RATE});
   await micContext.audioWorklet.addModule(workletUrl);
   const node=new AudioWorkletNodeImpl(micContext,'rpm-mic');
   let firstFrame=true;
   node.port.onmessage=e=>{if(stopped||finished)return;if(firstFrame){firstFrame=false;holdStage('T3');voiceMark('T3');}audio(e.data);};
   if(typeof mic.feed==='function')mic.feed(node.port);else micContext.createMediaStreamSource(mic).connect(node);
   wait(limits.connectMs,'Voice could not connect. Check your internet and try again.');
   voiceMark('Ttoken0');
   const access=await token(setup);
   voiceMark('Ttoken1');
   if(finished)return;
   socket=new WebSocketImpl(`${access.url}?access_token=${encodeURIComponent(access.token)}`);
   socket.onopen=()=>{voiceMark('Topen');send({setup});};
   socket.onmessage=async e=>{try{const m=JSON.parse(typeof e.data==='string'?e.data:await e.data.text());if(m.setupComplete){const wait=beforeStage('T4');if(wait)await wait;}receive(m);}catch(error){finish(userMessage(error));}};
   socket.onclose=()=>{if(!finished)finish('The voice connection closed. Your words are saved.');};
   talkTimer=setTimeout(()=>{if(!stopped&&!finished)stop();},limits.talkMs);
  }catch(error){if(error instanceof VoiceError){finished=true;clearTimeout(timer);clearTimeout(talkTimer);releaseMic();phase='failed';const text=userMessage(error);onChange({...ramble.state,phase:'failed',error:text,code:error.code});holdStage('T10');voiceMark('T10');resolve({...ramble.result(),failed:text,code:error.code});}else finish(userMessage(error));}
 })();
 return {stop,cancel:()=>finish('Cancelled.'),snapshot:()=>ramble.result(),done};
}

/**
 * The phone's open line: one Live session from the tap until hang-up, Capture hidden, or `quietMs` of quiet.
 * Gemini ends each request by itself; each request is its own ramble, saved by `onRequest(result,{index})` on its
 * final idle turn, and the next request starts from `data()` once that save resolves. Uplink audio is dropped while
 * the speaker plays. `goAway` or a dropped socket saves the request in progress, waits `gapMs` and opens a new
 * session from `setup()`. `stop()` cuts RPM's speech, or hangs up when it is quiet.
 */
function startOpenLine({data,timeZone,setup,token,onChange=()=>{},onLevel=()=>{},onRequest=async()=>{},workletUrl,now=()=>new Date(),
 media=globalThis.navigator?.mediaDevices,AudioContextImpl=globalThis.AudioContext,AudioWorkletNodeImpl=globalThis.AudioWorkletNode,WebSocketImpl=globalThis.WebSocket,limits=VOICE_LIMITS}){
 const fresh=()=>typeof data==='function'?data():data,setupNow=()=>typeof setup==='function'?setup():setup;
 const quietMs=limits.quietMs??VOICE_LIMITS.quietMs,gapMs=limits.gapMs??VOICE_LIMITS.gapMs;
 const speaker=createSpeaker(AudioContextImpl,onLevel,()=>{touch();notify();}),queue=[],backlog=[];
 let socket=null,mic=null,micContext=null,ready=false,closing=false,connectTimer=null,quietTimer=null,stale=0,resolve;
 let ramble=null,count=0,saved=0,saving=null,serverBusy=false,toolsPending=false,replied=false,spoken=false,hush=false,lastMissed=false;
 const done=new Promise(r=>{resolve=r;});
 const phase=()=>!ready?'connecting':speaker.ahead()?'speaking':ramble&&(replied||serverBusy)?'working':'listening';
 const notify=()=>{if(closing)return;const st=ramble?.state;onChange({phase:phase(),heard:st?.heard??'',said:st?.said??'',changes:st?.changes??[],errors:st?.errors??[],request:count,wordsReady:false});};
 const send=m=>{if(ready&&socket?.readyState===1)socket.send(JSON.stringify(m));};
 const releaseMic=()=>{try{mic?.__rpmStop?.();}catch{}mic?.getTracks().forEach(t=>t.stop());mic=null;micContext?.close().catch(()=>{});micContext=null;};
 function touch(){if(closing||!ready)return;stale=0;clearTimeout(quietTimer);quietTimer=setTimeout(quiet,quietMs);}
 function quiet(){
  if(closing)return;
  if(speaker.ahead()||backlog.some(m=>m.toolCall)||saving||(serverBusy&&!stale++)){quietTimer=setTimeout(quiet,quietMs);return;}
  end(null,{quiet:true});
 }
 function audio(samples){
  if(speaker.ahead())return;
  const level=loudness(samples);onLevel(level);
  if(level>=SPEECH_LEVEL)touch();
  const chunk={realtimeInput:{audio:{data:pcm16(samples),mimeType:`audio/pcm;rate=${IN_RATE}`}}};
  if(ready)send(chunk);else queue.push(chunk);
 }
 function finishRequest(){
  const r=ramble;ramble=null;
  const result=r.result(),index=count;
  lastMissed=!!result.heard&&!replied;replied=false;toolsPending=false;spoken=false;
  if(!result.heard&&!result.batch&&!result.said){notify();return Promise.resolve();}
  saving=Promise.resolve().then(()=>onRequest(result,{index})).catch(()=>{}).then(()=>{saving=null;saved++;drain();notify();});
  notify();
  return saving;
 }
 function drain(){while(!saving&&backlog.length&&!closing)handle(backlog.shift());}
 function handle(m){
  touch();
  const sc=m.serverContent,parts=sc?.modelTurn?.parts??[];
  if(sc?.interrupted)speaker.clear();
  if(!ramble&&(m.toolCall||sc?.inputTranscription?.text||sc?.outputTranscription?.text||parts.length)){ramble=createRamble({data:fresh(),timeZone,now});count++;}
  if(ramble&&sc?.inputTranscription?.text)voiceSaidMark(count);
  if(m.toolCall){replied=true;serverBusy=true;toolsPending=true;holdStage(`T7#${count}`);voiceMark(`T7#${count}`);}
  if(parts.length){replied=true;serverBusy=true;toolsPending=false;}
  for(const part of parts)if(part.inlineData?.mimeType?.startsWith('audio/pcm')&&!hush){
   if(!spoken){spoken=true;voiceMark(`T9#${count}`);}
   speaker.play(part.inlineData.data);
  }
  if(ramble)for(const out of ramble.receive(m))send(out);
  if(sc?.turnComplete){
   const status=sc.interactionStatus,idle=status?IDLE.has(status):!toolsPending;
   hush=false;serverBusy=!idle;if(!status)toolsPending=false;
   if(idle&&ramble){finishRequest();return;}
  }
  notify();
 }
 function receive(m){
  if(m.setupComplete){ready=true;clearTimeout(connectTimer);voiceMark('T4');for(const c of queue.splice(0))send(c);touch();notify();return;}
  if(m.goAway){reconnect();return;}
  if(saving||backlog.length){backlog.push(m);return;}
  handle(m);
 }
 async function settle(){
  try{await saving;}catch{}
  drain();
  try{await saving;}catch{}
  if(ramble)await finishRequest();
 }
 async function end(failure,{quiet=false,code=null}={}){
  if(closing)return;
  const missed=quiet&&(ramble?!!ramble.state.heard&&!replied:lastMissed);
  closing=true;clearTimeout(connectTimer);clearTimeout(quietTimer);releaseMic();
  await settle();
  speaker.close();
  const s=socket;socket=null;ready=false;try{s?.close();}catch{}
  holdStage('T10');voiceMark('T10');
  resolve({requests:saved,missed,failed:failure,code,quiet});
 }
 async function reconnect(){
  if(closing||!ready)return;
  ready=false;clearTimeout(quietTimer);queue.length=0;
  const s=socket;socket=null;if(s){s.onmessage=null;s.onclose=null;try{s.close();}catch{}}
  notify();
  await settle();
  await new Promise(r=>setTimeout(r,gapMs));
  if(!closing)connect().catch(error=>end(userMessage(error)));
 }
 async function connect(){
  clearTimeout(connectTimer);
  connectTimer=setTimeout(()=>end('Voice could not connect. Check your internet and try again.'),limits.connectMs);
  const locked=setupNow();
  voiceMark('Ttoken0');
  const access=await token(locked);
  voiceMark('Ttoken1');
  if(closing)return;
  const ws=new WebSocketImpl(`${access.url}?access_token=${encodeURIComponent(access.token)}`);
  socket=ws;
  ws.onopen=()=>{voiceMark('Topen');ws.send(JSON.stringify({setup:locked}));};
  ws.onmessage=async e=>{
   if(socket!==ws)return;
   try{const m=JSON.parse(typeof e.data==='string'?e.data:await e.data.text());if(m.setupComplete){const wait=beforeStage('T4');if(wait)await wait;}if(socket===ws)receive(m);}
   catch(error){end(userMessage(error));}
  };
  ws.onclose=()=>{if(socket!==ws||closing)return;if(ready)reconnect();else end('The voice connection closed. Your words are saved.');};
 }
 function hangUp(){return end(null);}
 (async()=>{
  try{
   try{mic=await captureMic(media,AudioContextImpl);}
   catch(e){throw micError(e);}
   if(closing){releaseMic();return;}
   micContext=new AudioContextImpl({sampleRate:IN_RATE});
   await micContext.audioWorklet.addModule(workletUrl);
   const node=new AudioWorkletNodeImpl(micContext,'rpm-mic');
   let firstFrame=true;
   node.port.onmessage=e=>{if(closing)return;if(firstFrame){firstFrame=false;holdStage('T3');voiceMark('T3');}audio(e.data);};
   if(typeof mic.feed==='function')mic.feed(node.port);else micContext.createMediaStreamSource(mic).connect(node);
   await connect();
  }catch(error){
   if(error instanceof VoiceError){const text=userMessage(error);onChange({phase:'failed',heard:'',said:'',changes:[],errors:[],request:count,error:text,code:error.code});await end(text,{code:error.code});}
   else end(userMessage(error));
  }
 })();
 return {
  stop(){if(closing)return;if(speaker.ahead()){hush=true;speaker.clear();touch();notify();}else hangUp();},
  hangUp,
  cancel:()=>end('Cancelled.'),
  snapshot:()=>ramble?.result()??null,
  done,
 };
}
