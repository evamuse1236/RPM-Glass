import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {intentState} from '../../intent-v2/src/repository.mjs';
import {seedStore} from '../gauntlet/seed.mjs';
import {seedFixture,NOW as SEED_NOW} from '../capture-stress/seed.mjs';
import {TOOLS,applyTool,describe,planView,systemPrompt} from './ramble.mjs';

process.env.TZ='Asia/Kolkata';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const LIVE_MODEL='gemini-3.8-live';
const DAY=86400000;

export function todayDay(now=new Date()){
 const data=seedFixture({seedStore,editPlan,intentState}).data;
 const shift=Math.round((new Date(now).setHours(0,0,0,0)-new Date(SEED_NOW).setHours(0,0,0,0))/DAY)*DAY;
 for(const e of data.entries){
  if(e.planned)e.planned=new Date(Date.parse(e.planned)+shift).toISOString();
  if(e.plannedDate)e.plannedDate=new Date(Date.parse(e.plannedDate+'T12:00:00')+shift).toISOString().slice(0,10);
 }
 return data;
}

export function liveSetup(now){
 return {setup:{model:`models/${LIVE_MODEL}`,generationConfig:{responseModalities:['AUDIO']},
  systemInstruction:{parts:[{text:systemPrompt(now)+'\nVoice mode: after saving, say in one short, warm sentence what you did. If something important is truly unclear, save what you are sure of and ask one short question out loud; the person answers by talking again.'}]},
  outputAudioTranscription:{},
  tools:[{functionDeclarations:TOOLS.map(t=>({name:t.name,description:t.description,parametersJsonSchema:t.parameters}))}],
  inputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:true}}}};
}

export const LIVE_PRICES=Object.freeze({audioIn:3,textIn:0.75,out:12});
export function estimateCost(usage=[]){
 let audioIn=0,textIn=0,out=0;
 for(const u of usage){
  const audio=(u.promptTokensDetails??[]).filter(d=>d.modality==='AUDIO').reduce((a,d)=>a+d.tokenCount,0);
  audioIn+=audio;textIn+=(u.promptTokenCount??0)-audio;out+=(u.responseTokenCount??0)+(u.thoughtsTokenCount??0);
 }
 return (audioIn*LIVE_PRICES.audioIn+textIn*LIVE_PRICES.textIn+out*LIVE_PRICES.out)/1e6;
}

function wavHeader(bytes,rate=16000){
 const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+bytes,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);
 h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(bytes,40);return h;
}

