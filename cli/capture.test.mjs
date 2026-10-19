import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createCaptureSession,nodeModelBridge,privateTrace} from './capture-session.mjs';
import {captureOptions,renderCapture,renderAnswer,renderState} from './capture.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {nativeModelTransport} from '../intent-v2/adapters/transport.mjs';
import {HAIKU_MODEL} from '../intent-v2/src/model-policy.mjs';

const NOW='2026-10-19T04:30:00Z';
async function fixture(t,options={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'rpm-capture-cli-')),file=path.join(dir,'day.json');
 const s=await createCaptureSession({file,now:NOW,...options});
 t.after(async()=>{await s.close();await rm(dir,{recursive:true,force:true});});return {...s,file};
}
test('CLI uses canonical autoapply and Undo, persists exact words and refuses a second owner',async t=>{
 const raw='  Add test the Capture CLI  ';
 let s;s=await fixture(t,{model:async()=>{assert.equal(Object.values((await s.backend.load()).intentV2.captures).at(-1).raw,raw);return turn(raw,[operation([field('title','test the Capture CLI','test the Capture CLI')])]);}});
 const before=(await s.backend.load()).entries.length,observation=await s.send(raw);
 assert.equal(observation.result.applied.status,'applied');
 assert.equal((await s.backend.load()).entries.length,before+1);
 assert.match(renderCapture(observation).text,/Undo: \/undo/);
 await assert.rejects(createCaptureSession({file:s.file}),/already open/);
 await s.undo();assert.equal((await s.backend.load()).entries.length,before);
 assert.equal(Object.values((await s.backend.load()).intentV2.captures).at(-1).raw,raw);
 await s.reset();assert.equal(Object.keys((await s.backend.load()).intentV2.captures).length,1);
});
test('without a key CLI still durably saves the original words and prints AI off',async t=>{
 const s=await fixture(t,{env:{}}),raw='  set a reminder in 5  ';
 const result=await s.send(raw);
 assert.equal(result.card.raw,raw);assert.equal(result.card.status,'captured');
 assert.match(renderCapture(result,s).text,/AI is off/);
 assert.equal(Object.values(JSON.parse(await readFile(s.file,'utf8')).intentV2.captures).at(-1).raw,raw);
 const trace=privateTrace(s.traces.list()[0]);assert.ok(!JSON.stringify(trace).includes(raw));assert.ok(!Object.hasOwn(trace,'words'));
});
test('Node bridge preserves production Anthropic first and OpenRouter fallback contracts',async()=>{
 const calls=[],bridge=nodeModelBridge({env:{ANTHROPIC_API_KEY:'test-key',OPENROUTER_API_KEY:'fallback-key'},fetchImpl:async(url,options)=>{calls.push({url,options});return {status:503,ok:false};}});
 assert.deepEqual(await bridge('model',{requestId:'a',service:'anthropic',body:{a:1}}),{status:503,body:null});
 assert.equal(calls[0].options.headers['x-api-key'],'test-key');assert.equal(calls[0].options.redirect,'error');
 assert.deepEqual(await nodeModelBridge({env:{}})('model',{requestId:'a',service:'anthropic',body:{}}),{missingKey:true});
});
test('word-free trace drops raw words, model replies, field values and error messages',()=>{
 const secret='private words';const result=JSON.stringify(privateTrace({id:'m',words:secret,interpreted:{reply:secret},models:[{model:'haiku',input:{hash:'abc'}}],applied:{status:'applied',changes:[{title:secret}]},errors:[{stage:'interpret',code:'FAILED',message:secret}]}));
 assert.ok(!result.includes(secret));assert.match(result,/abc/);
});
test('flags keep the default local store and accept an explicit clock',()=>{
 assert.match(captureOptions([]).file,/\.verify/);
 assert.deepEqual(captureOptions(['--store','my.json','--now',NOW]),{file:'my.json',now:NOW});
 assert.throws(()=>captureOptions(['--unknown']),/--store/);
});
test('a store whose owner exited reopens without manual lock deletion',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'rpm-capture-owner-')),file=path.join(dir,'day.json');
 const pid=Number(execFileSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'}));
 await writeFile(file+'.lock',JSON.stringify({pid}));
 const s=await createCaptureSession({file,now:NOW,env:{}});
 t.after(async()=>{await s.close();await rm(dir,{recursive:true,force:true});});
 assert.equal((await s.backend.load()).entries.length,6);
});
test('agenda and state output read saved facts using the fixed CLI clock',async t=>{
 const s=await fixture(t,{env:{}}),data=await s.backend.load();
 const lines=renderAnswer({kind:'agenda',day:null},{data,events:s.events,now:new Date(NOW)}).join('\n');
 assert.match(lines,/Call Raj/);assert.ok(!lines.includes('Dentist appointment'));
 assert.match(renderState(data,{now:new Date(NOW)}),/Submit workbook.*alarm/);
});
test('the real production transport uses the Node bridge for an Anthropic failure and one OpenRouter fallback',async()=>{
 const endpoints=[],native=nodeModelBridge({env:{ANTHROPIC_API_KEY:'test-key',OPENROUTER_API_KEY:'test-fallback'},fetchImpl:async(url,options)=>{
  endpoints.push(url);if(endpoints.length===1)return {status:503,ok:false};
  const body=JSON.parse(options.body);
  return {status:200,ok:true,json:async()=>({model:body.model,provider:'Anthropic',choices:[{finish_reason:'stop',message:{content:JSON.stringify(turn())}}]})};
 }});
 const model=nativeModelTransport({native,model:HAIKU_MODEL,prompt:'test',providerNames:['Anthropic']});
 const run={};await model({},{run});assert.equal(endpoints.length,2);assert.equal(run.service,'openrouter');assert.equal(run.serviceFallback,'anthropic 503');
 assert.ok(!JSON.stringify(run).includes('test-key'));
});
