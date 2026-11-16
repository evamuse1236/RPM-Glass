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
test('a daily task in the hour a spring-forward day skips is back at its own clock the next day, and Done on it works',()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';try{
 const e={...base(),planned:new Date(2027,2,10,2,30).toISOString(),minutes:60};
 const day=occurrences(e,+new Date(2027,2,15),+new Date(2027,2,16)),week=occurrences(e,+new Date(2027,2,13),+new Date(2027,2,18));
 assert.equal(new Date(day[0].start).getHours(),2);
 assert.equal(week.find(r=>new Date(r.start).getDate()===15).occurrence,day[0].occurrence);
 assert.equal(new Date(week.find(r=>new Date(r.start).getDate()===14).start).getHours(),3);
 assert.doesNotThrow(()=>completeTask(e,week.find(r=>new Date(r.start).getDate()===15).occurrence,new Date(2027,2,15,4)));
 }finally{if(previous)process.env.TZ=previous;else delete process.env.TZ;}
});
test('every case in fixtures/repeat-cases.json gives the planner the same occurrences and next alert as the notch and the phone alerts',async()=>{
 const {readFile}=await import('node:fs/promises');
 const cases=JSON.parse(await readFile(new URL('../fixtures/repeat-cases.json',import.meta.url),'utf8'));assert.ok(cases.length>0);
 const previous=process.env.TZ;try{for(const c of cases){process.env.TZ=c.timezone;
  const [y,m,d]=c.day.split('-').map(Number),from=+new Date(y,m-1,d),to=+new Date(y,m-1,d+1),now=Date.parse(c.now),e={id:1,title:c.id,kind:'plan',...structuredClone(c.task)};
  assert.deepEqual(occurrences(e,from,to).map(r=>r.occurrence),c.expected.keys,`${c.id} keys`);
  const next=occurrences(e,now,now+370*86400000).find(r=>r.start>now);
  assert.equal(next&&new Date(next.start).toISOString(),c.expected.nextAlert,`${c.id} next alert`);
 }}finally{if(previous)process.env.TZ=previous;else delete process.env.TZ;}
});
