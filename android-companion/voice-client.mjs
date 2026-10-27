import {createRamble} from './voice-turn.mjs';
import {userMessage} from './user-message.mjs';

export const VOICE_LIMITS=Object.freeze({connectMs:10000,talkMs:120000,answerMs:30000});
const IN_RATE=16000,OUT_RATE=24000;

export class VoiceError extends Error{constructor(code,message){super(message);this.code=code;}}
const NO_MIC='Allow the microphone to talk to RPM. Typing still works.';

const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
export function pcm16(samples){
 const out=new Int16Array(samples.length);
 for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));out[i]=v<0?v*0x8000:v*0x7fff;}
 return base64(new Uint8Array(out.buffer));
}
const floats=data=>{const bin=atob(data),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const ints=new Int16Array(bytes.buffer,0,bytes.length>>1),out=new Float32Array(ints.length);for(let i=0;i<ints.length;i++)out[i]=ints[i]/0x8000;return out;};

/** Plays the model's 24 kHz voice chunks back to back. */
function createSpeaker(AudioContextImpl){
 let context=null,at=0;
 return {
  play(data){
   context??=new AudioContextImpl({sampleRate:OUT_RATE});
   const samples=floats(data),buffer=context.createBuffer(1,samples.length,OUT_RATE);buffer.copyToChannel(samples,0);
   const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
   at=Math.max(at,context.currentTime);source.start(at);at+=buffer.duration;
  },
  close(){const c=context;context=null;if(c)setTimeout(()=>c.close().catch(()=>{}),Math.max(0,(at-c.currentTime)*1000)+200);},
 };
}

/**
 * One ramble from mic to spoken answer. `token(setup)` returns {token,url} for a locked Live session; the
 * key never reaches this code. Resolves `done` with the ramble's result; `onChange(state)` follows each step.
 * Phases: connecting → listening → working → speaking → done | failed.
 */
export function startVoice({data,timeZone,setup,token,onChange=()=>{},workletUrl,now=()=>new Date(),
 media=globalThis.navigator?.mediaDevices,AudioContextImpl=globalThis.AudioContext,AudioWorkletNodeImpl=globalThis.AudioWorkletNode,WebSocketImpl=globalThis.WebSocket,limits=VOICE_LIMITS}){
 const ramble=createRamble({data,timeZone,now}),speaker=createSpeaker(AudioContextImpl),queue=[];
 let socket=null,mic=null,micContext=null,ready=false,stopped=false,finished=false,timer=null,talkTimer=null,phase='connecting',resolve;
 const done=new Promise(r=>{resolve=r;});
 const notify=()=>onChange({...ramble.state,phase:phase==='connecting'||phase==='listening'?phase:ramble.state.phase});
 const send=m=>{if(socket?.readyState===1)socket.send(JSON.stringify(m));};
 const wait=(ms,why)=>{clearTimeout(timer);timer=setTimeout(()=>finish(why),ms);};
 const releaseMic=()=>{mic?.getTracks().forEach(t=>t.stop());mic=null;micContext?.close().catch(()=>{});micContext=null;};
 function finish(failure){
  if(finished)return;finished=true;clearTimeout(timer);clearTimeout(talkTimer);releaseMic();
  if(failure)ramble.fail(failure);
  phase=ramble.state.phase;speaker.close();
  try{socket?.close();}catch{}
  notify();resolve(ramble.result());
 }
 function audio(samples){const chunk={realtimeInput:{audio:{data:pcm16(samples),mimeType:`audio/pcm;rate=${IN_RATE}`}}};if(ready)send(chunk);else queue.push(chunk);}
 function stop(){
  if(stopped||finished)return;stopped=true;releaseMic();
  if(!ready){finish('You stopped before voice was ready.');return;}
  send({realtimeInput:{activityEnd:{}}});ramble.stop();phase='working';notify();wait(limits.answerMs,'Voice took too long to answer. Your words are saved.');
 }
 function receive(m){
  if(m.setupComplete){ready=true;clearTimeout(timer);send({realtimeInput:{activityStart:{}}});for(const c of queue.splice(0))send(c);if(stopped){stopped=false;stop();}else{phase='listening';notify();}return;}
  for(const part of m.serverContent?.modelTurn?.parts??[])if(part.inlineData?.mimeType?.startsWith('audio/pcm'))speaker.play(part.inlineData.data);
  for(const out of ramble.receive(m))send(out);
  if(stopped)wait(limits.answerMs,'Voice took too long to answer. Your words are saved.');
  notify();
  if(ramble.state.phase==='done')finish();
 }
 (async()=>{
  try{
   try{mic=await media.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});}
   catch(e){throw new VoiceError('no-mic',NO_MIC);}
   if(finished){releaseMic();return;}
   micContext=new AudioContextImpl({sampleRate:IN_RATE});
   await micContext.audioWorklet.addModule(workletUrl);
   const node=new AudioWorkletNodeImpl(micContext,'rpm-mic');node.port.onmessage=e=>{if(!stopped&&!finished)audio(e.data);};
   micContext.createMediaStreamSource(mic).connect(node);
   wait(limits.connectMs,'Voice could not connect. Check your internet and try again.');
   const access=await token(setup);
   if(finished)return;
   socket=new WebSocketImpl(`${access.url}?access_token=${encodeURIComponent(access.token)}`);
   socket.onopen=()=>send({setup});
   socket.onmessage=async e=>{try{receive(JSON.parse(typeof e.data==='string'?e.data:await e.data.text()));}catch(error){finish(userMessage(error));}};
   socket.onclose=()=>{if(!finished)finish('The voice connection closed. Your words are saved.');};
   talkTimer=setTimeout(()=>{if(!stopped&&!finished)stop();},limits.talkMs);
  }catch(error){if(error instanceof VoiceError){finished=true;clearTimeout(timer);clearTimeout(talkTimer);releaseMic();phase='failed';onChange({...ramble.state,phase:'failed',error:userMessage(error),code:error.code});resolve({...ramble.result(),failed:userMessage(error),code:error.code});}else finish(userMessage(error));}
 })();
 return {stop,cancel:()=>finish('Cancelled.'),done};
}
