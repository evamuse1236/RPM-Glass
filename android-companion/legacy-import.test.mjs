import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan,blockTasks} from './planner-state.mjs';
import {importLegacyEntries} from './legacy-import.mjs';

const T=Date.parse('2026-09-20T09:00:00Z');
const row=(id,extra={})=>({_id:id,kind:'plan',raw:'raw '+id,title:'raw '+id,created:T+id,planned:null,minutes:30,duration_source:'default_estimate',mood:null,energy:null,notes:'',interpretation:'',purpose:'',project:null,done:0,reminder:null,reminder_status:'none',alarm:null,alarm_status:'none',...extra});
const legacy=()=>({done:false,
  entries:[
    row(1,{raw:'call mum tmrw 3pm about the trip',title:'Call mum about the trip',planned:Date.parse('2026-09-21T15:00:00Z'),duration_source:'chosen_estimate',minutes:20,interpretation:'Tomorrow 3 PM',purpose:'Stay close',project:7,reminder:Date.parse('2026-09-21T14:50:00Z'),reminder_status:'scheduled'}),
    row(2,{kind:'checkin',raw:'Walked for 40 min, feeling ok',title:'Walked for 40 min, feeling ok',minutes:40,duration_source:'reported_actual',mood:'Okay',energy:'Medium'}),
    row(3,{raw:'old done thing',done:1,notes:'kept note'}),
  ],
  projects:[{_id:7,result:'Family trip booked',purpose:'Time together',domain:''}],
  revisions:[{entry_id:1,at:T+1,reason:'Created from original input'},{entry_id:1,at:T+5,reason:'Title changed in composer; raw retained'}]});

test('legacy entries keep their original words, times and edit reasons',()=>{
  const d=freshStore();const now=new Date('2026-10-02T10:00:00Z');
  assert.equal(importLegacyEntries(d,legacy(),now),3);
  const call=d.entries.find(e=>e.legacyId===1),walk=d.entries.find(e=>e.legacyId===2),old=d.entries.find(e=>e.legacyId===3);
  assert.equal(call.raw,'call mum tmrw 3pm about the trip');assert.equal(call.title,'Call mum about the trip');
  assert.equal(call.planned,'2026-09-21T15:00:00.000Z');assert.equal(call.minutes,20);assert.equal(call.durationSource,'chosen_estimate');
  assert.equal(call.purpose,'Stay close');assert.equal(call.must,false);assert.deepEqual(call.alertIntent,{type:null});
  assert.match(call.notes,/Earlier Result: Family trip booked · Purpose: Time together/);assert.match(call.notes,/Earlier screens reminder at .*scheduled/);
  assert.deepEqual(call.revisions[0].snapshot.earlierRevisions.map(r=>r.reason),['Created from original input','Title changed in composer; raw retained']);
  assert.equal(call.revisions[0].snapshot.interpretation,'Tomorrow 3 PM');
  assert.equal(walk.kind,'checkin');assert.equal(walk.minutes,40);assert.equal(walk.durationSource,'reported_actual');assert.equal(walk.mood,'Okay');assert.equal(walk.planned,null);
  assert.equal(old.done,true);assert.equal(old.state,'done');assert.equal(old.notes,'kept note');
  assert.ok(d.entries.every(e=>e.id>0&&e.source==='legacy-import'));assert.equal(new Set(d.entries.map(e=>e.id)).size,3);
  assert.deepEqual(d.legacyImport,{at:now.toISOString(),entries:3,source:'Earlier RPM screens'});
});

test('copied tasks join No block after existing tasks, timed ones first',()=>{
  const d=freshStore();const existing=editPlan(d,{type:'saveTask',fields:{title:'Already planned'}});
  importLegacyEntries(d,legacy());
  assert.deepEqual(blockTasks(d,null).map(t=>t.legacyId??t.id),[existing,1,3]);
});

test('import is idempotent and never overwrites companion entries',()=>{
  const d=freshStore();editPlan(d,{type:'saveTask',fields:{title:'Mine'}});
  assert.equal(importLegacyEntries(d,legacy()),3);const before=structuredClone(d);
  assert.equal(importLegacyEntries(d,legacy()),0);assert.deepEqual(d,before);
  const more=legacy();more.entries.push(row(4,{raw:'added later'}));
  assert.equal(importLegacyEntries(d,more),1);assert.equal(d.entries.length,5);assert.equal(d.entries[0].title,'Mine');assert.equal(d.legacyImport.entries,4);
});

test('nothing to copy leaves the store untouched',()=>{
  const d=freshStore();const before=structuredClone(d);
  assert.equal(importLegacyEntries(d,{done:false,entries:[],projects:[],revisions:[]}),0);
  assert.equal(importLegacyEntries(d,null),0);assert.deepEqual(d,before);
});

test('undoing an earlier planner change keeps the copied entries',()=>{
  const d=freshStore();editPlan(d,{type:'saveTask',fields:{title:'Before import'}});const later=editPlan(d,{type:'saveTask',fields:{title:'Undo me'}});
  assert.ok(d.planner.undo);importLegacyEntries(d,legacy());
  const ids=d.entries.map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
  editPlan(d,{type:'undo'});
  assert.equal(d.entries.some(e=>e.id===later),false);
  assert.deepEqual(d.entries.filter(e=>e.legacyId).map(e=>e.legacyId).sort(),[1,2,3]);
});
