import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {intentState} from '../../intent-v2/src/repository.mjs';
import {seedStore} from '../gauntlet/seed.mjs';
import {seedFixture} from '../capture-stress/seed.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const TZ='Asia/Kolkata',OFFSET='+05:30';
export const AGENTS=Object.freeze({
 opus:{label:'Opus 5.5 (lowest effort)',service:'anthropic',model:'claude-opus-5-5',effort:'low'},
 sol:{label:'GPT-6.1 Sol (low)',service:'openrouter',model:'openai/gpt-6.1-sol',effort:'low'},
});

const localTime=iso=>iso?new Date(iso).toLocaleString('en-IN',{timeZone:TZ,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):null;
const todayLabel=now=>now.toLocaleString('en-IN',{timeZone:TZ,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'});

export function planView(data){
 const p=data.planner??{},live=x=>!x.archived;
 return {
  tasks:(data.entries??[]).filter(e=>live(e)&&e.kind!=='note').map(e=>({id:e.id,title:e.title,done:!!e.done,start:e.planned?localTime(e.planned):null,day:e.plannedDate??null,minutes:e.minutes??null,blockId:e.blockId??null,alert:e.alertIntent?.type??null,alertLead:e.alertIntent?.lead??null,repeat:e.recurrence??null,must:!!e.must})),
  blocks:(p.blocks??[]).filter(live).map(b=>({id:b.id,title:b.title,purpose:b.purpose||null,projectId:b.projectId??null})),
  projects:(p.projects??[]).filter(live).map(x=>({id:x.id,title:x.title,purpose:x.purpose||null})),
 };
}

export const TOOLS=[
 {name:'get_plan',description:'Read every saved task, Block and Project with their ids.',parameters:{type:'object',properties:{},additionalProperties:false}},
 {name:'save_task',description:'Add a task (no id) or change one (with id). Only send the fields you want to set. Times are local ISO with offset, like 2026-10-28T18:00:00+05:30.',parameters:{type:'object',properties:{
  id:{type:'integer',description:'Existing task id to change. Leave out to add a new task.'},
  title:{type:'string'},start:{type:['string','null'],description:'Start date and time, ISO with +05:30.'},
  day:{type:['string','null'],description:'A day with no time, YYYY-MM-DD.'},minutes:{type:['integer','null']},
  blockId:{type:['string','null']},alert:{type:['string','null'],enum:['reminder','alarm','off',null]},alertLead:{type:'integer',description:'Minutes before the start.'},
  repeat:{type:['string','null'],enum:['daily','weekly','weekdays',null]},must:{type:'boolean'},notes:{type:'string'},purpose:{type:'string'},done:{type:'boolean'}},additionalProperties:false}},
 {name:'delete_task',description:'Remove a saved task.',parameters:{type:'object',properties:{id:{type:'integer'}},required:['id'],additionalProperties:false}},
 {name:'save_block',description:'Add a Block (no id) or change one. A Block groups tasks toward one result.',parameters:{type:'object',properties:{id:{type:'string'},title:{type:'string'},purpose:{type:'string'},projectId:{type:['string','null']}},required:['title'],additionalProperties:false}},
 {name:'save_project',description:'Add a Project (no id) or change one.',parameters:{type:'object',properties:{id:{type:'string'},title:{type:'string'},purpose:{type:'string'}},required:['title'],additionalProperties:false}},
 {name:'keep_note',description:'Keep a thought, idea or feeling that is not a task, in the person\'s words.',parameters:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}},
 {name:'finish',description:'Call once at the end. List every change you made in plain words, and anything you were unsure about.',parameters:{type:'object',properties:{summary:{type:'string'},unsure:{type:'array',items:{type:'string'}}},required:['summary'],additionalProperties:false}},
];

export function systemPrompt(now){
 return `You keep a person's day planner. They speak a ramble into a microphone and walk away without reading anything. Capture everything they said, correctly, on the first try.
Now: ${todayLabel(now)} (time zone ${TZ}, offset ${OFFSET}).
- Call get_plan first.
- Make every task, time, length, reminder or alarm, repeat, Block or Project mention, change to a saved task, completion and removal they asked for. Keep ideas and feelings with keep_note.
- Use their words for titles. Never invent tasks, times or lengths they did not say.
- "Tomorrow", "tonight", "in 20 minutes" and weekday names count from now. A time without am or pm means the next sensible one.
- A saved task they name or clearly mean is changed, not added again.
- If something is unclear, make the most likely choice and list it under unsure in finish. Never ask a question.
- End with finish.`;
}

export function applyTool(state,name,args,now){
 const data=state.data;
 if(name==='get_plan')return planView(data);
 if(name==='keep_note'){state.notes.push(String(args.text));return {kept:true};}
 if(name==='finish'){state.finish=args;return {ok:true};}
 if(name==='delete_task'){const t=data.entries.find(e=>e.id===args.id);if(!t)throw new Error(`No task ${args.id}.`);editPlan(data,{type:'archiveTask',id:args.id},now);state.actions.push({kind:'delete',title:t.title});return {deleted:args.id};}
 if(name==='save_task'){
  const f={};
  if('title'in args)f.title=args.title;
  if('start'in args){if(args.start!==null&&!Number.isFinite(Date.parse(args.start)))throw new Error('start must be ISO with an offset.');f.planned=args.start?new Date(args.start).toISOString():null;}
  if('day'in args)f.plannedDate=args.day;
  for(const [from,to] of [['minutes','minutes'],['blockId','blockId'],['alert','alert'],['alertLead','alertLead'],['repeat','recurrence'],['must','must'],['notes','notes'],['purpose','purpose'],['done','done']])if(from in args)f[to]=args[from];
  const before=args.id?data.entries.find(e=>e.id===args.id):null;
  if(args.id&&!before)throw new Error(`No task ${args.id}.`);
  const id=editPlan(data,{type:'saveTask',...(args.id?{id:args.id}:{}),fields:f},now)??args.id;
  state.actions.push({kind:args.id?(args.done?'complete':'change'):'add',id,title:args.title??before?.title,fields:args});
  return {saved:id};
 }
 if(name==='save_block'||name==='save_project'){
  const collection=name==='save_block'?'blocks':'projects';
  const saved=editPlan(data,{type:'saveEntity',collection,...(args.id?{id:args.id}:{}),fields:{title:args.title,purpose:args.purpose??'',...(collection==='blocks'&&'projectId'in args?{projectId:args.projectId}:{})}},now);
  state.actions.push({kind:args.id?'change':'add',entity:collection.slice(0,-1),title:args.title,fields:args});
  return {saved:saved??args.id};
 }
 throw new Error(`Unknown tool ${name}.`);
}

async function postJson(url,headers,body){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const text=await response.text();let json=null;try{json=JSON.parse(text);}catch{}
 if(!response.ok)throw Object.assign(new Error(`${response.status}: ${(json?.error?.message??text).slice(0,300)}`),{status:response.status});
 return json;
}

async function anthropicStep(agent,system,messages){
 return postJson('https://api.anthropic.com/v1/messages',{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},{
  model:agent.model,max_tokens:4000,system,messages,thinking:{type:'adaptive'},output_config:{effort:agent.effort},
  tools:TOOLS.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}))});
}

