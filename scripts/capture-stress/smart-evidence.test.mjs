import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {targetModules,runCase} from './runtime.mjs';

test('the original ten API outputs now survive the real Capture pipeline and corpus checks',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-smart-replay-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const here=path.dirname(fileURLToPath(import.meta.url)),modules=await targetModules(path.resolve(here,'../..'));
 const cases=JSON.parse(await readFile(path.join(here,'corpus/smart.json'),'utf8'));
 for(const c of cases.filter(c=>!c.tags.includes('round2'))){
  const evidence=JSON.parse(await readFile(path.join(here,'smart-evidence',c.id+'.json'),'utf8'));
  assert.equal(evidence.before.turns[0].words,c.turns[0].text);
  const trace=JSON.stringify(evidence.before.turns[0].trace);
  assert.ok(!trace.includes(c.turns[0].text));
  const result=await runCase(c,{modules,directory:path.join(directory,c.id),modelOverride:async()=>({output:evidence.before.turns[0].modelCalls[0].output})});
  assert.deepEqual(result.failures,[],c.id);
 }
});
