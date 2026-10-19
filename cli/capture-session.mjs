import {readFile,writeFile,rename,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {createIntentService} from '../android-companion/intent-service.mjs';
import {createCaptureAgent} from '../android-companion/capture-agent.mjs';
import {createTraceStore,modelRun} from '../android-companion/capture-trace.mjs';
import {planSnapshot} from '../android-companion/capture-snapshot.mjs';
import {changePlanner} from '../android-companion/planner-tools.mjs';
import {editPlan} from '../android-companion/planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {intentState} from '../intent-v2/src/repository.mjs';
import {nativeModelTransport} from '../intent-v2/adapters/transport.mjs';
import {intentSystemPrompt} from '../intent-v2/prompts/intent-system.mjs';
import {HAIKU_MODEL,CLAUDE_PROVIDERS} from '../intent-v2/src/model-policy.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';
import {canUndoChange} from '../android-companion/capture-session.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {seedFixture,TIMEZONE} from '../scripts/capture-stress/seed.mjs';

export function nodeModelBridge({env=process.env,fetchImpl=fetch}={}){
 const running=new Map();
 return async(type,{requestId,service,body,timeoutMs=95000})=>{
  if(type==='cancelModel'){running.get(requestId)?.abort();return {};}
  const key=env[service==='anthropic'?'ANTHROPIC_API_KEY':'OPENROUTER_API_KEY'];
  if(!key)return {missingKey:true};
  const controller=new AbortController();running.set(requestId,controller);
  const timer=setTimeout(()=>controller.abort(),Math.min(timeoutMs,95000));
  try{
   const response=await fetchImpl(service==='anthropic'?'https://api.anthropic.com/v1/messages':'https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',redirect:'error',signal:controller.signal,
    headers:service==='anthropic'?{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'}:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(body)});
   return {status:response.status,body:response.ok?await response.json():null};
  }catch{throw Object.assign(new Error('The AI service could not be reached. Your words are saved.'),{code:'TRANSPORT_ERROR'});}
  finally{clearTimeout(timer);running.delete(requestId);}
 };
}

// Only IDs, hashes, timing and routing leave the local trace through /trace.
export function privateTrace(trace){
 if(!trace)return null;
 return {id:trace.id,at:trace.at,attempts:trace.attempts,latencyMs:trace.latencyMs,outcome:trace.outcome,
  models:(trace.models??[]).map(modelRun),localInterpretation:trace.localInterpretation??null,timeInferences:trace.timeInferences??[],applied:{status:trace.applied?.status,draftId:trace.applied?.draftId,entryIds:trace.applied?.entryIds??[]},
  errors:(trace.errors??[]).map(({stage,code})=>({stage,code}))};
}

async function storeLock(file){
 const identity=process.platform==='win32'?file.toLowerCase():file;
 const hash=createHash('sha256').update(identity).digest('hex');
 const address=process.platform==='win32'?`\\\\.\\pipe\\rpm-capture-${hash}`:process.platform==='linux'?`\0rpm-capture-${hash}`:null;
 if(!address)throw new Error('Capture CLI store locking currently supports Windows and Linux.');
 const server=createServer(socket=>socket.destroy());
 await new Promise((resolve,reject)=>{
  server.once('error',error=>reject(error.code==='EADDRINUSE'||error.code==='EACCES'?new Error('This store is already open. Close its other Capture session first.'):error));
  server.listen(address,resolve);
 });
 server.unref();
 return {close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}

export async function createCaptureSession({file,now=null,model,env=process.env,fetchImpl=fetch}={}){
 if(now!==null&&!Number.isFinite(Date.parse(now)))throw new Error('--now needs a valid ISO date and time.');
 const clock=()=>now===null?new Date():new Date(now);
 file=path.resolve(file);await mkdir(path.dirname(file),{recursive:true});
 try{file=await realpath(file);}catch(error){if(error.code!=='ENOENT')throw error;file=path.join(await realpath(path.dirname(file)),path.basename(file));}
 const lock=await storeLock(file);
 const fresh=()=>seedFixture({seedStore,editPlan,intentState});
 let events=fresh().events,traceJson='[]';
 const atomic=async(next)=>{await writeFile(file+'.next',JSON.stringify(next,null,2));await rename(file+'.next',file);};
 try{
  try{await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;await atomic(fresh().data);}
  const backend={load:async()=>JSON.parse(await readFile(file,'utf8')),save:async(expected,next)=>{
   const current=await backend.load();if(current.version!==expected)throw Object.assign(new Error('Saved data changed. Retry your action.'),{code:'VERSION_CONFLICT'});
   await atomic(next);
  }};
  const traces=createTraceStore({storage:{getItem:()=>traceJson,setItem:(_,v)=>{traceJson=v;}},clock});
  // Retain only word-free traces between sessions.
  const saved=await backend.load();traceJson=JSON.stringify(saved.captureCliTraces??[]);
  const service=createIntentService({backend,model:model??nativeModelTransport({native:nodeModelBridge({env,fetchImpl}),model:HAIKU_MODEL,prompt:intentSystemPrompt,providerNames:CLAUDE_PROVIDERS,effort:'none'}),
   changePlanner,undo,editPlan,clock,timezone:TIMEZONE,
   readCalendar:async()=>({status:'ready',start:Date.parse('2026-10-01'),end:Date.parse('2026-12-01'),events}),
   snapshot:async({data})=>planSnapshot(data,{now:clock(),timezone:TIMEZONE,events})});
  const agent=createCaptureAgent({service,traces,clock});
  const conversationId='stress';
  const persistTraces=async()=>{const data=await backend.load();data.captureCliTraces=traces.list().map(privateTrace);await atomic(data);};
  const latest=async()=> (await service.view({conversationId})).captures[0]??null;
  const send=async(text)=>{const started=Date.now(),result=await agent.capture({messageId:`cli-${randomUUID()}`,conversationId,text});await persistTraces();return {result,card:await latest(),ms:Date.now()-started};};
  const act=async(item)=>{const action=item.action,id=actionIdFor(action),started=Date.now();
   const result=action.kind==='keep-note'?await service.keepNote({...action,actionId:id}):action.kind==='choose'?await agent.choose(action,{actionId:id}):await agent.act(action,{actionId:id});
   await persistTraces();return {result,card:await latest(),ms:Date.now()-started};};
  return {backend,service,agent,traces,send,act,latest,clock,get events(){return structuredClone(events);},aiEnabled:!!model||!!env.ANTHROPIC_API_KEY||!!env.OPENROUTER_API_KEY,
   async retry(){const card=await latest();if(!card)throw new Error('There are no saved words to retry.');const started=Date.now(),result=await agent.retry(card.messageId);await persistTraces();return {result,card:await latest(),ms:Date.now()-started};},
   async undo(){const data=await backend.load(),draft=Object.values(data.intentV2?.drafts??{}).reverse().find(d=>d.status==='committed'&&canUndoChange(d,data.undo?.id));if(!draft)throw new Error('There is no current change to undo.');await agent.undo({draftId:draft.id,conversationId:draft.conversationId,actionId:`undo-${randomUUID()}`});await persistTraces();},
   async reset(){await atomic(fresh().data);traceJson='[]';events=fresh().events;},
   async close(){await lock.close();}};
 }catch(error){await lock.close();throw error;}
}