export async function runAgent(agent,{transcript,data,now}){
 const state={data:structuredClone(data),actions:[],notes:[],finish:null,errors:[]},started=Date.now(),usage={input:0,output:0,cost:0};
 const system=systemPrompt(now),user=`What I said:\n"""${transcript}"""`;
 if(agent.service==='anthropic'){
  const messages=[{role:'user',content:user}];
  for(let step=0;step<16&&!state.finish;step++){
   const r=await anthropicStep(agent,system,messages);
   usage.input+=r.usage?.input_tokens??0;usage.output+=r.usage?.output_tokens??0;
   messages.push({role:'assistant',content:r.content});
   const calls=r.content.filter(c=>c.type==='tool_use');if(!calls.length)break;
   messages.push({role:'user',content:calls.map(c=>{let out;try{out=applyTool(state,c.name,c.input,now);}catch(error){state.errors.push(`${c.name}: ${error.message}`);out={error:error.message};}return {type:'tool_result',tool_use_id:c.id,content:JSON.stringify(out)};})});
  }
  usage.cost=usage.input/1e6*5+usage.output/1e6*25;
 }else{
  const messages=[{role:'system',content:system},{role:'user',content:user}];
  for(let step=0;step<16&&!state.finish;step++){
   const r=await postJson('https://openrouter.ai/api/v1/chat/completions',{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},{model:agent.model,max_tokens:4000,reasoning:{effort:agent.effort,exclude:true},messages,tools:TOOLS.map(t=>({type:'function',function:t})),tool_choice:'auto'});
   usage.input+=r.usage?.prompt_tokens??0;usage.output+=r.usage?.completion_tokens??0;usage.cost+=r.usage?.cost??0;
   const message=r.choices[0].message;messages.push(message);
   const calls=message.tool_calls??[];if(!calls.length)break;
   for(const c of calls){let out,args={};try{args=JSON.parse(c.function.arguments||'{}');out=applyTool(state,c.function.name,args,now);}catch(error){state.errors.push(`${c.function.name}: ${error.message}`);out={error:error.message};}messages.push({role:'tool',tool_call_id:c.id,content:JSON.stringify(out)});}
  }
 }
 return {...state,ms:Date.now()-started,usage};
}

