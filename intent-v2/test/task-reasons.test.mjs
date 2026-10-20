import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTurn} from '../src/interpret.mjs';
import {sourceUnits} from '../src/context.mjs';
import {field,operation,turn} from './helpers.mjs';
const read=(raw,fields=[field('title','Submit form','submit the form')],extra={})=>interpretTurn(turn(raw,[operation(fields)],extra),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});

test('an explicit single-action loss consequence remains its purpose and essential flag',()=>{
 const raw='I have to submit the form today otherwise I lose my seat';
 const parsed=read(raw);
 const fields=parsed.operations[0].fields;
 assert.match(fields.find(f=>f.name==='purpose')?.value??'',/lose my seat/);
 assert.equal(fields.find(f=>f.name==='purpose').evidence,'otherwise I lose my seat');
 assert.equal(fields.find(f=>f.name==='must')?.value,true);
});

test('ordinary need, optional actions, independent clauses and supplied purpose remain authoritative',()=>{
 const normal=read('need to submit the form today');assert.ok(!normal.operations[0].fields.some(f=>f.name==='must'||f.name==='purpose'));
 const explicit=read('I have to submit the form today otherwise I lose my seat, but do not mark it must',[field('title','Submit form','submit the form'),field('must',false,'do not mark it must')]);
 assert.equal(explicit.operations[0].fields.find(f=>f.name==='must').value,false);
 const independent=read('I have to submit the form otherwise I lose my seat and call Raj');
 assert.ok(!independent.operations[0].fields.some(f=>f.name==='purpose'));
 const existing=read('I have to submit the form otherwise I lose my seat',[field('title','Submit form','submit the form'),field('purpose','Keep my seat','lose my seat')]);
 assert.equal(existing.operations[0].fields.filter(f=>f.name==='purpose').length,1);assert.equal(existing.operations[0].fields.find(f=>f.name==='purpose').value,'Keep my seat');
});

test('a Must correction keeps the explicit only-way reason on its resolved Inbox task',()=>{
 const raw='make that a must, its the only way I get the fee waiver',units=sourceUnits(raw);
 const parsed=interpretTurn(turn(raw,[operation([field('must',true,'make that a must')],{kind:'update',targetId:'107'})]),{units,messageId:'m',visibleEntities:[{entity:'task',id:'107',blockId:null}]});
 const f=parsed.operations[0].fields.find(f=>f.name==='purpose');assert.ok(f);assert.match(f.value,/fee waiver/);assert.ok(raw.includes(f.evidence));
});

test('a linked task or a multi-action unit needs model judgement for its reason',()=>{
 const raw='I have to submit the form otherwise I lose my seat';
 const linked=interpretTurn(turn(raw,[operation([field('title','Submit form','submit the form'),field('blockId','b',null,'suggested')])]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[{entity:'block',id:'b'}]});
 assert.ok(!linked.operations[0].fields.some(f=>f.name==='purpose'));
 const multiple=interpretTurn(turn(raw,[operation([field('title','Submit form','submit the form')]),operation([field('title','Keep seat','seat')],{opId:'other'})]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});
 assert.ok(multiple.operations.every(o=>!o.fields.some(f=>f.name==='purpose')));
});
