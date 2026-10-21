// Eligibility and backend latency only. The sentinel never interprets a thought.
// A row counts as local only if no sentinel call occurred and all case checks pass.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadCorpus} from './run.mjs';
import {targetModules,runCase} from './runtime.mjs';

const directory=path.resolve(process.argv[2]??'.verify/capture-stress/local-coverage');
const {cases,hash}=await loadCorpus(),modules=await targetModules(process.cwd());
const selected=cases.filter(c=>c.turns.length===1&&(c.tags.includes('everyday')||c.id.startsWith('adv-')));
await mkdir(directory,{recursive:true});
const results=[];
for(const test of selected){
 const result=await runCase(test,{modules,directory:path.join(directory,test.id),modelOverride:async input=>({output:{schemaVersion:1,mode:'query',draftMode:'none',reply:'Sentinel: not a local interpretation.',
  decisions:input.sourceUnits.map(u=>({sourceId:u.id,disposition:'question',note:null})),operations:[],question:null,clarification:null,memoryCandidates:[],card:null},record:{}})});
 results.push({id:test.id,group:test.id.startsWith('adv-')?'adversary':'everyday',local:result.turns.every(t=>!t.calls.length),pass:result.pass,ms:result.turns[0].ms,kind:result.turns[0].capture?.localInterpretation??(result.turns[0].capture?.answeredLocally?'query':null)});
}
const summary={};
for(const group of ['everyday','adversary','all']){
 const rows=results.filter(r=>group==='all'||r.group===group),local=rows.filter(r=>r.local&&r.pass),times=local.map(r=>r.ms).sort((a,b)=>a-b);
 summary[group]={total:rows.length,local:local.length,percent:100*local.length/rows.length,p50:times[Math.max(0,Math.ceil(times.length*.5)-1)]??null,p90:times[Math.max(0,Math.ceil(times.length*.9)-1)]??null,ids:local.map(r=>r.id),unsafeLocal:rows.filter(r=>r.local&&!r.pass).map(r=>r.id)};
}
await writeFile(path.join(directory,'coverage.json'),JSON.stringify({corpusHash:hash,method:'Production Capture with a non-interpreting sentinel. Only zero-call, checker-passing captures count as local. In-process backend time, not phone latency.',summary,results},null,2));
console.log(JSON.stringify(summary,null,2));
