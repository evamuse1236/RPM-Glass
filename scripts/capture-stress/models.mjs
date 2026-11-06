import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCaptureSession,nodeModelBridge} from '../../cli/capture-session.mjs';
import {renderCapture} from '../../cli/capture.mjs';
import {nativeModelTransport,providerSchema} from '../../intent-v2/adapters/transport.mjs';
import {TURN_SCHEMA} from '../../intent-v2/src/schema.mjs';
import {intentSystemPrompt} from '../../intent-v2/prompts/intent-system.mjs';
import {HAIKU_MODEL,CLAUDE_PROVIDERS} from '../../intent-v2/src/model-policy.mjs';
import {NOW} from './seed.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const DEFAULT_MODELS=['haiku','liquid/lfm-2.5-2.6b:free','inception/mercury-3','minimax/minimax-m3'];
export const ROUTERS=new Set(['typesafe/jev-router']);
const phoneModel=model=>model.startsWith('anthropic/')||model.startsWith('openai/');
export const REASONING_REQUIRED=new Set(['liquid/lfm-2.5-2.6b:free','liquid/lfm-2.5-2.6b','liquid/lfm-2.5-24b-a2b','reflection/beam-1.0-501b-a23b']);

/** Every call the phone sends to Haiku goes to `model`; Sonnet calls (hard requests, repairs) stay as on the phone. */
export function swappedTransport(model,{native,prompt=intentSystemPrompt}){
 const phone=nativeModelTransport({native,model:HAIKU_MODEL,prompt,providerNames:CLAUDE_PROVIDERS,effort:'none'});
 if(model==='haiku')return phone;
 const effort=REASONING_REQUIRED.has(model)?undefined:'none';
 const other=nativeModelTransport({native,model,prompt,providerNames:[],effort});
 return (input,options={})=>{
  if(options.route&&options.route.model!==HAIKU_MODEL)return phone(input,options);
  if(options.run)options.run.model=model;
  return other(input,{...options,route:{...(options.route??{}),model,...(REASONING_REQUIRED.has(model)?{effort:undefined}:{})}});
 };
}

export function modelOptions(args){
 const options={models:DEFAULT_MODELS,phrases:path.join(root,'scripts/capture-stress/model-phrases.json'),runs:1,now:NOW,out:path.join(root,'.verify/capture-models',new Date().toISOString().replace(/[:.]/g,'-'))};
 for(let i=0;i<args.length;i++){
  const flag=args[i];
  if(flag==='--help')return {help:true};
  if(!['--models','--phrases','--runs','--now','--out'].includes(flag)||!args[i+1])throw new Error('Use --models a,b --phrases <file> --runs N --now <ISO> --out <dir>.');
  const value=args[++i];
  options[flag.slice(2)]=flag==='--models'?value.split(',').map(s=>s.trim()).filter(Boolean):flag==='--runs'?Number(value):value;
 }
 if(!Number.isInteger(options.runs)||options.runs<1||options.runs>10)throw new Error('--runs takes 1 to 10.');
 return options;
}

