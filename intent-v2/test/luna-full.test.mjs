import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,configurations,requestFor,assess,summarize} from '../evals/luna-full.mjs';
import {field,operation,turn} from './helpers.mjs';
process.env.TZ='Asia/Kolkata';
const response=answer=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]});
test('full comparison covers all cases and changes only the reasoning level',()=>{
 assert.equal(cases.length,73);assert.equal(new Set(cases.map(c=>c.id)).size,73);
 for(const c of cases){const bodies=configurations.map(config=>{const {reasoning,...body}=requestFor(c,config);assert.equal(reasoning.effort,config.effort);return body;});assert.deepEqual(bodies[0],bodies[1]);}
});
test('full evaluation rejects a semantically wrong action despite a passing coarse contract',async()=>{
 const c=cases.find(c=>c.id==='capture-01'),answer=turn(c.text,[operation([field('title','Buy water','Buy milk')])]);
 const judged=await assess(c,response(answer));assert.deepEqual(judged.contractFailures,[]);assert.ok(judged.semanticFailures.includes('Lost requested task content: milk'));
});
test('full evaluation checks actual local scheduling, not only existence of time fields',async()=>{
 const c=cases.find(c=>c.id==='time-01'),make=time=>turn(c.text,[operation([field('title','Walk','walk'),field('time',time,'tomorrow at 7 am'),field('minutes',20,'20 minutes')])]);
 assert.deepEqual((await assess(c,response(make('tomorrow at 7 am')))).failures,[]);
 const bad=await assess(c,response(make('tomorrow at 8 am')));assert.deepEqual(bad.contractFailures,[]);assert.ok(bad.semanticFailures.length);
});
test('full summary separates correctness, deadline and unknown billed cost',()=>{
 const rows=[{effort:'none',caseId:'time-01',suite:'original',ms:13000,cost:null,passed:true,contractPassed:true}];
 const result=summarize(rows)[0];assert.equal(result.passed,1);assert.equal(result.capturePassedWithin12s,0);assert.equal(result.over12s,1);assert.equal(result.costPerCorrect,null);assert.equal(result.costKnown,0);
});
