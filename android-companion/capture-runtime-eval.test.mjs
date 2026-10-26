import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {targetModules,runCase} from '../scripts/capture-stress/runtime.mjs';
import {loadCorpus} from '../scripts/capture-stress/run.mjs';

const modules=await targetModules(process.cwd()),{cases}=await loadCorpus();
for(const id of ['adv-ref-both-calls-hour','adv-multi-time-then-day','adv-rel-weekend-fridge','everyday-kal-gym','hinglish-baad-mein','everyday-done-laundry'])test(`retained live eval saves the supported time without a question: ${id}`,async()=>{
 const f=JSON.parse(await readFile(new URL(`../intent-v2/test/fixtures/runtime-haiku/${id}.json`,import.meta.url),'utf8'));
 const directory=await mkdtemp(path.join(tmpdir(),'rpm-capture-eval-')),attempts={};
 try{
  const result=await runCase(cases.find(c=>c.id===id),{modules,directory,modelOverride:async input=>{
   const index=Number(input.messageId.split('-').at(-1))-1,attempt=attempts[index]??0;attempts[index]=attempt+1;
   return {output:structuredClone(f.outputs[index][attempt]??f.outputs[index].at(-1))};
  }});
  assert.deepEqual(result.failures,[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