export function describe(result,data){
 const blockName=id=>(result.data.planner?.blocks??[]).find(b=>b.id===id)?.title??id;
 const lines=result.actions.map(a=>{
  if(a.entity)return `${a.kind==='add'?'Added':'Changed'} ${a.entity} "${a.title}"${a.fields.purpose?' · purpose: '+a.fields.purpose:''}`;
  if(a.kind==='delete')return `Removed "${a.title}"`;
  const f=a.fields,t=result.data.entries.find(e=>e.id===a.id);
  const bits=[f.start?localTime(f.start):f.day?f.day+' (no time)':null,f.minutes?f.minutes+' min':null,f.alert&&f.alert!=='off'?`${f.alert}${f.alertLead!=null?' '+f.alertLead+' min before':''}`:null,f.repeat?'repeats '+f.repeat:null,f.blockId?'Block: '+blockName(f.blockId):null,f.must?'must':null,f.notes?'note: '+f.notes:null].filter(Boolean);
  const verb=a.kind==='add'?'Added':a.kind==='complete'?'Completed':'Changed';
  return `${verb} "${a.title??t?.title}"${bits.length?' · '+bits.join(' · '):''}`;
 });
 for(const n of result.notes)lines.push(`Kept note: ${n}`);
 return lines;
}

const STT_PROMPT='Transcribe this recording exactly as spoken (English, Hindi or a mix, written in Latin letters). Keep false starts and corrections. Output only the words. If there are no words, output nothing.';
export const OPENROUTER_STT='google/gemini-3.8-flash';
async function transcribe(file,model){
 const audio=(await readFile(file)).toString('base64');
 if(model===OPENROUTER_STT){
  const r=await postJson('https://openrouter.ai/api/v1/chat/completions',{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},{model,max_tokens:2000,temperature:0,messages:[{role:'user',content:[{type:'text',text:STT_PROMPT},{type:'input_audio',input_audio:{data:audio,format:'wav'}}]}]});
  return (r.choices?.[0]?.message?.content??'').trim();
 }
 const r=await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{},{
  contents:[{role:'user',parts:[{text:STT_PROMPT},{inline_data:{mime_type:'audio/wav',data:audio}}]}],
  generationConfig:{temperature:0}});
 return (r.candidates?.[0]?.content?.parts??[]).map(p=>p.text??'').join('').trim();
}