const pct=(list,p)=>{const s=[...list].sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.ceil(s.length*p)-1)]:null;};
const sec=ms=>ms==null?'-':(ms/1000).toFixed(1)+'s';
const short=m=>String(m??'').replace(/^.*\//,'').replace(/^claude-/,'');

export async function runOne({model,phrase,now,file,env,fetchImpl}){
 await rm(file,{force:true});
 const replies=[];
 const recording=async(url,init)=>{
  const request=JSON.parse(init.body);
  if(!phoneModel(request.model??'')&&request.response_format?.json_schema){request.response_format.json_schema.schema=providerSchema(TURN_SCHEMA);init={...init,body:JSON.stringify(request)};}
  const response=await fetchImpl(url,init);let text=await response.text();
  let body=null;try{body=JSON.parse(text);}catch{}
  const routedTo=ROUTERS.has(request.model)?body?.model??null:null;
  if(routedTo){body.model=request.model;text=JSON.stringify(body);}
  const choice=body?.choices?.[0]??null,content=choice?.message?.content??body?.content?.find?.(c=>c.type==='tool_use'||c.type==='text')??null;
  const sent=JSON.parse(init.body);let input=null;try{input=JSON.parse(sent.messages?.at(-1)?.content??'null');}catch{}
  replies.push({model:sent.model,routedTo,repairHint:input?.repair?.validationError??null,rawError:body?.error?.metadata?.raw??null,activeDraft:input?.activeDraft?{id:input.activeDraft.id,titles:(input.activeDraft.operations??[]).map(o=>o.title??o.fields?.find?.(f=>f.name==='title')?.value)}:null,inputKeys:input?Object.keys(input):null,status:response.status,provider:body?.provider??null,finish:choice?.finish_reason??body?.stop_reason??null,error:body?.error?.message??null,content:typeof content==='string'?content.slice(0,6000):content});
  return new Response(text,{status:response.status,headers:response.headers});
 };
 const native=nodeModelBridge({env,fetchImpl:recording});
 const session=await createCaptureSession({file,now,env,fetchImpl,model:swappedTransport(model,{native})});
 try{
  const observation=await session.send(phrase);
  const view=renderCapture(observation,{aiEnabled:true,data:await session.backend.load(),events:session.events,now:session.clock()});
  const runs=(observation.result?.modelRuns??[]).map(r=>({model:r.servedModel??r.model,reason:r.reason,ms:r.ms,ok:r.ok,error:r.error??null,cost:r.cost??null,outputTokens:r.outputTokens??null}));
  return {model,phrase,ms:observation.ms,status:observation.card?.status??null,read:observation.card?.status!=='captured',sonnet:runs.some(r=>/sonnet/.test(r.model)),runs,text:view.text,replies};
 }finally{await session.close();}
}

export function summarize(results){
 const by=new Map();
 for(const r of results){if(!by.has(r.model))by.set(r.model,[]);by.get(r.model).push(r);}
 return [...by].map(([model,rows])=>{
  const ok=rows.filter(r=>r.read);
  return {model,captures:rows.length,read:ok.length,notRead:rows.length-ok.length,sonnet:rows.filter(r=>r.sonnet).length,
   medianMs:pct(ok.map(r=>r.ms),0.5),p90Ms:pct(ok.map(r=>r.ms),0.9),maxMs:ok.length?Math.max(...ok.map(r=>r.ms)):null,
   costUSD:rows.flatMap(r=>r.runs).reduce((s,x)=>s+(typeof x.cost==='number'?x.cost:0),0)};
 });
}

async function main(){
 const options=modelOptions(process.argv.slice(2));
 if(options.help){console.log('npm run capture:models -- [--models haiku,<openrouter id>,...] [--phrases file.json] [--runs N] [--now ISO] [--out dir]');return;}
 if(!process.env.OPENROUTER_API_KEY){console.log('Not run: OPENROUTER_API_KEY is missing.');process.exitCode=1;return;}
 process.env.TZ='Asia/Kolkata';
 const groups=JSON.parse(await readFile(options.phrases,'utf8'));
 const phrases=Array.isArray(groups)?groups.map(text=>({group:'phrases',text})):Object.entries(groups).flatMap(([group,list])=>list.map(text=>({group,text})));
 await mkdir(options.out,{recursive:true});
 const results=[];
 for(const model of options.models){
  console.log(`\n=== ${model}`);
  for(const {group,text} of phrases)for(let run=1;run<=options.runs;run++){
   let row;
   try{row={group,run,...await runOne({model,phrase:text,now:options.now,file:path.join(options.out,'store.json'),env:process.env,fetchImpl:fetch})};}
   catch(error){row={group,run,model,phrase:text,ms:null,status:'error',read:false,sonnet:false,runs:[],text:String(error?.message??error)};}
   results.push(row);
   const calls=row.runs.map(r=>`${short(r.model)} ${sec(r.ms)}${r.error?' '+r.error:''}`).join(' → ')||'no model call';
   console.log(`${sec(row.ms).padStart(6)}  ${row.read?'read   ':'NOT READ'}  ${text.slice(0,60)}\n         ${calls}\n         ${row.text.split('\n').slice(0,-1).join(' | ').slice(0,220)}`);
   await writeFile(path.join(options.out,'results.json'),JSON.stringify({now:options.now,results},null,2));
  }
 }
 await rm(path.join(options.out,'store.json'),{force:true});
 const summary=summarize(results);
 await writeFile(path.join(options.out,'results.json'),JSON.stringify({now:options.now,summary,results},null,2));
 console.log('\nmodel                         read   median  p90    max    sonnet  cost');
 for(const s of summary)console.log(`${s.model.padEnd(30)}${`${s.read}/${s.captures}`.padEnd(7)}${sec(s.medianMs).padEnd(8)}${sec(s.p90Ms).padEnd(7)}${sec(s.maxMs).padEnd(7)}${String(s.sonnet).padEnd(8)}$${s.costUSD.toFixed(4)}`);
 console.log(`\nSaved: ${path.join(options.out,'results.json')}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error?.message??error);process.exitCode=1;});
