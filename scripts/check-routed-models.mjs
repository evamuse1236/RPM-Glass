// Paid synthetic evaluation of the production service via the native key vault.
// No device store writes, credentials, or user records enter this runner.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cases,fixture,assess,reference} from '../intent-v2/evals/luna-full.mjs';
import {createIntentService} from '../android-companion/intent-service.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {changePlanner} from '../android-companion/planner-tools.mjs';
import {editPlan} from '../android-companion/planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {planningRequest,readPlanningResponse,jevSortRequest,readJevSortResponse,jevFingerprint} from '../android-companion/planner-ai.mjs';
import {requestFor as sampleRequest} from '../intent-v2/evals/luna-sample.mjs';
import {LUNA_MODEL} from '../intent-v2/src/model-policy.mjs';
process.env.TZ='Asia/Kolkata';
const args=process.argv.slice(2),output=args[args.indexOf('--output')+1];
if(!args.includes('--run')){console.log('Dry run: 72 synthetic captures through production routing + 1 tool call + 2 planning suggestions + 1 Jev batch. Use --run --output DIR and RPM_QA_CDP_PORT for paid requests.');process.exit(0);}
assert.ok(output&&args.includes('--output'));const port=Number(process.env.RPM_QA_CDP_PORT);assert.ok(Number.isInteger(port)&&port>0);
fs.mkdirSync(output,{recursive:true});assert.ok(!fs.existsSync(`${output}/results.jsonl`),'Do not overwrite an evaluation');
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.url.includes('/index.html')&&JSON.parse(p.description||'{}').visible);assert.ok(page);
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let serial=0;const pending=new Map();
ws.onclose=()=>{for(const done of pending.values())done({error:'Native page closed during the run'});pending.clear();};
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}};
const ev=expression=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Native evaluation timed out'));},40000);pending.set(id,m=>{clearTimeout(timer);if(m.error||m.result?.exceptionDetails)reject(new Error(JSON.stringify(m.error??m.result.exceptionDetails)));else resolve(m.result.result.value);});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
const runId=Date.now(),rows=[];
const sourceFiles=['intent-v2/src/harness.mjs','intent-v2/src/context.mjs','intent-v2/src/model-policy.mjs','intent-v2/adapters/transport.mjs','intent-v2/prompts/intent-system.mjs','android-companion/intent-service.mjs','android-companion/intent-time-guard.mjs','android-companion/planner-ai.mjs','cli/interpret.mjs'];
fs.writeFileSync(`${output}/source-manifest.json`,JSON.stringify({at:new Date().toISOString(),files:Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))},null,2));
try{
 // Use the real native bridge even if a previous UI fixture replaced action().
 await ev(`(()=>{window.__rpmEvalCleanup?.();const previous=window.rpmBridgeResult,waiting=new Map();window.__rpmEvalNative=(action,payload)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID()+':1';const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Native timeout'));},37000);waiting.set(id,{resolve,reject,timer});window.RpmNative.invoke(id,action,JSON.stringify(payload));});window.rpmBridgeResult=(id,value,error)=>{const p=waiting.get(id);if(!p)return previous(id,value,error);waiting.delete(id);clearTimeout(p.timer);error?p.reject(new Error(error)):p.resolve(value);};window.__rpmEvalCleanup=()=>{window.rpmBridgeResult=previous;delete window.__rpmEvalNative;delete window.__rpmEvalCleanup;};return true;})()`);
 const native=async(action,payload)=>ev(`window.__rpmEvalNative(${JSON.stringify(action)},${JSON.stringify(payload)})`);
 const skipFile=args.includes('--skip-from')?args[args.indexOf('--skip-from')+1]:null;
 const completed=new Set(skipFile?fs.readFileSync(skipFile,'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.passed).map(r=>r.caseId):[]);
 const requested=args.includes('--case')?cases.filter(c=>c.id===args[args.indexOf('--case')+1]):cases.filter(c=>!completed.has(c.id));
 for(const c of requested){
  const started=performance.now(),requests=[];let result,judged,capture,modelFailures=[];
  const trackedNative=async(action,payload)=>{const start=performance.now(),r=await native(action,payload);if(action==='model'||action==='decision')requests.push({effort:payload.body.reasoning?.effort??null,ms:Math.round(performance.now()-start),status:r.status,body:r.body});return r;};
  try{
   if(c.sampleId==='tool'){
    const body=sampleRequest({...c,id:'tool'},{model:LUNA_MODEL,effort:'high'}),r=await trackedNative('model',{requestId:`policy:${runId}:${c.id}`,body});judged=await assess(c,r.body);result={status:'tool_checked'};
   }else{
    const {data}=fixture(c),backend=createMemoryBackend(data),before=JSON.stringify(data.entries);
    const service=createIntentService({backend,native:trackedNative,changePlanner,undo,editPlan,readCalendar:async()=>({status:'not_selected',events:[]}),clock:()=>new Date(reference),timezone:'Asia/Kolkata'});
    result=await service.capture({messageId:c.id,conversationId:'eval',text:c.text});const saved=await backend.load();capture=saved.intentV2.captures[c.id];
    assert.equal(JSON.stringify(saved.entries),before,'Interpretation must not mutate tasks');assert.equal(capture.raw,c.text,'Original words changed');
    judged=result.status==='interpreted'?await assess(c,requests.at(-1).body):{failures:[result.error??result.status]};
    modelFailures=[...judged.failures];
    const draft=saved.intentV2.drafts[capture.draftId];capture={...capture,draft};
    if(draft){
     const body=structuredClone(requests.at(-1).body),answer=JSON.parse(body.choices[0].message.content);
     answer.operations=draft.operations.map(o=>({opId:o.opId,sourceId:o.sourceId,kind:o.kind,entity:o.entity,targetId:o.targetId,fields:o.fields.map(f=>Object.fromEntries(['name','op','value','origin','evidence'].map(k=>[k,f[k]])))}));
     answer.reply=draft.reply;answer.question=draft.question;body.choices[0].message.content=JSON.stringify(answer);judged=await assess(c,body);
    }
    if(c.id==='voice-03'&&draft?.schedulePreview.items[0]?.planned!=='2026-09-17T02:30:00.000Z')judged.failures.push('Hinglish clock did not resolve to tomorrow 8 AM');
    if(c.id==='voice-04'&&draft?.schedulePreview.items.some(p=>p.planned))judged.failures.push('Invented a Marathi morning clock');
   }
  }catch(e){judged={failures:[e.message]};}
  const row={caseId:c.id,text:c.text,category:c.category,status:result?.status,attemptedCalls:result?.calls??requests.length,ms:Math.round(performance.now()-started),passed:judged.failures.length===0,failures:judged.failures,modelFailures,reply:capture?.reply,draft:capture?.draft,modelRuns:capture?.modelRuns,requests:requests.map(r=>({...r,body:{id:r.body.id,model:r.body.model,provider:r.body.provider,usage:r.body.usage,choices:r.body.choices}}))};
  rows.push(row);fs.appendFileSync(`${output}/results.jsonl`,JSON.stringify(row)+'\n');console.log(JSON.stringify({caseId:row.caseId,passed:row.passed,ms:row.ms,efforts:requests.map(r=>r.effort),failures:row.failures}));
  if(ws.readyState!==WebSocket.OPEN)break;
 }
 if(!args.includes('--case')&&ws.readyState===WebSocket.OPEN){
  const data=fixture(cases[0]).data,blockId=editPlan(data,{type:'saveEntity',collection:'blocks',fields:{title:'Fractions lesson ready',purpose:'Children understand fractions'}});editPlan(data,{type:'saveTask',fields:{title:'Print fraction worksheets'}});editPlan(data,{type:'saveTask',fields:{title:'Buy groceries'}});
  for(const action of ['purpose','ideas']){const body=planningRequest(data,action,blockId),started=performance.now(),r=await native('model',{requestId:`policy:${runId}:${action}`,body});let result,error;try{result=readPlanningResponse(r.body,action);}catch(e){error=e.message;}fs.writeFileSync(`${output}/${action}.json`,JSON.stringify({status:r.status,ms:Math.round(performance.now()-started),result,error,body:r.body},null,2));}
  const request=jevSortRequest(data);fs.writeFileSync(`${output}/jev-request.json`,JSON.stringify(request.body,null,2));
  // The schema is unchanged from the validated existing-block integration.
  const started=performance.now(),r=await native('decision',{requestId:`policy:${runId}:jev`,body:request.body});let result,error;try{result=readJevSortResponse(r.body,request);}catch(e){error=e.message;}fs.writeFileSync(`${output}/jev.json`,JSON.stringify({status:r.status,ms:Math.round(performance.now()-started),fingerprint:await jevFingerprint(request.body),result,error,body:r.body},null,2));
 }
 const costs=rows.flatMap(r=>r.requests.map(c=>c.body.usage?.cost)),times=rows.map(r=>r.ms).sort((a,b)=>a-b),summary={cases:rows.length,passed:rows.filter(r=>r.passed).length,calls:costs.length,costKnown:costs.filter(Number.isFinite).length,cost:costs.filter(Number.isFinite).reduce((a,b)=>a+b,0),p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],failures:rows.filter(r=>!r.passed).map(r=>({id:r.caseId,failures:r.failures}))};fs.writeFileSync(`${output}/summary.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{try{await ev('window.__rpmEvalCleanup?.()');}catch{}ws.close();}
