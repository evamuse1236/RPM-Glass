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

test('a sheet refresh that fails after a save never throws into the save (no raw error in the snackbar)',async()=>{
  const {syncSheet}=await import('./planner.mjs');
  const logged=[];const original=console.error;console.error=(...args)=>logged.push(args);
  try{
    const broken={sheet:{sync:()=>{const body=undefined;return body.querySelectorAll('*');}}};
    assert.doesNotThrow(()=>syncSheet(broken));
    assert.equal(syncSheet(broken),false);
    assert.equal(logged.length,2,'the failure is logged for diagnosis, not shown');
    assert.equal(syncSheet({sheet:{sync:()=>true}}),true);
    assert.equal(syncSheet({sheet:{}}),false);
  }finally{console.error=original;}
});

test('the docked snackbar scrolls the row just tapped into view, never past that row or the content end',async()=>{
  const {dockScroll}=await import('./planner.mjs');
  const first={top:600,bottom:730};
  assert.equal(dockScroll({rows:[first,{top:730,bottom:782}],first,visibleTop:300,visibleBottom:710,room:200}),72);
  assert.equal(dockScroll({rows:[first],first,visibleTop:300,visibleBottom:760,room:200}),0,'already above the bar');
  assert.equal(dockScroll({rows:[first,{top:730,bottom:900}],first,visibleTop:300,visibleBottom:710,room:40}),40,'only as far as the content goes');
  assert.equal(dockScroll({rows:[first,{top:730,bottom:1400}],first,visibleTop:300,visibleBottom:710,room:900}),300,'the tapped row stays in view');
});
