// Same-day eval of the phone's voice agent.
// Each case goes to Gemini Live with the phone's own setup (liveSetup) and tools (createRamble), so a branch and main
// can be scored on the same phrases on the same day. --audio speaks each phrase with edge-tts and streams it like the
// phone's mic; without it the phrase is sent as text (faster, but it hides what the audio model mishears).
// Usage: secret run --env GEMINI_API_KEY=gemini-api -- node scripts/agent-rounds/voice-eval.mjs --cases FILE [--audio] [--repo CHECKOUT] [--out FILE] [--repeat N]
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {scoreVoice} from './voice-score.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const TZ='Asia/Kolkata';
const LIVE_URL='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

function args(argv){
 const out={repo:root,repeat:1,concurrency:4,audio:argv.includes('--audio')};
 argv=argv.filter(x=>x!=='--audio');
 for(let i=0;i<argv.length;i++){const k=argv[i].replace(/^--/,'');out[k]=argv[++i];}
 out.repeat=+out.repeat;out.concurrency=+out.concurrency;return out;
}

/** An edge-tts voice per case: its `voice`, else Hindi for Devanagari text, else Indian English. */
const voiceFor=c=>c.voice??(/[ऀ-ॿ]/.test(c.text)?'hi-IN-SwaraNeural':'en-IN-NeerjaNeural');

/** The phrase as 16 kHz mono PCM, cached by voice and words, with 1.5 s of quiet after it so the server ends the turn. */
function speech(c,dir){
 const voice=voiceFor(c),name=createHash('sha256').update(voice+'\n'+c.text).digest('hex').slice(0,16),file=path.join(dir,`${name}.pcm`);
 if(!existsSync(file)){
  const mp3=file+'.mp3';
  const say=text=>spawnSync('edge-tts',['--voice',voice,'--text',text,'--write-media',mp3],{encoding:'utf8'}).status===0;
  if(!say(c.ttsText??c.text)&&!say(c.ttsText??c.text)&&!say((c.ttsText??c.text)+' …'))throw new Error('edge-tts failed for '+c.id);
  const ff=spawnSync('ffmpeg',['-loglevel','error','-y','-i',mp3,'-af','apad=pad_dur=1.5','-f','s16le','-ac','1','-ar','16000',file]);
  if(ff.status!==0)throw new Error('ffmpeg failed for '+c.id);
 }
 return file;
}

async function load(repo){
 const mod=f=>import(pathToFileURL(path.join(repo,f)).href);
 const [turn,tools,live]=await Promise.all([mod('android-companion/voice-turn.mjs'),mod('android-companion/voice-tools.mjs'),mod('scripts/ramble/live.mjs')]);
 return {createRamble:turn.createRamble,liveSetup:tools.liveSetup,todayDay:live.todayDay};
}

/** One phrase through one Live session. Resolves with what the phone would have saved. */
function runCase(lib,c,key,{audio=null,timeoutMs=45000}={}){
 const now=new Date(c.now),data=lib.todayDay(now);
 const setup=lib.liveSetup(now,TZ,{data,continuous:true});
 const ramble=lib.createRamble({data,timeZone:TZ,now:()=>now,undoSaved:true});
 return new Promise(resolve=>{
  const ws=new WebSocket(`${LIVE_URL}?key=${key}`);let finished=false,sent=false,pending=false,timer;
  const finish=why=>{
   if(finished)return;finished=true;clearTimeout(timer);try{ws.close();}catch{}
   const r=ramble.result();
   const created=r.changes.filter(x=>x.kind==='add').map(x=>({entity:x.entity,title:x.title,fields:x.fields??{}}));
   resolve({id:c.id,end:why,heard:r.heard,said:r.said,changes:r.changes.map(x=>({kind:x.kind,entity:x.entity,title:x.title,fields:x.fields??null})),created,errors:r.errors,ops:r.batch?.ops?.length??0});
  };
  timer=setTimeout(()=>finish(sent?'done':'timeout'),timeoutMs);
  ws.onopen=()=>ws.send(JSON.stringify({setup}));
  ws.onmessage=async e=>{
   const m=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(await e.data.arrayBuffer()).toString());
   if(m.setupComplete){
    if(audio){
     const pcm=await readFile(audio);
     for(let i=0;i<pcm.length;i+=3200){if(finished)return;ws.send(JSON.stringify({realtimeInput:{audio:{data:pcm.subarray(i,i+3200).toString('base64'),mimeType:'audio/pcm;rate=16000'}}}));await new Promise(r=>setTimeout(r,25));}
    }else{
     ramble.receive({serverContent:{inputTranscription:{text:c.text}}});
     ws.send(JSON.stringify({realtimeInput:{text:c.text}}));
    }
    ramble.stop();sent=true;
    clearTimeout(timer);timer=setTimeout(()=>finish('done'),audio?12000:timeoutMs);
    return;
   }
   if(m.toolCall)pending=true;
   for(const out of ramble.receive(m))ws.send(JSON.stringify(out));
   if(m.serverContent?.turnComplete&&sent){
    const status=m.serverContent.interactionStatus;
    if(status?status!=='REQUIRES_ACTION'&&status!=='IN_PROGRESS':!pending)finish('done');
    pending=false;
   }
  };
  ws.onerror=()=>{};
  ws.onclose=e=>finish(`closed ${e.code} ${String(e.reason??'').slice(0,120)}`);
 });
}

async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);}}));return out;}

async function main(){
 const a=args(process.argv.slice(2)),key=process.env.GEMINI_API_KEY;
 if(!a.cases||!key){console.log('Needs --cases and GEMINI_API_KEY.');process.exit(2);}
 const cases=JSON.parse(await readFile(a.cases,'utf8')),lib=await load(path.resolve(a.repo));
 const audioDir=path.join(root,'.verify/agent-rounds/audio');await mkdir(audioDir,{recursive:true});
 for(const c of a.audio?cases:[])speech(c,audioDir);
 const jobs=[];for(let r=0;r<a.repeat;r++)for(const c of cases)jobs.push({...c,rep:r});
 const runs=await pool(jobs,a.concurrency,async c=>{const run=await runCase(lib,c,key,{audio:a.audio?speech(c,audioDir):null});return {...run,rep:c.rep,score:scoreVoice(c,run)};});
 const byTarget={};
 for(const run of runs)for(const [target,ok] of Object.entries(run.score)){byTarget[target]??={pass:0,n:0};byTarget[target].n++;if(ok)byTarget[target].pass++;}
 const summary={repo:a.repo,mode:a.audio?'audio':'text',at:new Date().toISOString(),cases:cases.length,repeat:a.repeat,byTarget};
 if(a.out){await mkdir(path.dirname(a.out),{recursive:true});await writeFile(a.out,JSON.stringify({summary,runs},null,1));}
 console.log(JSON.stringify(summary));
 for(const run of runs){const bad=Object.entries(run.score).filter(([,ok])=>!ok).map(([t])=>t);if(bad.length)console.log(`FAIL ${run.id}#${run.rep} [${bad}] end=${run.end} heard=${JSON.stringify((run.heard??'').slice(0,80))} made=${JSON.stringify(run.created.map(x=>x.title))} said=${JSON.stringify(run.said.slice(0,100))}`);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exit(2);});
