// Shadow evaluation: actual provider calls, no product routing or planner writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cases as originalCases,heldOutCases,options,requestFor,requestV2,validateResponse,applyPolicy,fingerprint,version as firstVersion,versionV2} from '../intent-v2/evals/jev-routing.mjs';
const revised=process.argv.includes('--v2'),version=revised?versionV2:firstVersion,cases=revised?[...originalCases,...heldOutCases]:originalCases;
const out='output/parser-2026-09-27/jev-routing'+(revised?'/v2':'');fs.mkdirSync(out,{recursive:true});
const requests=cases.map(c=>({case:c,request:(revised?requestV2:requestFor)(c)}));
if(!process.argv.includes('--run')){fs.writeFileSync(`${out}/requests.json`,JSON.stringify(requests,null,2));console.log(`Prepared ${cases.length} shadow routing requests; no API calls. Use --run explicitly.`);process.exit(0);}
assert.ok(!fs.existsSync(`${out}/results.jsonl`),'Refusing to overwrite paid results');
const serial='emulator-5554';assert.match(execFileSync('adb',['-s',serial,'emu','avd','name'],{encoding:'utf8'}),/RPM_S24_FE/);
const port=Number(process.env.RPM_QA_CDP_PORT??9229);assert.ok(Number.isInteger(port)&&port>0&&port<65536,'Valid owned WebView port required');
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.url?.includes('/index.html')&&JSON.parse(p.description||'{}').visible);assert.ok(page,'Open owned Capture');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let seq=0;const pending=new Map();ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}};
const ev=expression=>new Promise((resolve,reject)=>{
 const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Native transport timeout'));},20000);
 pending.set(id,r=>{clearTimeout(timer);if(r.error||r.result.exceptionDetails)reject(new Error('Native decision request failed'));else resolve(r.result.result.value);});
 ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
});
const rows=[],startedAt=Date.now();
try{
 assert.ok(await ev("fetch('/api/state').then(r=>r.json()).then(s=>s.aiEnabled)"),'No configured native key');
 for(const {case:c,request} of requests){
  const started=performance.now();let row;
  try{
   const r=await ev(`RPM_PLATFORM.action('decision',${JSON.stringify({requestId:`jev-route:${startedAt}:${c.numericId}`,body:request})})`),ms=Math.round(performance.now()-started);
   if(r.status!==200)throw new Error(`HTTP ${r.status}`);
   const answer=validateResponse(r.body,request),decision=applyPolicy(r.body,request);
   row={id:c.id,expected:c.expected,classified:options[answer.choice],classificationPassed:options[answer.choice]===c.expected,decision,ms,requestHash:fingerprint(request),version,response:r.body,cost:r.body.usage?.cost??null};
  }catch(e){row={id:c.id,expected:c.expected,classificationPassed:false,decision:{mode:'high',status:'fallback',reason:'provider_or_validation_failure'},ms:Math.round(performance.now()-started),error:e.message,cost:null};}
  rows.push(row);fs.appendFileSync(`${out}/results.jsonl`,JSON.stringify(row)+'\n');
  console.log(`${rows.length}/${cases.length} ${c.id}: ${row.classified??'error'} ${row.classificationPassed?'PASS':'FAIL'}, route ${row.decision.mode}, ${row.ms}ms, $${row.cost??'unknown'}`);
  if(row.error)throw new Error('Stopped after uncertain provider/validation failure; preserve evidence');
 }
 const sorted=rows.map(r=>r.ms).sort((a,b)=>a-b),summary={requests:rows.length,classificationPassed:rows.filter(r=>r.classificationPassed).length,noneRoutes:rows.filter(r=>r.decision.mode==='none').length,highRoutes:rows.filter(r=>r.decision.mode==='high').length,fallbacks:rows.filter(r=>r.decision.status==='fallback').length,p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],cost:rows.reduce((s,r)=>s+(r.cost??0),0),costKnown:rows.filter(r=>Number.isFinite(r.cost)).length,applied:false,version};
 fs.writeFileSync(`${out}/summary.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}finally{ws.close();}
