import test from 'node:test';
import assert from 'node:assert/strict';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';

test('snapshot receipt dates stay identical when a saved revision is uploaded on another day', t => {
  const now=new Date('2026-10-19T12:00:00+05:30');
  const data=seedStore(now).data, task=data.entries.find(row=>row.planned||row.plannedDate);
  data.syncSavedAt=now.toISOString();
  data.intentV2={drafts:{d:{id:'d',status:'committed',receipt:{changes:[{type:'create',collection:'tasks',id:task.id}]}}},captures:{c:{messageId:'c',raw:'Exact words',at:now.toISOString(),status:'interpreted',draftId:'d'}}};
  t.mock.timers.enable({apis:['Date'],now:+now});
  const first=buildSnapshot(data);
  assert.ok(first.captures[0].receipt[0].text);
  t.mock.timers.tick(2*24*60*60*1000);
  assert.deepEqual(buildSnapshot(data),first);
});

test('years of logged glasses, meals and routine runs still give the website a valid snapshot of the newest 10000 each', () => {
  const data=seedStore(new Date('2026-10-19T12:00:00+05:30')).data, body=data.planner.body, routineId=body.routines[0].id;
  const iso=i=>new Date(Date.UTC(2000,0,1)+i*3600e3).toISOString(), day=i=>new Date(Date.UTC(1990,0,1)+i*864e5).toISOString().slice(0,10);
  // The oldest of each is stored last, as a back-dated log would be.
  body.water.glasses=[...Array.from({length:10000},(_,i)=>iso(i+1)),iso(0)];
  body.meals=[...Array.from({length:10000},(_,i)=>({id:`m${i+1}`,name:'Poha',slot:'breakfast',at:iso(i+1)})),{id:'m0',name:'Poha',slot:'breakfast',at:iso(0)}];
  body.runs=[...Array.from({length:10000},(_,i)=>({routineId,day:day(i+1),marks:{},skippedDay:false})),{routineId,day:day(0),marks:{},skippedDay:false}];
  const snapshot=buildSnapshot(data);
  for (const b of [snapshot.body, snapshot.planner.body]) {
    assert.equal(b.water.glasses.length,10000); assert.ok(!b.water.glasses.includes(iso(0))); assert.ok(b.water.glasses.includes(iso(10000)));
    assert.equal(b.meals.length,10000); assert.ok(!b.meals.some(m=>m.id==='m0')); assert.ok(b.meals.some(m=>m.id==='m10000'));
    assert.equal(b.runs.length,10000); assert.ok(!b.runs.some(r=>r.day===day(0))); assert.ok(b.runs.some(r=>r.day===day(10000)));
  }
  assert.equal(body.water.glasses.length,10001,'the store itself keeps every glass');
});

test('two glasses logged at the same instant across the 10000 cutoff still give a valid snapshot of exactly 10000', () => {
  const data=seedStore(new Date('2026-10-19T12:00:00+05:30')).data, body=data.planner.body;
  const iso=i=>new Date(Date.UTC(2000,0,1)+i*3600e3).toISOString();
  // "2 glasses" logs the same instant twice; the cutoff falls between the two copies.
  body.water.glasses=[iso(0),iso(0),...Array.from({length:9999},(_,i)=>iso(i+1))];
  const snapshot=buildSnapshot(data);
  for (const b of [snapshot.body, snapshot.planner.body]) {
    assert.equal(b.water.glasses.length,10000);
    assert.equal(b.water.glasses.filter(at=>at===iso(0)).length,1);
    assert.ok(b.water.glasses.includes(iso(9999)));
  }
});
