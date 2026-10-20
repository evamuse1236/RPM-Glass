import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTurn} from '../src/interpret.mjs';
import {sourceUnits} from '../src/context.mjs';
import {field,operation,turn} from './helpers.mjs';
const raw='Get the trip sorted because the cohort needs it, book tickets and book tickets';
const create=(opId,entity,title,extra=[])=>operation([field('title',title,raw),...extra],{opId,entity});
const read=ops=>interpretTurn(turn(raw,ops),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});

test('duplicate Blocks and tasks collapse and child references follow the kept parent',()=>{
 const ops=[create('b1','block','Trip sorted'),create('b2','block','trip sorted'),
  create('t1','task','Book tickets',[field('blockId','$b1',null,'suggested')]),
  create('t2','task','book tickets',[field('blockId','$b2',null,'suggested')])];
 const result=read(ops);
 assert.equal(result.operations.length,2);
 assert.equal(result.operations[1].fields.find(f=>f.name==='blockId').value,'$b1');
});

test('same words with different dates, parents, or details remain separate',()=>{
 for(const [a,b] of [[field('time','tomorrow',raw),field('time','Friday',raw)],
  [field('purpose','For me',raw),field('purpose','For Amma',raw)]]){
  assert.equal(read([create('a','task','Book tickets',[a]),create('b','task','Book tickets',[b])]).operations.length,2);
 }
 assert.equal(read([create('b1','block','Work'),create('b2','block','Home'),
  create('t1','task','Call',[field('blockId','$b1',null,'suggested')]),create('t2','task','Call',[field('blockId','$b2',null,'suggested')])]).operations.length,4);
});
