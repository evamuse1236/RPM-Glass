import test from 'node:test';
import assert from 'node:assert/strict';
import {capturedGoalDraft,savedPlannerTarget} from './planner.mjs';

test('captured goal drafts retain exact long source while entity fields stay valid',()=>{
  const sourceRaw='A'.repeat(12000),target={view:'life',draft:{title:'T'.repeat(240),purpose:'P'.repeat(9000),notes:'N'.repeat(9000),sourceRaw,areaId:null,year:2026,horizon:'yearly',period:null}};
  const draft=capturedGoalDraft(target);
  assert.equal(draft.sourceRaw,sourceRaw);
  assert.equal(draft.values.title.length,200);
  assert.equal(draft.values.purpose.length,8000);
  assert.equal(draft.values.notes.length,8000);
  assert.equal(capturedGoalDraft(structuredClone(target)).key,draft.key);
  const other=capturedGoalDraft({...target,draft:{...target.draft,sourceRaw:sourceRaw+' different'}});
  assert.notEqual(other.key,draft.key);
});

test('captured goal drafts reject malformed targets without touching ordinary drafts',()=>{
  assert.equal(capturedGoalDraft({view:'life'}),null);
  assert.equal(capturedGoalDraft({view:'life',draft:{title:'Goal',sourceRaw:'Words',year:1999}}),null);
  assert.equal(capturedGoalDraft({view:'ideas',draft:{title:'Goal',sourceRaw:'Words',year:2026}}),null);
});

test('saved planner targets dispatch UUID entities by collection and numeric tasks explicitly',()=>{
  const uuid='68e4934e-1c76-4a19-90fb-0197ec11157f';
  assert.deepEqual(savedPlannerTarget({view:'life',collection:'goals',id:uuid}),{collection:'goals',id:uuid});
  assert.deepEqual(savedPlannerTarget({view:'life',collection:'areas',id:uuid}),{collection:'areas',id:uuid});
  assert.deepEqual(savedPlannerTarget({view:'rpm',id:uuid}),{collection:'blocks',id:uuid});
  assert.deepEqual(savedPlannerTarget({view:'projects',id:uuid}),{collection:'projects',id:uuid});
  assert.deepEqual(savedPlannerTarget({view:'day',collection:'tasks',id:42}),{collection:'tasks',id:42});
  assert.equal(savedPlannerTarget({view:'day',collection:'tasks',id:uuid}),null);
});
