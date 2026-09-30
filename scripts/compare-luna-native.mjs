// Explicit --run sends only synthetic cases through the owned emulator's encrypted
// OpenRouter credential. Never extracts the key or changes the app's model default.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {configurations,cases,requestFor,assess,summarize} from '../intent-v2/evals/luna-sample.mjs';
const args=process.argv.slice(2),selected=args.includes('--tool-only')?cases.filter(c=>c.id==='tool'):cases,output='output/parser-2026-09-27/luna-sample'+(args.includes('--tool-only')?'/tool-correction':'');
if(!args.includes('--run')){console.log(`${selected.length*configurations.length} bounded synthetic calls: six Capture cases and one tool-call case per configuration. Use --run to charge the configured OpenRouter account.`);process.exit(0);}
process.env.TZ='Asia/Kolkata';fs.mkdirSync(output,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:9229/json/list')).json(),page=pages.find(p=>p.url.includes('/index.html')&&JSON.parse(p.description||'{}').visible);assert.ok(page,'Open owned emulator Capture');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){pending.get(x.id)(x);pending.delete(x.id);}};
const ev=expression=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,r=>r.result.exceptionDetails?reject(new Error(JSON.stringify(r.result.exceptionDetails))):resolve(r.result.result.value));ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
const rows=[],runId=Date.now();
try{
 assert.ok(await ev("fetch('/api/state').then(r=>r.json()).then(s=>s.aiEnabled)"),'Emulator has no configured model key');
 for(let i=0;i<selected.length;i++)for(let j=0;j<configurations.length;j++){
  const c=selected[i],config=configurations[(i+j)%configurations.length],body=requestFor(c,config),started=performance.now();let row;
  const requestId=`luna-eval:${runId}:${i}:${j}`;
  try{
   const r=await ev(`RPM_PLATFORM.action('model',${JSON.stringify({requestId,body})}).then(r=>({status:r.status,body:{id:r.body.id,model:r.body.model,provider:r.body.provider,usage:r.body.usage,choices:r.body.choices?.map(c=>({finish_reason:c.finish_reason,message:{content:c.message?.content,tool_calls:c.message?.tool_calls,refusal:c.message?.refusal}}))}}))`),ms=Math.round(performance.now()-started),b=r.body;
   if(r.status!==200)row={...config,caseId:c.id,ms,status:r.status,passed:false,failures:[`HTTP ${r.status}`],cost:null};
   else{
    let judged;try{judged=await assess(c,b);}catch(e){judged={failures:[e.message],answer:b.choices?.[0]?.message};}
    if(b.model!==config.model)judged.failures.push(`Unexpected response model: ${b.model}`);
    row={...config,caseId:c.id,ms,status:r.status,passed:judged.failures.length===0,...judged,responseId:b.id,actualModel:b.model,provider:b.provider,cost:b.usage?.cost??null,promptTokens:b.usage?.prompt_tokens,completionTokens:b.usage?.completion_tokens,reasoningTokens:b.usage?.completion_tokens_details?.reasoning_tokens??null,cachedTokens:b.usage?.prompt_tokens_details?.cached_tokens??null,finishReason:b.choices?.[0]?.finish_reason};
   }
  }catch(e){row={...config,caseId:c.id,ms:Math.round(performance.now()-started),passed:false,failures:[e.message],cost:null};}
  rows.push(row);fs.writeFileSync(`${output}/results.jsonl`,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');fs.writeFileSync(`${output}/summary.json`,JSON.stringify(summarize(rows),null,2));
  console.log(`${rows.length}/${selected.length*configurations.length} ${config.model} ${config.effort} ${c.id}: ${row.passed?'PASS':'FAIL'} ${row.ms}ms $${row.cost??'unknown'} ${row.failures.join('; ')}`);
  // A bad key or depleted credit blocks all configurations; do not hammer it.
  if([401,402,403].includes(row.status))throw new Error(`Stopped after account HTTP ${row.status}`);
 }
 console.log(JSON.stringify(summarize(rows),null,2));
}finally{ws.close();}