export async function pickGeminiModel(){
 if(!process.env.GEMINI_API_KEY)return {model:OPENROUTER_STT,note:'no Gemini key stored, via OpenRouter'};
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=200`).then(x=>x.json());
 if(r.error)return {model:OPENROUTER_STT,note:'Gemini key refused, via OpenRouter'};
 const flash=(r.models??[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace('models/','')).filter(n=>/^gemini-[\d.]+-flash$/.test(n));
 const v=n=>n.match(/[\d.]+/)[0].split('.').map(Number);
 flash.sort((a,b)=>{const x=v(a),y=v(b);for(let i=0;i<3;i++)if((x[i]??0)!==(y[i]??0))return (y[i]??0)-(x[i]??0);return 0;});
 if(!flash.length)return {model:OPENROUTER_STT,note:'no Gemini flash model for this key, via OpenRouter'};
 return {model:flash[0],note:'Gemini API'};
}

function startDay(storeFile){
 if(storeFile)return readFile(storeFile,'utf8').then(JSON.parse);
 return Promise.resolve(seedFixture({seedStore,editPlan,intentState}).data);
}

const ESC='\x1b';
const KEY=/\x1b\[(\d+)(?::\d+)*(?:;(\d+)(?::(\d))?)?(?:;[\d:]*)?u/g;

async function main(){
 const args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
 for(const k of ['ANTHROPIC_API_KEY','OPENROUTER_API_KEY'])if(!process.env[k]){console.log(`Missing ${k}. Start with: npm run ramble`);process.exit(1);}
 const picked=option('--stt')?{model:option('--stt'),note:'chosen'}:await pickGeminiModel(),stt=picked.model;
 const day=await startDay(option('--store'));
 const out=path.join(root,'.verify/ramble',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
 let recorder=null,recordStart=0,busy=false,toggle=false,count=0;
 const say=s=>process.stdout.write(s+'\n');
 const restore=()=>{process.stdout.write(`${ESC}[<u`);if(process.stdin.isTTY)process.stdin.setRawMode(false);};
 process.on('exit',restore);
 process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write(`${ESC}[>11u`);
 say(`\nRamble test · speech: ${stt} (${picked.note}) · models: ${Object.values(AGENTS).map(a=>a.label).join(' + ')}`);
 say(`Test day: ${planView(day).tasks.length} tasks. Your real planner is not touched.`);
 say('Hold SPACE and talk. Let go to send. Q quits.\n');
 const begin=()=>{if(recorder||busy)return;count++;const file=path.join(out,`take-${count}.wav`);recorder={file,proc:spawn('pw-record',['--rate','16000','--channels','1','--format','s16',file],{stdio:'ignore'})};recordStart=Date.now();process.stdout.write('● recording… ');};
 const end=async()=>{
  if(!recorder)return;const {file,proc}=recorder;recorder=null;const held=Date.now()-recordStart;
  await new Promise(resolve=>{proc.once('exit',resolve);proc.kill('SIGINT');});
  if(held<600){say('too short, ignored.');return;}
  busy=true;say(`stopped (${(held/1000).toFixed(1)} s).`);
  try{
   const t0=Date.now(),transcript=await transcribe(file,stt),sttMs=Date.now()-t0;
   say(`\nYou said (${(sttMs/1000).toFixed(1)} s to transcribe):\n  "${transcript}"\n`);
   const now=new Date(),runs=Object.entries(AGENTS).map(async([key,agent])=>{
    try{const r=await runAgent(agent,{transcript,data:day,now});return {key,agent,r};}catch(error){return {key,agent,error:error.message};}
   });
   const results=[];
   for(const p of runs.map(p=>p.then(x=>{results.push(x);
    const head=`── ${x.agent.label}${x.r?` · ${(x.r.ms/1000).toFixed(1)} s · $${x.r.usage.cost.toFixed(4)}`:''}`;
    say(head);
    if(x.error)say('  failed: '+x.error);
    else{for(const l of describe(x.r,day))say('  '+l);for(const u of x.r.finish?.unsure??[])say('  ? '+u);for(const e of x.r.errors)say('  ! '+e);if(!x.r.actions.length&&!x.r.notes.length)say('  (did nothing)');}
    say('');return x;})))await p;
   await writeFile(path.join(out,`take-${count}.json`),JSON.stringify({transcript,stt,sttMs,results:results.map(x=>({model:x.agent.model,error:x.error??null,ms:x.r?.ms,usage:x.r?.usage,actions:x.r?.actions,notes:x.r?.notes,finish:x.r?.finish,errors:x.r?.errors,lines:x.r?describe(x.r,day):[]}))},null,2));
   say(`Saved to ${path.relative(root,out)}/take-${count}.*  ·  Hold SPACE for another, Q to quit.\n`);
  }catch(error){say('Failed: '+error.message);}
  finally{busy=false;}
 };
 process.stdin.on('data',buf=>{
  const s=buf.toString('latin1');let matched=false;
  for(const m of s.matchAll(KEY)){matched=true;const code=+m[1],mods=+(m[2]??1),event=+(m[3]??1);
   if(code===113||(code===99&&mods===5)||code===27){restore();process.exit(0);}
   if(code===32){if(event===1)begin();else if(event===3)end();}
  }
  if(!matched){
   if(s==='q'||s==='\x03'||s===ESC){restore();process.exit(0);}
   if(s===' '){toggle=true;recorder?end():begin();if(count===1&&toggle&&recorder)say('\n(This terminal does not report key release: press SPACE again to stop.)');}
  }
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exit(1);});
