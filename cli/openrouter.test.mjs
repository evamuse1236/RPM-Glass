import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {MODEL,ENDPOINT,createOpenRouter,normalizeExtraction,readApiKey} from './openrouter.mjs';
import {Workflow,emptyData,persist,load} from './workflow.mjs';
process.env.TZ='Asia/Kolkata';
const now=()=>new Date('2026-09-09T23:30:00+05:30');
const raw='Tomorrow at 12:05 a.m. interview for twenty minutes. I feel proud but drained.';
const item=patch=>({title:'interview',kind:'plan',state:'active',evidence:['interview'],time:{text:'tomorrow at 12:05 am',evidence:['Tomorrow at 12:05 a.m.'],uncertain:false,clarification:null},durationMinutes:20,durationEvidence:'for twenty minutes',alert:'alarm',purpose:null,purposeEvidence:null,...patch});
const extraction=(entries=[item()],feelings={mood:null,energy:null,evidence:[]})=>({entries,feelings});
const response=(value,patch={})=>new Response(JSON.stringify({model:MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'capture',edit:null,...value})}}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150,cost:0.0001},...patch}),{status:200});
const interpreter=value=>createOpenRouter({apiKey:'test-only-token',fetchImpl:async()=>response(value)});

test('alarm arithmetic crosses midnight locally and retains source phrases',()=>{
  const [e]=normalizeExtraction(extraction(),raw,now());
  assert.equal(e.planned,'2026-09-09T18:35:00.000Z');
  assert.equal(e.alert.at,'2026-09-09T18:25:00.000Z');
  assert.equal(e.plannedDate,'2026-09-10');assert.equal(e.minutes,20);
  assert.deepEqual(e.interpretation.timeEvidence,['Tomorrow at 12:05 a.m.']);
});
test('ambiguous, bare AM/PM, date-only and invented absolute dates never trigger alerts',()=>{
  for(const time of [
    {text:'tomorrow at 7',uncertain:false},
    {text:'tomorrow at 7pm',uncertain:true},
    {text:'tomorrow',uncertain:false},
    {text:'2026-09-11 at 7am',uncertain:false},
  ]){
    const [e]=normalizeExtraction(extraction([item({time:{...time,evidence:['Tomorrow'],clarification:null}})]),raw,now());
    assert.equal(e.alert,null);assert.equal(e.planned,null);
  }
});
test('check-ins and completed/cancelled entries cannot schedule even if model requests alarm',()=>{
  for(const patch of [{kind:'checkin'},{state:'completed'},{state:'cancelled'}]){
    const [e]=normalizeExtraction(extraction([item(patch)]),raw,now());
    assert.equal(e.alert,null);assert.equal(e.alertIntent.type,null);assert.equal(e.planned,null);
  }
});
test('shape, duration limits and invented or missing evidence are rejected',()=>{
  for(const patch of [{durationMinutes:1441},{durationMinutes:2.5},{durationMinutes:'20'},{evidence:['made up']},{durationEvidence:null},{purpose:'Be fit',purposeEvidence:null},{surprise:true}])assert.throws(()=>normalizeExtraction(extraction([item(patch)]),raw,now()));
  assert.throws(()=>normalizeExtraction(extraction([]),raw,now()));
  assert.throws(()=>normalizeExtraction(extraction(undefined,{mood:'Good',energy:null,evidence:[]}),raw,now()));
});
test('request uses only current text, exact model, bounded tokens, schema and disabled reasoning',async()=>{
  let seen;
  const parse=createOpenRouter({apiKey:'test-only-token',fetchImpl:async(url,options)=>{seen={url,...options};return response(extraction());}});
  const result=await parse(raw,{now:now(),mode:'capture',history:['private old record']});
  const body=JSON.parse(seen.body);
  assert.equal(seen.url,ENDPOINT);assert.equal(seen.redirect,'error');
  assert.equal(body.model,MODEL);assert.equal(body.max_tokens,3000);assert.equal(body.reasoning.enabled,false);
  assert.equal(body.response_format.type,'json_object');assert.match(body.messages[0].content,/additionalProperties/);assert.equal(body.provider.require_parameters,true);
  assert.equal(body.messages.length,2);assert.ok(!seen.body.includes('private old record'));assert.ok(!seen.body.includes('test-only-token'));
  assert.equal(result.metadata.status,'accepted');assert.equal(result.metadata.usage.cost,0.0001);
});
test('invalid JSON, truncation, model substitution and provider errors all fail closed',async()=>{
  const patches=[{choices:[{finish_reason:'stop',message:{content:'BANANA'}}]},{choices:[{finish_reason:'length',message:{content:JSON.stringify(extraction())}}]},{model:'deepseek/deepseek-v4-flash'},{error:{message:'test-only-token'}}];
  for(const patch of patches){
    const parse=createOpenRouter({apiKey:'test-only-token',fetchImpl:async()=>response(extraction(),patch)});
    const result=await parse(raw,{now:now()});assert.equal(result.entries,null);assert.ok(!JSON.stringify(result).includes('test-only-token'));
  }
});
test('429 is recorded with retry guidance and never retried or echoed',async()=>{
  let requests=0;
  const parse=createOpenRouter({apiKey:'test-only-token',fetchImpl:async()=>{requests++;return new Response('test-only-token',{status:429,headers:{'retry-after':'60'}});}});
  const result=await parse(raw);
  assert.equal(requests,1);assert.equal(result.entries,null);assert.equal(result.metadata.http,429);assert.equal(result.metadata.retryAfterSeconds,60);assert.ok(!JSON.stringify(result).includes('test-only-token'));
});
test('transport errors are sanitized, timeout is bounded, oversized input makes no request',async()=>{
  const parse=createOpenRouter({apiKey:'test-only-token',timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)))});
  const timer=setTimeout(()=>{},50);
  try{assert.equal((await parse(raw)).metadata.failure,'timeout');}finally{clearTimeout(timer);}
  let called=false;
  const bounded=createOpenRouter({apiKey:'test-only-token',fetchImpl:async()=>{called=true;throw new Error('test-only-token');}});
  assert.equal((await bounded('x'.repeat(12001))).metadata.failure,'input_too_long');assert.equal(called,false);
  assert.equal((await bounded(raw)).metadata.failure,'network_error');
});
test('raw capture is persisted before the model resolves, with no speculative alarm',async()=>{
  let release;const snapshots=[];
  const w=new Workflow(emptyData(),{now,save:d=>snapshots.push(structuredClone(d)),interpreter:async()=>new Promise(r=>{release=r;})});
  const pending=w.sendAsync(raw);
  assert.equal(snapshots.length,1);assert.equal(snapshots[0].entries[0].raw,raw);assert.equal(snapshots[0].entries[0].alert,null);assert.equal(snapshots[0].interactions[0].raw,raw);
  release(await interpreter(extraction())(raw,{now:now()}));await pending;
  assert.equal(w.get().ai.status,'accepted');assert.equal(w.get().revisions[0].snapshot.raw,raw);
});
test('split captures retain full input, purpose, evidence, current feelings and editable selections',async()=>{
  const text=raw+' Read to learn.';
  const data=extraction([item(),item({title:'Read',kind:'checkin',evidence:['Read to learn.'],time:{text:null,evidence:[],uncertain:false,clarification:null},durationMinutes:null,durationEvidence:null,alert:null,purpose:'to learn',purposeEvidence:'to learn'})],{mood:'proud',energy:'Low',evidence:['I feel proud but drained.']});
  const w=new Workflow(emptyData(),{now,interpreter:interpreter(data)});
  await w.sendAsync(text);
  assert.equal(w.data.entries.length,2);assert.ok(w.data.entries.every(e=>e.raw===text&&e.captureId===1));
  assert.equal(w.get(2).mood,'proud');assert.equal(w.get(2).energy,'Low');assert.equal(w.get(2).minutes,null);assert.equal(w.get(2).purpose,'to learn');
  await w.sendAsync('/show 1');await w.sendAsync('/duration 45 minutes');assert.equal(w.get(1).minutes,45);assert.equal(w.get(2).minutes,null);
  assert.equal(w.data.interactions[0].interpretation.entryIds.length,2);
});
test('current feelings in an all-plan capture become a separate check-in',async()=>{
  const w=new Workflow(emptyData(),{now,interpreter:interpreter(extraction(undefined,{mood:'proud',energy:'Low',evidence:['I feel proud but drained.']}))});
  await w.sendAsync(raw);assert.equal(w.data.entries.length,2);assert.equal(w.get(2).kind,'checkin');assert.equal(w.get(2).mood,'proud');assert.equal(w.get(1).mood,null);
});
test('API failure preserves local rules fields and raw interaction without automatically scheduling',async()=>{
  const w=new Workflow(emptyData(),{now,interpreter:createOpenRouter({})});
  const result=await w.sendAsync(raw);
  assert.match(result,/local rules/);assert.equal(w.get().raw,raw);assert.equal(w.get().minutes,20);assert.ok(w.get().planned);assert.equal(w.get().alert,null);assert.equal(w.get().ai.failure,'missing_key');
  await w.sendAsync('/time tomorrow at 12:05am');assert.equal(w.get().alert.type,'alarm');
});
test('commands and optional replies stay local and preserve complete raw interactions',async()=>{
  let requests=0;
  const w=new Workflow(emptyData(),{now,interpreter:async(...args)=>{requests++;return interpreter(extraction())(...args);}});
  await w.sendAsync(raw);await w.sendAsync(String(w.quick.findIndex(a=>a.key==='duration')+1));await w.sendAsync('0');await w.sendAsync('2 minutes');await w.sendAsync('Actually, twenty');await w.sendAsync('yes');
  assert.equal(requests,1);assert.equal(w.get().minutes,20);assert.equal(w.data.interactions.length,6);assert.equal(w.data.interactions[3].raw,'2 minutes');
});
test('material ambiguity accepts a direct answer without another API request or guessed day',async()=>{
  const text='Call Mum Thursday or Friday at seven';
  const data=extraction([item({title:'Call Mum',evidence:[text],time:{text:null,evidence:[text],uncertain:true,clarification:'Which day and AM or PM?'},durationMinutes:null,durationEvidence:null,alert:'reminder'})]);
  const w=new Workflow(emptyData(),{now,interpreter:interpreter(data)});
  await w.sendAsync(text);assert.equal(w.pending.kind,'planned_time');assert.equal(w.get().alert,null);
  assert.match(await w.sendAsync('7pm'),/Include the day/);assert.equal(w.get().planned,null);
  assert.match(await w.sendAsync('Friday at 7'),/AM or PM/);
  await w.sendAsync('Friday at 7pm');assert.equal(w.data.entries.length,1);assert.equal(w.get().planned,'2026-09-11T13:30:00.000Z');assert.equal(w.get().alert.type,'reminder');assert.equal(w.get().raw,text);
});
test('a clock-only clarification retains a known day, and /new can leave a question',async()=>{
  const text='Call Mum tomorrow after lunch';
  const data=extraction([item({title:'Call Mum',evidence:[text],time:{text:'tomorrow',evidence:['tomorrow after lunch'],uncertain:true,clarification:'What time?'},durationMinutes:null,durationEvidence:null,alert:'reminder'})]);
  const w=new Workflow(emptyData(),{now,interpreter:interpreter(data)});
  await w.sendAsync(text);await w.sendAsync('2pm');assert.equal(w.get().plannedDate,'2026-09-10');assert.equal(w.get().planned,'2026-09-10T08:30:00.000Z');
  await w.sendAsync(text);await w.sendAsync('/new '+raw);assert.equal(w.data.entries.length,3);assert.equal(w.get().raw,raw);
});
test('failure to persist prevents the API request; later write failure keeps the original',async()=>{
  let called=false;
  const w=new Workflow(emptyData(),{now,save:()=>{throw new Error('disk full');},interpreter:async()=>{called=true;}});
  await assert.rejects(w.sendAsync(raw));assert.equal(called,false);assert.equal(w.data.entries.length,0);
  let writes=0;
  const later=new Workflow(emptyData(),{now,save:()=>{if(++writes>1)throw new Error('disk full');},interpreter:interpreter(extraction())});
  await assert.rejects(later.sendAsync(raw));assert.equal(later.get().raw,raw);assert.equal(later.get().interpretation.status,'pending');assert.equal(later.get().alert,null);
});
test('private key file is parsed as data and never executed',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rpm-key-test-'));const file=path.join(dir,'key.env');
  try{fs.writeFileSync(file,'OPENROUTER_API_KEY="test-only-token"\nUNRELATED=$(false)\n',{mode:0o600});assert.equal(readApiKey(file,{OPENROUTER_API_KEY:'different-test-key'}),'test-only-token');fs.chmodSync(file,0o644);assert.throws(()=>readApiKey(file,{}),/private/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('piped input and EOF drain in order before releasing the isolated store lock',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rpm-queue-test-'));const file=path.join(dir,'data.json');
  try{
    const result=spawnSync(process.execPath,['cli/rpm.mjs','--ai','--data',file],{cwd:path.resolve(import.meta.dirname,'..'),input:'Walk for 20 minutes\n/duration 45\n/checkin\nRead\n/quit\n',encoding:'utf8',env:{...process.env,OPENROUTER_API_KEY:'',RPM_OPENROUTER_KEY_FILE:''},timeout:5000});
    assert.equal(result.status,0,result.stderr);const saved=load(file);assert.equal(saved.entries.length,2);assert.equal(saved.entries[0].minutes,45);assert.equal(saved.entries[1].kind,'checkin');assert.equal(saved.interactions.length,4);assert.equal(fs.existsSync(file+'.lock'),false);
    fs.mkdirSync(file+'.lock');const blocked=spawnSync(process.execPath,['cli/rpm.mjs','--data',file],{input:'/quit\n',encoding:'utf8'});assert.equal(blocked.status,1);assert.equal(fs.existsSync(file+'.lock'),true);assert.deepEqual(load(file),saved);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
