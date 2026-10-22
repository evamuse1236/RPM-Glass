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
