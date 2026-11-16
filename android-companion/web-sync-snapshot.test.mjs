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

test('years of guessed meals give the website a valid snapshot that keeps the guesses of the 10000 meals it keeps', () => {
  const data=seedStore(new Date('2026-10-19T12:00:00+05:30')).data, body=data.planner.body;
  const iso=i=>new Date(Date.UTC(2000,0,1)+i*3600e3).toISOString();
  body.meals=[...Array.from({length:10000},(_,i)=>({id:`m${i+1}`,name:'Poha',slot:'breakfast',at:iso(i+1)})),{id:'m0',name:'Poha',slot:'breakfast',at:iso(0)}];
  body.mealGuesses=Object.fromEntries(body.meals.map(m=>[m.id,{status:'ready',by:'Jev',at:m.at,kcal:250,protein:6}]));
  const guesses=buildSnapshot(data).planner.body.mealGuesses;
  assert.equal(Object.keys(guesses).length,10000); assert.ok(!guesses.m0); assert.equal(guesses.m10000.kcal,250);
  assert.equal(Object.keys(body.mealGuesses).length,10001,'the store itself keeps every guess');
});

test('years of captures give the website a valid snapshot of the newest 10000 drafts, keeping the drafts its captures show', () => {
  const data=seedStore(new Date('2026-10-19T12:00:00+05:30')).data, state=data.intentV2??={};
  const iso=i=>new Date(Date.UTC(2000,0,1)+i*3600e3).toISOString();
  // The oldest draft is stored last; the newest capture points at it, so it stays.
  const ids=[...Array.from({length:10000},(_,i)=>i+2),0,1];
  state.drafts={...state.drafts}; state.captures={...state.captures};
  for (const i of ids) state.drafts[`d${i}`]={id:`d${i}`,status:'committed',title:`Draft ${i}`,created:iso(i),updated:iso(i)};
  state.captures.newest={messageId:'newest',raw:'call mum',status:'committed',at:iso(20000),draftId:'d0'};
  const before=Object.keys(state.drafts).length, snapshot=buildSnapshot(data);
  for (const drafts of [snapshot.drafts, snapshot.planner.drafts]) {
    assert.equal(drafts.length,10000); assert.ok(drafts.some(d=>d.id==='d10001')); assert.ok(drafts.some(d=>d.id==='d0'),'the draft behind a kept capture stays');
    assert.ok(!drafts.some(d=>d.id==='d1'));
  }
  assert.equal(Object.keys(state.drafts).length,before,'the store itself keeps every draft');
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
