import {readFile} from 'node:fs/promises';
import {liveSetup,LIVE_MODEL} from '../../android-companion/voice-tools.mjs';
import {LIVE_URL} from '../../android-companion/voice-token.mjs';

const [file,...flags]=process.argv.slice(2),key=process.env.GEMINI_API_KEY,auto=flags.includes('--auto');
if(!file||!key){console.log('Usage: RAMBLE_SCRIPT=transcript-timing.mjs scripts/ramble/ramble.sh <file.wav> [--auto]');process.exit(1);}
const pcm=(await readFile(file)).subarray(44),seconds=pcm.length/32000,setup=liveSetup(new Date(),'Asia/Kolkata');
setup.tools=[];
if(auto)setup.realtimeInputConfig={automaticActivityDetection:{disabled:false}};
const ws=new WebSocket(`${LIVE_URL}?key=${key}`),events=[];let start=0,sent=0,ended=false;
const at=()=>((Date.now()-start)/1000).toFixed(2);
const done=why=>{console.log(JSON.stringify({model:LIVE_MODEL,mode:auto?'automatic':'manual',audioSeconds:+seconds.toFixed(2),why,events},null,1));process.exit(0);};
ws.onopen=()=>ws.send(JSON.stringify({setup}));
ws.onmessage=async e=>{
 const m=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(await e.data.arrayBuffer()).toString());
 if(m.setupComplete){
  start=Date.now();if(!auto)ws.send(JSON.stringify({realtimeInput:{activityStart:{}}}));
  const tick=setInterval(()=>{
   if(sent>=pcm.length){clearInterval(tick);if(!auto)ws.send(JSON.stringify({realtimeInput:{activityEnd:{}}}));else ws.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));ended=true;events.push({t:at(),event:'stop'});return;}
   ws.send(JSON.stringify({realtimeInput:{audio:{data:pcm.subarray(sent,sent+3200).toString('base64'),mimeType:'audio/pcm;rate=16000'}}}));sent+=3200;
  },100);
  return;
 }
 const sc=m.serverContent;
 if(sc?.inputTranscription?.text)events.push({t:at(),audioSent:(sent/32000).toFixed(1),afterStop:ended,heard:sc.inputTranscription.text});
 if(sc?.turnComplete){events.push({t:at(),event:'turnComplete'});done('turnComplete');}
};
ws.onclose=e=>done(`closed ${e.code} ${e.reason}`);
setTimeout(()=>done('timeout'),seconds*1000+30000);
