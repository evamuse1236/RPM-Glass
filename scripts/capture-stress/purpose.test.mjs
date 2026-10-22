import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {targetModules,runCase} from './runtime.mjs';
import {loadCorpus} from './run.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const historicalOutput={schemaVersion:1,mode:'capture',draftMode:'new',
 reply:'Kal subah ke liye mark kar diya. Courier wale ko call karke parcel ka issue close kar dena.',
 decisions:['s0','s1','s2'].map(sourceId=>({sourceId,disposition:'action',note:null})),
 operations:[
  {opId:'op1',sourceId:'s0',kind:'create',entity:'task',targetId:null,fields:[
   {name:'title',op:'set',value:'Phone the courier about the parcel',origin:'suggested',evidence:null},
   {name:'time',op:'set',value:'kal subah 8 baje',origin:'stated',evidence:'kal subah 8 baje'}]},
  {opId:'op2',sourceId:'s2',kind:'create',entity:'task',targetId:null,fields:[
   {name:'title',op:'set',value:'Close the parcel issue with the courier',origin:'suggested',evidence:null},
   {name:'time',op:'set',value:'kal subah',origin:'stated',evidence:'kal subah'}]},
 ],question:null,clarification:null,memoryCandidates:[],card:null};
const fixtureModel=output=>async()=>({output:structuredClone(output),record:{}});

test('fixture-only purpose controls exercise the backend and checker, not model interpretation',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-stress-purpose-'));
 const modules=await targetModules(repo),{cases}=await loadCorpus();
 const incident=cases.find(c=>c.id==='hinglish-kal-subah');
 assert.ok(incident);
 try{
  await t.test('the historical translated titles with null evidence expose an invented extra task',async()=>{
   const result=await runCase(incident,{modules,directory:path.join(directory,'historical'),modelOverride:fixtureModel(historicalOutput)});
   assert.equal(result.pass,false);
   assert.ok(result.failures.some(f=>f.type==='invented item'&&f.detail==='2 new items exceeds 1'));
   assert.ok(result.failures.every(f=>f.type==='invented item'),JSON.stringify(result.failures));
   assert.deepEqual(result.saved.newTasks.map(e=>e.title),historicalOutput.operations.map(o=>o.fields[0].value));
   assert.ok(result.saved.newTasks.every(e=>!e.purpose));
   assert.deepEqual(result.turns[0].calls[0].output,historicalOutput);
  });
  await t.test('one translated task preserves the stated purpose, tomorrow time and exact raw words',async()=>{
   const output=structuredClone(historicalOutput),purpose='Parcel ka issue close karna hai bas.';
   output.operations.splice(1);
   output.operations[0].fields.push({name:'purpose',op:'set',value:purpose,origin:'stated',evidence:purpose});
   const expected=structuredClone(incident);
   expected.expect.created[0].purposeWords=['Parcel','issue','close'];
   const result=await runCase(expected,{modules,directory:path.join(directory,'purpose'),modelOverride:fixtureModel(output)});
   assert.deepEqual(result.failures,[]);
   assert.equal(result.saved.newTasks.length,1);
   const persisted=JSON.parse(await readFile(result.artifacts.final,'utf8'));
   const saved=persisted.entries.find(e=>e.id===result.saved.newTasks[0].id);
   assert.equal(saved.title,'Phone the courier about the parcel');
   assert.equal(saved.purpose,purpose);
   assert.equal(saved.planned,'2026-10-20T02:30:00.000Z');
   assert.equal(saved.raw,incident.turns[0].text);
   const fields=result.turns[0].draft.operations[0].fields;
   assert.equal(fields.find(f=>f.name==='title').evidence,null);
   assert.equal(fields.find(f=>f.name==='purpose').evidenceSourceId,'s2');
  });
  await t.test('two independently requested actions retain their translated titles with null evidence',async()=>{
   const text='Courier wale ko phone karna hai. Phir refund claim file karna hai.';
   const output={...structuredClone(historicalOutput),reply:'',decisions:['s0','s1'].map(sourceId=>({sourceId,disposition:'action',note:null})),
    operations:[['s0','Phone the courier'],['s1','File the refund claim']].map(([sourceId,title],i)=>({
     opId:`op${i+1}`,sourceId,kind:'create',entity:'task',targetId:null,
     fields:[{name:'title',op:'set',value:title,origin:'suggested',evidence:null}],
    }))};
   const independent={id:'independent-courier-refund',tags:[],turns:[{text}],expect:{
    created:[{words:['courier'],entity:'task'},{words:['refund'],entity:'task'}],forbidden:[],maxNew:2,question:'forbidden',changes:[],unchanged:[],
   }};
   const result=await runCase(independent,{modules,directory:path.join(directory,'independent'),modelOverride:fixtureModel(output)});
   assert.deepEqual(result.failures,[]);
   assert.deepEqual(result.saved.newTasks.map(e=>e.title),['Phone the courier','File the refund claim']);
   assert.ok(result.saved.newTasks.every(e=>e.raw===text&&!e.purpose));
  });
 }finally{await rm(directory,{recursive:true,force:true});}
});
