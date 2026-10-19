import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCase,targetModules} from './runtime.mjs';
import {checkExpectation,visibleQuestions,checkExecution} from './checks.mjs';
import {loadCorpus} from './run.mjs';
import {TURN_SCHEMA,validate} from '../../intent-v2/src/schema.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const expect={created:[],forbidden:[],changes:[],unchanged:[101,102,103,104,105,106],maxNew:0,question:'allowed'};
const answer=input=>({schemaVersion:1,mode:'reflect',draftMode:'none',reply:'No change yet.',decisions:input.sourceUnits.map(u=>({sourceId:u.id,disposition:'reflection',note:u.text})),operations:[],question:null,clarification:null,memoryCandidates:[],card:null});

test('stress input preserves an Edit focus across typed turns like Capture does',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-stress-focus-'));
 try{
  const seen=[];
  const result=await runCase({id:'focus-stays',tags:[],turns:[{text:'Keep thinking',focus:'dinner',deferApply:true},{text:'Tell me about this draft',deferApply:true}],expect},{modules:await targetModules(repo),directory,modelOverride:async input=>{seen.push(input);return {output:answer(input),record:{}};}});
  assert.equal(seen[1].activeDraft?.id,'draft-dinner');
  assert.equal(result.turns[1].capture.focus.explicit,true);
  assert.deepEqual(result.failures,[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('a missing focused draft is a failure, never evidence that a proposal was removed',()=>{
 const failures=checkExpectation({...expect,unchanged:[],focusRemoved:['dinner1']},{before:{entries:[]},after:{entries:[]},focusDraft:null});
 assert.ok(failures.some(f=>f.type==='focus lost'));
});

test('structured choice questions count as visible and may be re-asked after an unresolved answer',()=>{
 const turn={text:'unclear',capture:{raw:'unclear',clarification:{prompt:'Which proposal?'}},calls:[]};
 assert.deepEqual(visibleQuestions(turn),['which proposal?']);
 assert.deepEqual(checkExecution([turn,turn],{validate,schema:TURN_SCHEMA}),[]);
 assert.ok(checkExpectation({...expect,unchanged:[],question:'forbidden'},{before:{entries:[]},after:{entries:[]},questions:visibleQuestions(turn)}).some(f=>f.type==='repeated question'));
});

test('the three dinner corpus cases drive real removal, pending survivors and saved-word retention with a fake model',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-stress-dinner-'));
 const {cases}=await loadCorpus(),modules=await targetModules(repo);
 const ids=['dinner-exact-four-turns','focused-delete-both','focused-delete-first'];
 const modelOverride=async input=>{
  const raw=input.sourceUnits.map(u=>u.text).join(' '),proposals=input.context.entities.filter(e=>e.entity==='proposal');
  let output=answer(input);
  if(raw==='Delete this'||raw==='That one only')output={...output,mode:'capture',clarification:{prompt:'Which dinner proposal should I remove?',action:'remove',choices:proposals.map(p=>({label:p.title,targets:[{entity:'proposal',id:p.id}]}))}};
  else if(raw.startsWith('Delete both')||raw.startsWith('Remove only'))output={...output,mode:'capture',draftMode:'amend',decisions:input.sourceUnits.map(u=>({sourceId:u.id,disposition:'action',note:null})),operations:input.activeDraft.operations.filter(o=>raw.startsWith('Delete both')||o.opId==='dinner1').map(o=>({opId:o.opId,sourceId:'s0',kind:'discard',entity:o.entity,targetId:o.targetId,fields:[]}))};
  return {output,record:{}};
 };
 try{
  for(const id of ids){
   const result=await runCase(cases.find(c=>c.id===id),{modules,directory:path.join(directory,id),modelOverride});
   assert.deepEqual(result.failures,[],id);
   assert.equal(result.saved.newTasks.length,0,id);
   if(id==='focused-delete-first')assert.deepEqual(result.turns[0].focusDraft.operations.map(o=>o.opId),['dinner2']);
   if(id==='dinner-exact-four-turns')assert.equal(result.turns[2].calls.length,0,'Both answers the current question without a model call');
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
