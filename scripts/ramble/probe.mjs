import {readFile} from 'node:fs/promises';
import {createRamble,applyRamble} from '../../android-companion/voice-turn.mjs';
import {liveSetup} from '../../android-companion/voice-tools.mjs';
import {mintVoiceToken,LIVE_URL,LIVE_TOKEN_URL} from '../../android-companion/voice-token.mjs';
import {todayDay} from './live.mjs';

const [file,...flags]=process.argv.slice(2),TZ='Asia/Kolkata',key=process.env.GEMINI_API_KEY;
if(!file||!key){console.log('Usage: npm run ramble:probe -- <file.wav> [--token]');process.exit(1);}
const pcm=(await readFile(file)).subarray(44),now=new Date(),data=todayDay(now),setup=liveSetup(now,TZ);
const url=flags.includes('--token')?`${LIVE_TOKEN_URL}?access_token=${(await mintVoiceToken(key,setup,now)).token}`:`${LIVE_URL}?key=${key}`;
const ramble=createRamble({data,timeZone:TZ}),ws=new WebSocket(url),log=[];let stoppedAt=0,voiceBytes=0,firstChange=null;
const finish=()=>{
 const r=ramble.result(),saved=structuredClone(data),outcome=applyRamble(saved,r,{messageId:'probe',timeZone:TZ});
 console.log(JSON.stringify({heard:r.heard,said:r.said,phase:ramble.state.phase,changes:r.changes.map(c=>`${c.kind} ${c.entity} "${c.title}"${c.to?' to '+c.to:''}${c.fields?' '+JSON.stringify(c.fields):''}`),errors:r.errors,outcome,voiceBytes,firstChangeMs:firstChange,log},null,1));
 process.exit(ramble.state.phase==='done'?0:1);
};
ws.onopen=()=>ws.send(JSON.stringify({setup}));
ws.onmessage=async e=>{
 const m=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(await e.data.arrayBuffer()).toString());
 if(m.setupComplete){
  ws.send(JSON.stringify({realtimeInput:{activityStart:{}}}));
  for(let i=0;i<pcm.length;i+=6400)ws.send(JSON.stringify({realtimeInput:{audio:{data:pcm.subarray(i,i+6400).toString('base64'),mimeType:'audio/pcm;rate=16000'}}}));
  ws.send(JSON.stringify({realtimeInput:{activityEnd:{}}}));ramble.stop();stoppedAt=Date.now();return;
 }
 for(const p of m.serverContent?.modelTurn?.parts??[])if(p.inlineData)voiceBytes+=p.inlineData.data.length;
 if(m.toolCall){log.push(`${Date.now()-stoppedAt}ms ${m.toolCall.functionCalls.map(c=>c.name).join(',')}`);if(m.toolCall.functionCalls.some(c=>c.name!=='get_plan'))firstChange??=Date.now()-stoppedAt;}
 for(const out of ramble.receive(m))ws.send(JSON.stringify(out));
 if(ramble.state.phase==='done'){log.push(`${Date.now()-stoppedAt}ms done`);finish();}
};
ws.onclose=e=>{ramble.fail(`closed ${e.code} ${e.reason}`);finish();};
setTimeout(()=>{ramble.fail('timeout');finish();},45000);
