import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,configurations,requestFor,assess} from '../evals/luna-sample.mjs';
import {field,operation,turn} from './helpers.mjs';
process.env.TZ='Asia/Kolkata';
const response=answer=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]});
test('matched Luna sample changes only model and reasoning across configurations',()=>{
 for(const c of cases){const bodies=configurations.map(config=>{const {model,reasoning,...body}=requestFor(c,config);assert.equal(model,config.model);assert.equal(reasoning.effort,config.effort);assert.equal(reasoning.exclude,true);return body;});for(const body of bodies.slice(1))assert.deepEqual(body,bodies[0]);}
});
test('sample range grading rejects a dropped endpoint despite valid JSON',async()=>{
 const c=cases.find(c=>c.id==='range'),make=time=>response(turn(c.text,[operation([field('title','Finish one WID assessment','Finish one WID assessment'),field('time',time,'tomorrow from 2 pm to 3 pm')])]));
 assert.deepEqual((await assess(c,make('tomorrow from 2 pm to 3 pm'))).failures,[]);assert.ok((await assess(c,make('tomorrow at 2pm'))).failures.length);
});
test('sample ambiguity grading rejects a fabricated AM/PM choice',async()=>{
 const c=cases.find(c=>c.id==='ambiguous'),make=time=>response(turn(c.text,[operation([field('title','Read','Read'),field('time',time,'tomorrow from 2 to 3')])]));
 assert.deepEqual((await assess(c,make('tomorrow from 2 to 3'))).failures,[]);assert.ok((await assess(c,make('tomorrow 2pm-3pm'))).failures.length);
});

test('a well-formed empty tool transaction fails the requested action without grader errors',async()=>{
 const c=cases.find(c=>c.id==='tool'),body={choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'change_planner',arguments:JSON.stringify({operations:[],continuation:false,question:null,choices:[]})}}]}}]};assert.ok((await assess(c,body)).failures.includes('Wrong tool operation'));
});
