import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

test('planner has no task drag, swipe mutation or timeline resize affordances',async()=>{
  const [source,css,night]=await Promise.all([readFile(new URL('./planner.mjs',import.meta.url),'utf8'),readFile(new URL('./planner-stitch.css',import.meta.url),'utf8'),readFile(new URL('./night.css',import.meta.url),'utf8')]);
  for(const removed of ['installResize','installOrder','installTaskSwipe','drag-handle','drop-zone','gesture-hint']){
    assert.equal(source.includes(removed),false,`${removed} remains in planner source`);
    assert.equal(css.includes(removed),false,`${removed} remains in planner CSS`);
  }
  assert.equal(source.includes("'priority-control numeric'"),true);
  assert.equal(source.includes("button('Move to RPM block'"),true);
  assert.equal(source.includes("button('Edit task'"),true);
  assert.equal(source.includes("swipe($('planner-tabs')"),false);
  assert.equal(source.includes("window.addEventListener('rpm-phone-status',()=>{syncPhonePresentation();refreshCalendar();})"),true);
  assert.equal(source.includes('dataset.largeText!==next'),true);
  assert.equal(source.includes('if(lastNavLevel!==level)revealSelectedTab()'),true);
  assert.equal(source.includes("el('details','original-capture')"),true);
  assert.equal(source.includes("draftMeta&&collection==='goals'?'textarea':'text'"),true);
  assert.equal(css.includes('#editor:before'),false);
  assert.equal(css.includes(':root[data-large-text=true] #planner-tabs{display:flex;justify-content:flex-start;overflow-x:auto'),true);
  assert.equal(css.includes('#notice{position:fixed;z-index:40;bottom:100px;left:16px;right:88px'),true);
  assert.equal(night.includes('.panel[data-view=chat] .content{display:flex;flex-direction:column;justify-content:flex-start}'),true);
  assert.equal(night.includes('.panel[data-view=chat] .status.error{display:block}'),true);
  assert.equal(night.includes('.panel[data-view=chat] .content{display:flex;flex-direction:column;justify-content:center}'),false);
});
