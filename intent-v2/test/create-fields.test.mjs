import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,turn,operation,field,seed,captured,actionFor} from './helpers.mjs';

test('an unknown create field is omitted, recorded as missing and never converted to clear',async()=>{
 const raw='Plan the lesson at 7',s=setup(async()=>turn(raw,[operation([field('title','Plan the lesson'),field('time',null,null,'stated','unknown')])]));
 const {draft}=await captured(s,raw);assert.equal(draft.question,null);
 const result=await s.harness.act(actionFor(draft),{actionId:'a1'});assert.equal(result.status,'committed');
 const data=await s.repository.load();assert.ok(!Object.hasOwn(data.entries[0],'time'));
 assert.deepEqual(data.intentV2.drafts[draft.id].missing,[{opId:'task1',field:'time'}]);
});

test('unknown fields on saved-item changes still block without clearing saved values',async()=>{
 const initial=seed();initial.entries=[{id:1,kind:'plan',title:'Read',time:'tomorrow'}];
 const raw='Change Read time',s=setup(async()=>turn(raw,[operation([field('time',null,null,'stated','unknown')],{kind:'update',targetId:'1'})]),{seed:initial});
 const {draft}=await captured(s,raw);assert.equal(draft.question.field,'time');
 await assert.rejects(s.harness.act(actionFor(draft),{actionId:'blocked'}),/unresolved/);
 assert.equal((await s.repository.load()).entries[0].time,'tomorrow');assert.equal(s.adapter.calls,0);
});