class LiveSession{
 constructor(onMessage){this.onMessage=onMessage;this.ready=null;this.ws=null;}
 connect(now){
  this.ready=new Promise((resolve,reject)=>{
   const ws=new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`);
   this.ws=ws;
   ws.onopen=()=>ws.send(JSON.stringify(liveSetup(now)));
   ws.onmessage=async e=>{
    const m=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(await e.data.arrayBuffer()).toString());
    if(m.setupComplete!==undefined){resolve();return;}
    this.onMessage(m);
   };
   ws.onclose=e=>{this.closed=`${e.code} ${e.reason??''}`.trim();reject(new Error('Live closed: '+this.closed));this.ready=null;};
   ws.onerror=()=>{};
  });
  this.ready.catch(()=>{});
  return this.ready;
 }
 send(m){if(this.ws?.readyState===1)this.ws.send(JSON.stringify(m));}
 get open(){return this.ws?.readyState===1&&!!this.ready;}
}

const ESC='\x1b',KEY=/\x1b\[(\d+)(?::\d+)*(?:;(\d+)(?::(\d))?)?(?:;[\d:]*)?u/g;

async function main(){
 if(!process.env.GEMINI_API_KEY){console.log('Missing GEMINI_API_KEY. Start with: npm run ramble');process.exit(1);}
 const out=path.join(root,'.verify/ramble',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
 const say=s=>process.stdout.write(s+'\n');
 let talk=true;
 let state={data:todayDay(),actions:[],notes:[],finish:null,errors:[]},take=null,count=0;
 const handle=m=>{
  if(!take)return;
  const sc=m.serverContent;take.lastMsgAt=Date.now();
  if(m.usageMetadata)take.usage.push(m.usageMetadata);
  if(sc?.outputTranscription?.text)take.said+=sc.outputTranscription.text;
  for(const part of sc?.modelTurn?.parts??[])if(part.inlineData?.mimeType?.startsWith('audio/pcm')&&talk){
   take.player??=spawn('aplay',['-q','-f','S16_LE','-r','24000','-c','1','-t','raw','-'],{stdio:['pipe','ignore','ignore']});
   take.player.stdin.write(Buffer.from(part.inlineData.data,'base64'));take.voiceBytes=(take.voiceBytes??0)+part.inlineData.data.length;
  }
  if(sc?.inputTranscription?.text){take.heard+=sc.inputTranscription.text;take.lastHeardAt=Date.now();}
  if(m.toolCall){
   take.toolPending=true;
   if(m.toolCall.functionCalls.some(c=>!['get_plan','finish'].includes(c.name)))take.firstToolAt??=Date.now();
   if(m.toolCall.functionCalls.some(c=>c.name==='finish'))take.finished=true;
   const responses=m.toolCall.functionCalls.map(c=>{
    let response;try{response=applyTool(state,c.name,c.args??{},new Date());}catch(error){state.errors.push(`${c.name}: ${error.message}`);response={error:error.message};}
    take.calls.push({name:c.name,args:c.args});return {id:c.id,name:c.name,response:{result:response}};
   });
   session.send({toolResponse:{functionResponses:responses}});
  }
  if(sc?.turnComplete&&take.released){
   if(take.toolPending&&!take.finished){take.toolPending=false;return;}
   take.doneAt=Date.now();take.resolve();
  }
 };
 const session=new LiveSession(handle);
 const connect=()=>session.connect(new Date()).then(()=>true,error=>{say('Could not start Live: '+error.message);return false;});
 const restore=()=>{process.stdout.write(`${ESC}[<u`);if(process.stdin.isTTY)process.stdin.setRawMode(false);};
 process.on('exit',restore);
 say(`\nRamble test · ${LIVE_MODEL} hears you and edits a test day directly.`);
 say(`Test day: ${planView(state.data).tasks.length} tasks, moved to today. Your real planner is not touched.`);
 process.stdout.write('Connecting… ');say((await connect())?'ready.':'will retry when you talk.');
 say('Press SPACE to start talking, SPACE again to stop. T turns its voice on or off. R resets the test day. P shows the day. Q quits.\n');
 process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write(`${ESC}[>11u`);

 let rec=null,busy=false;
 const begin=async()=>{
  if(rec||busy)return;
  if(!session.open&&!(await connect()))return;
  count++;const before=state.actions.length,beforeNotes=state.notes.length;
  take={n:count,heard:'',said:'',calls:[],before,beforeNotes,started:Date.now(),released:false,audio:[],usage:[]};
  take.done=new Promise(r=>{take.resolve=r;});
  session.send({realtimeInput:{activityStart:{}}});
  const source=process.env.RAMBLE_AUDIO_FILE;
  const proc=source?spawn('ffmpeg',['-loglevel','error','-re','-i',source,'-f','s16le','-ar','16000','-ac','1','-'],{stdio:['ignore','pipe','ignore']})
   :spawn('arecord',['-q','-f','S16_LE','-r','16000','-c','1','-t','raw','-'],{stdio:['ignore','pipe','ignore']});
  proc.stdout.on('data',chunk=>{take.audio.push(chunk);session.send({realtimeInput:{audio:{data:chunk.toString('base64'),mimeType:'audio/pcm;rate=16000'}}});});
  rec=proc;process.stdout.write('● listening… (SPACE to stop) ');
 };
 const end=async()=>{
  if(!rec)return;const proc=rec;rec=null;busy=true;
  if(proc.exitCode===null&&proc.signalCode===null)await new Promise(r=>{proc.once('exit',r);proc.kill('SIGINT');});
  const t=take;t.released=true;t.releasedAt=Date.now();const held=t.releasedAt-t.started;
  session.send({realtimeInput:{activityEnd:{}}});
  say(`stopped (${(held/1000).toFixed(1)} s).`);
  t.lastMsgAt=Date.now();
  const timeout=new Promise(r=>setTimeout(()=>r('timeout'),45000));
  const quiet=new Promise(r=>{const id=setInterval(()=>{if(!t.toolPending&&Date.now()-t.lastMsgAt>5000){clearInterval(id);t.doneAt??=t.lastMsgAt;r('quiet');}},250);t.done.then(()=>clearInterval(id));});
  const why=await Promise.race([t.done.then(()=>'done'),timeout,quiet]);
  await new Promise(r=>setTimeout(r,400));
  const actions=state.actions.slice(t.before),notes=state.notes.slice(t.beforeNotes);
  const view={...state,actions,notes};
  say(`\nHeard: "${t.heard.trim()||'(nothing)'}"`);
  const cost=estimateCost(t.usage);
  say(`── ${LIVE_MODEL} · first change ${t.firstToolAt?((t.firstToolAt-t.releasedAt)/1000).toFixed(1)+' s':'—'} after you stopped · done ${t.doneAt?((t.doneAt-t.releasedAt)/1000).toFixed(1)+' s':why} · about $${cost.toFixed(4)}`);
  const lines=describe(view,state.data);
  for(const l of lines)say('  '+l);
  if(!lines.length)say('  (no changes)');
  if(t.said.trim())say(`  Said: "${t.said.trim()}"`);
  t.player?.stdin.end();
  if(state.finish&&t.calls.some(c=>c.name==='finish')){for(const u of state.finish.unsure??[])say('  ? '+u);}
  for(const e of state.errors.splice(0))say('  ! '+e);
  const pcm=Buffer.concat(t.audio);
  await writeFile(path.join(out,`take-${t.n}.wav`),Buffer.concat([wavHeader(pcm.length),pcm]));
  await writeFile(path.join(out,`take-${t.n}.json`),JSON.stringify({model:LIVE_MODEL,said:t.said,voiceBytes:t.voiceBytes??0,usage:t.usage,heard:t.heard,heldMs:held,firstChangeMs:t.firstToolAt?t.firstToolAt-t.releasedAt:null,doneMs:t.doneAt?t.doneAt-t.releasedAt:null,calls:t.calls,lines},null,2));
  say(`\nSaved ${path.relative(root,out)}/take-${t.n}.*  ·  SPACE to talk again, P for the day, R to reset, Q to quit.\n`);
  take=null;busy=false;
 };
 const showDay=()=>{const v=planView(state.data);say('\nTest day now:');for(const t of v.tasks)say(`  ${t.done?'[x]':'[ ]'} ${t.title}${t.start?' · '+t.start:t.day?' · '+t.day:''}${t.minutes?' · '+t.minutes+' min':''}${t.alert&&t.alert!=='off'?' · '+t.alert:''}`);say('');};
 let starting=false;
 const toggle=async()=>{if(starting||busy)return;if(rec){end();return;}starting=true;try{await begin();}finally{starting=false;}};
 const reset=()=>{state={data:todayDay(),actions:[],notes:[],finish:null,errors:[]};session.ws?.close();say('\nTest day reset. Reconnecting on your next ramble.\n');};
 process.stdin.on('data',buf=>{
  const s=buf.toString('latin1');let matched=false;
  for(const m of s.matchAll(KEY)){matched=true;const code=+m[1],mods=+(m[2]??1),event=+(m[3]??1);
   if(event===3&&code!==32)continue;
   if(code===113||(code===99&&mods===5)||code===27){restore();process.exit(0);}
   if(code===114&&event===1)reset();
   if(code===112&&event===1)showDay();
   if(code===116&&event===1){talk=!talk;say(`\nVoice ${talk?'on':'off'}.\n`);}
   if(code===32&&event===1)toggle();
  }
  if(!matched){
   if(s==='q'||s==='\x03'){restore();process.exit(0);}
   if(s==='r')reset();if(s==='p')showDay();if(s==='t'){talk=!talk;say(`\nVoice ${talk?'on':'off'}.\n`);}
   if(s===' ')toggle();
  }
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exit(1);});
