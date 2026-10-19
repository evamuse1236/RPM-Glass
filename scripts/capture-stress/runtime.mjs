import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {seedFixture,NOW,TIMEZONE} from './seed.mjs';
import {cliCall} from './cli.mjs';
import {evaluateCase} from './evaluate.mjs';

export async function targetModules(repo){
 const files={service:'android-companion/intent-service.mjs',agent:'android-companion/capture-agent.mjs',trace:'android-companion/capture-trace.mjs',
  planner:'android-companion/planner-tools.mjs',editor:'android-companion/planner-state.mjs',undo:'chat-prototype/companion-tools.mjs',
  snapshot:'android-companion/capture-snapshot.mjs',seed:'scripts/gauntlet/seed.mjs',state:'intent-v2/src/repository.mjs',
  prompt:'intent-v2/prompts/intent-system.mjs',schema:'intent-v2/src/schema.mjs',claude:'intent-v2/adapters/claude.mjs',errors:'android-companion/user-message.mjs'};
 return Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,file])=>[key,await import(pathToFileURL(path.join(repo,file)).href)])));
}

export async function fileBackend(file,seed){
 await writeFile(file,JSON.stringify(seed));
 return {
  load:async()=>JSON.parse(await readFile(file,'utf8')),
  save:async(expected,next)=>{
   const current=JSON.parse(await readFile(file,'utf8'));
   if(current.version!==expected){const error=new Error('Version conflict');error.code='VERSION_CONFLICT';throw error;}
   await writeFile(file+'.next',JSON.stringify(next));await rename(file+'.next',file);
  },
 };
}

export async function runCase(test,{modules:m,directory,mode,repeat=1,modelOverride}){
 const started=Date.now();await mkdir(directory,{recursive:true});
 const {data,events}=seedFixture({seedStore:m.seed.seedStore,editPlan:m.editor.editPlan,intentState:m.state.intentState});
 await writeFile(path.join(directory,'seed.json'),JSON.stringify({data,events},null,2));
 const before=structuredClone(data),backend=await fileBackend(path.join(directory,'store.json'),data);
 let tick=0,currentText='',currentMessage='',turnCalls=[];
 const clock=()=>new Date(Date.parse(NOW)+tick*1000);
 const model=async(input,options)=>{
  const call={routeUsed:options.route.effort==='none'?'quick':'careful',route:structuredClone(options.route),savedBeforeModel:(await backend.load()).intentV2?.captures?.[currentMessage]?.raw===currentText};
  turnCalls.push(call);
  try{
   const result=modelOverride?await modelOverride(input,options):await cliCall({prompt:m.prompt.intentSystemPrompt,input,schema:m.schema.TURN_SCHEMA,
    model:m.claude.CLAUDE_API_MODELS[options.route.model],effort:options.route.effort,mode,signal:options.signal,timeoutMs:Math.max(1,options.deadline-Date.now())});
   Object.assign(call,result);
   const record=result.record;
   if(record?.isError){const error=new Error('CLI transport could not obtain a model response; captured words are safe');error.code='TRANSPORT_ERROR';throw error;}
   const models=Object.keys(record?.modelUsage??{}),requested=m.claude.CLAUDE_API_MODELS[options.route.model];
   if(!modelOverride&&!models.some(id=>id===requested||id.startsWith(requested+'-')))throw new Error('CLI returned an unexpected model');
   Object.assign(options.run,{service:'cli',provider:'CLI transport',servedModel:models.join(',')||requested,
    inputTokens:record?.usage?.input_tokens??null,outputTokens:record?.usage?.output_tokens??null,cost:record?.costUSD??null});
   return result.output;
  }catch(error){call.error=m.errors.userMessage(error);throw error;}
 };
 const service=m.service.createIntentService({backend,model,changePlanner:m.planner.changePlanner,undo:m.undo.undo,editPlan:m.editor.editPlan,
  readCalendar:async()=>({status:'ready',start:Date.parse('2026-10-01'),end:Date.parse('2026-12-01'),events}),
  snapshot:async({data})=>m.snapshot.planSnapshot(data,{now:clock(),timezone:TIMEZONE,events}),clock,timezone:TIMEZONE});
 let traceJson='[]';
 const traces=m.trace.createTraceStore({storage:{getItem:()=>traceJson,setItem:(_,v)=>{traceJson=v;}},clock});
 const agent=m.agent.createCaptureAgent({service,traces,clock});
 const turns=[],states=[];let focusedId=null,previousId=null;
 for(const [index,turn] of test.turns.entries()){
  tick=index;currentText=turn.text;currentMessage=`stress-${test.id}-${index+1}`;turnCalls=[];
  const input={messageId:currentMessage,conversationId:'stress',text:turn.text};
  if(turn.focus)focusedId=turn.focus==='dinner'?'draft-dinner':previousId??focusedId;
  if(focusedId)input.focusDraftId=focusedId;
  let result=null,exception=null;
  const at=Date.now();
  try{result=await (turn.deferApply?service:agent).capture(input);}catch(error){exception=m.errors.userMessage(error);}
  const after=await backend.load(),capture=after.intentV2?.captures?.[currentMessage]??null;
  if(focusedId&&!['draft','review'].includes(after.intentV2?.drafts?.[focusedId]?.status))focusedId=null;
  if(result?.draftId)previousId=result.draftId;
  const draftId=result?.draftId??input.focusDraftId??previousId;
  const draft=after.intentV2?.drafts?.[draftId]??null;
  const observation={text:turn.text,stage:turn.deferApply?'draft':'auto-apply',ms:Date.now()-at,
   result:result?{status:result.status,draftId:result.draftId,error:result.error,code:result.code,applied:result.applied}:null,
   exception,capture,draft,focusDraft:after.intentV2?.drafts?.[(test.turns.some(t=>t.focus==='dinner')?'draft-dinner':input.focusDraftId)??draftId]??null,calls:turnCalls,trace:traces.get(currentMessage),
   allRawRetained:turns.every(t=>after.intentV2?.captures?.[t.capture?.messageId]?.raw===t.text)};
  turns.push(observation);
  states.push(after);
  await writeFile(path.join(directory,`turn-${index+1}.json`),JSON.stringify({input,observation,state:after},null,2));
 }
 const after=await backend.load();
 const unique=evaluateCase(test,{before,after,turns,states,validate:m.schema.validate,schema:m.schema.TURN_SCHEMA});
 await writeFile(path.join(directory,'final.json'),JSON.stringify(after,null,2));
 return {id:test.id,repeat,tags:test.tags,pass:unique.length===0,ms:Date.now()-started,failures:unique,expect:test.expect,turns,
  artifacts:{directory,final:path.join(directory,'final.json')},saved:{newTasks:after.entries.filter(e=>!before.entries.some(b=>b.id===e.id)),health:after.planner.body}};
}
