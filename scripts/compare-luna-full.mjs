// Explicitly paid, synthetic comparison using an owned emulator's native transport.
// Credentials and app plans are never read into the runner or sent to a model.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {configurations,cases,requestFor,assess,summarize} from '../intent-v2/evals/luna-full.mjs';

process.env.TZ='Asia/Kolkata';
const args=process.argv.slice(2),count=cases.length*configurations.length;
if(!args.includes('--run')){console.log(`${cases.length} synthetic cases (66 original + 7 regressions), ${count} requests: GPT-6 Luna none/high. Use --run for paid requests.`);process.exit(0);}
const outputIndex=args.indexOf('--output'),output=outputIndex<0?`output/parser-2026-09-27/luna-full-${new Date().toISOString().replace(/[:.]/g,'-')}`:args[outputIndex+1];
assert.ok(output,'--output requires a directory');
fs.mkdirSync(output,{recursive:true});
const resultFile=path.join(output,'results.jsonl');assert.ok(!fs.existsSync(resultFile),'Refusing to overwrite a live evaluation');
const serial=process.env.RPM_QA_DEVICE??'emulator-5554';assert.ok(serial.startsWith('emulator-'),'Owned emulator only');
assert.match(execFileSync('adb',['-s',serial,'emu','avd','name'],{encoding:'utf8'}),/RPM_S24_FE/);
const pages=await(await fetch('http://127.0.0.1:9229/json/list')).json();
const page=pages.find(p=>p.url.includes('/index.html')&&JSON.parse(p.description||'{}').visible);assert.ok(page,'Open owned emulator Capture');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let next=0;const pending=new Map();
ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){pending.get(x.id)?.(x);pending.delete(x.id);}};
const ev=expression=>new Promise((resolve,reject)=>{
 const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Native evaluation transport timeout'));},45000);
 pending.set(id,r=>{clearTimeout(timer);if(r.error||r.result?.exceptionDetails)reject(new Error(JSON.stringify(r.error??r.result.exceptionDetails)));else resolve(r.result.result.value);});
 ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
});
const rows=[],runId=Date.now(),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),cases:cases.length,requests:count,configurations,caseHash:hash(cases),reference:'2026-09-16T04:00:00.000Z',timezone:'Asia/Kolkata',retries:0,replicates:1,notes:'Sequential calls, alternating first configuration per case. Native transport deadline; report production 12s Capture deadline separately. Review all replies after deterministic grading.',requestsByCase:cases.map(c=>({id:c.id,suite:c.suite,text:c.text,humanReview:c.humanReview??'Use the range/tool regression contract.',bodyHash:configurations.map(config=>({effort:config.effort,sha256:hash(requestFor(c,config))}))}))},null,2));
try{
 assert.ok(await ev("fetch('/api/state').then(r=>r.json()).then(s=>s.aiEnabled)"),'Emulator has no configured model key');
 for(let i=0;i<cases.length;i++)for(let j=0;j<configurations.length;j++){
  const c=cases[i],config=configurations[(i+j)%configurations.length],body=requestFor(c,config),started=performance.now(),requestId=`luna-full:${runId}:${i}:${j}`;
  let row;
  try{
   const response=await ev(`RPM_PLATFORM.action('model',${JSON.stringify({requestId,body})}).then(r=>({status:r.status,body:{id:r.body?.id,model:r.body?.model,provider:r.body?.provider,usage:r.body?.usage,choices:r.body?.choices?.map(c=>({finish_reason:c.finish_reason,message:{content:c.message?.content,tool_calls:c.message?.tool_calls,refusal:c.message?.refusal}}))}}))`);
   const ms=Math.round(performance.now()-started),b=response.body;
   let judged;
   if(response.status!==200)judged={failures:[`HTTP ${response.status}`],contractFailures:[`HTTP ${response.status}`],semanticFailures:[]};
   else try{judged=await assess(c,b);}catch(e){judged={failures:[e.message],contractFailures:[e.message],semanticFailures:[],answer:b.choices?.[0]?.message};}
   if(response.status===200&&b.model!==config.model)judged.failures.push(`Unexpected model: ${b.model}`);
   if(response.status===200&&b.provider!=='OpenAI')judged.failures.push(`Unexpected provider: ${b.provider}`);
   row={...config,caseId:c.id,suite:c.suite,category:c.category,ms,status:response.status,...judged,passed:judged.failures.length===0,contractPassed:judged.contractFailures.length===0,
    responseId:b.id,actualModel:b.model,provider:b.provider,cost:b.usage?.cost??null,promptTokens:b.usage?.prompt_tokens,completionTokens:b.usage?.completion_tokens,reasoningTokens:b.usage?.completion_tokens_details?.reasoning_tokens??null,cachedTokens:b.usage?.prompt_tokens_details?.cached_tokens??null,finishReason:b.choices?.[0]?.finish_reason};
  }catch(e){row={...config,caseId:c.id,suite:c.suite,category:c.category,ms:Math.round(performance.now()-started),passed:false,contractPassed:false,failures:[e.message],contractFailures:[e.message],semanticFailures:[],cost:null};}
  rows.push(row);fs.appendFileSync(resultFile,JSON.stringify(row)+'\n');fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summarize(rows),null,2));
  console.log(`${rows.length}/${count} ${config.effort} ${c.id}: ${row.passed?'PASS':'FAIL'} ${row.ms}ms $${row.cost??'unknown'} ${row.failures.join('; ')}`);
  if([401,402,403,429].includes(row.status))throw new Error(`Stopped after account/rate-limit HTTP ${row.status}`);
  if(row.failures.some(f=>/transport timeout/.test(f)))throw new Error('Stopped on uncertain native transport state');
 }
 console.log(JSON.stringify({output,summary:summarize(rows)},null,2));
}finally{ws.close();}
