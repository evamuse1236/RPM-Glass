import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {targetModules,runCase} from './runtime.mjs';
import {evaluateCase} from './evaluate.mjs';

test('round 3 local cases use the measured clock, exact titles and no overlap warning',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-round3-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const here=path.dirname(fileURLToPath(import.meta.url)),modules=await targetModules(path.resolve(here,'../..'));
 const cases=JSON.parse(await readFile(path.join(here,'corpus/round3.json'),'utf8'));
 const ids=['wake-after','wake-before','title-mom','title-meds','title-iphone','title-name','moment-reminder','moment-alarm'].map(id=>'round3-'+id);
 for(const c of cases.filter(c=>ids.includes(c.id))){
  const result=await runCase(c,{modules,directory:path.join(directory,c.id),modelOverride:async()=>assert.fail('This command must be read locally')});
  assert.deepEqual(result.failures,[],c.id);
  assert.equal(result.turns[0].capture.at,new Date(c.now).toISOString());
 }
});

test('noOverlap rejects a warning even after the reminder was saved',()=>{
 const before={entries:[],planner:{}},after={...before,intentV2:{captures:{m1:{raw:'set a reminder in 5'}}}};
 const observation={text:'set a reminder in 5',capture:{messageId:'m1',raw:'set a reminder in 5'},draft:{status:'committed',applied:{warning:'Reminder overlaps Submit workbook. Save anyway, or choose another time?'}},result:{},calls:[]};
 const result=evaluateCase({turns:[{text:observation.text}],expect:{created:[],changes:[],maxNew:0,noOverlap:true}},{before,after,turns:[observation],states:[after]});
 assert.equal(result.filter(f=>f.type==='false overlap').length,1);
});
