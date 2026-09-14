import test from 'node:test';
import assert from 'node:assert/strict';
import {occurrences,completeTask} from './planner-recurrence.mjs';
import {editPlan,conflicts,alternatives} from './planner-state.mjs';
const base=()=>({id:1,title:'Read',kind:'plan',planned:new Date(2026,8,12,9).toISOString(),minutes:30,recurrence:'daily',revisions:[]});
test('daily, weekly and weekday occurrences stay anchored and bounded',()=>{
 const e=base(),a=+new Date(2026,8,14),b=a+86400000;
 assert.equal(occurrences(e,a,b).length,1);e.recurrence='weekly';assert.equal(occurrences(e,a,b).length,0);
 e.recurrence='weekdays';assert.equal(occurrences(e,+new Date(2026,8,12),+new Date(2026,8,13)).length,0);
 assert.equal(occurrences(e,a,b)[0].start,+new Date(2026,8,14,9));
});
test('completing fixed occurrence keeps future tasks and alarm series active',()=>{
 const e=base();completeTask(e,e.planned,new Date(2026,8,12,10));assert.equal(e.done,false);
 assert.equal(occurrences(e,+new Date(2026,8,12),+new Date(2026,8,13)).length,0);
 assert.equal(occurrences(e,+new Date(2026,8,13),+new Date(2026,8,14)).length,1);
 assert.throws(()=>completeTask(e,e.planned));
});
test('after completion moves next date relative to completion and keeps preferred clock',()=>{
 const e={...base(),recurrence:null,repeatAfterDays:3};completeTask(e,e.planned,new Date(2026,8,15,20));
 assert.equal(e.planned,new Date(2026,8,18,9).toISOString());assert.equal(e.completions.length,1);assert.equal(e.done,false);
});
test('planner completion is undoable and invalid repeat changes are atomic',()=>{
 const d={entries:[base()]};editPlan(d,{type:'saveTask',id:1,fields:{done:true},occurrence:d.entries[0].planned});
 assert.equal(d.entries[0].completedOccurrences.length,1);editPlan(d,{type:'undo'});assert.equal(d.entries[0].completedOccurrences,undefined);
 const before=structuredClone(d);assert.throws(()=>editPlan(d,{type:'saveTask',id:1,fields:{repeatAfterDays:2}}));assert.deepEqual(d,before);
});
test('future recurring occurrences conflict; evening alternatives do not cross 11pm',()=>{
 assert.equal(conflicts({entries:[base()]},new Date(2026,8,20,9),30).length,1);
 for(const s of alternatives({entries:[]},new Date(2026,8,12,21),180)){const d=new Date(s);assert.ok(d.getHours()<=20&&d.getHours()>=6);}
});
test('recurrence retains local clock across DST',()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';try{
 const e={...base(),planned:new Date(2026,2,6,9).toISOString(),recurrence:'weekdays'};
 const rows=occurrences(e,+new Date(2026,2,9),+new Date(2026,2,10));assert.equal(new Date(rows[0].start).getHours(),9);
 }finally{if(previous)process.env.TZ=previous;else delete process.env.TZ;}
});
