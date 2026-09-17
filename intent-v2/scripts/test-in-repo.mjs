/** Contract test using YOUR actual repository modules. Not run in this delivery environment. */
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {createRpmPlanAdapter} from '../adapters/rpm-glass.mjs';
import {setup,captured,actionFor,seed} from '../test/helpers.mjs';
const repo=process.argv[2];if(!repo)throw new Error('Usage: node scripts/test-in-repo.mjs /path/to/RPM-Glass');
const {changePlanner}=await import(pathToFileURL(resolve(repo,'android-companion/planner-tools.mjs')));
const {undo}=await import(pathToFileURL(resolve(repo,'chat-prototype/companion-tools.mjs')));
const adapter=createRpmPlanAdapter({changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]})});
const s=setup(undefined,{adapter,seed:seed()});const {draft}=await captured(s);const result=await s.harness.act(actionFor(draft),{actionId:'a1'});
assert.equal(result.status,'committed');let data=await s.repository.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].title,'Plan the lesson');assert.equal(data.entries[0].raw,'Plan the lesson');assert.equal(data.entries[0].minutes,null);
await s.harness.undo({draftId:draft.id,conversationId:'c1',actionId:'u1'});data=await s.repository.load();assert.equal(data.entries.length,0);assert.equal(data.intentV2.drafts[draft.id].status,'undone');console.log('Actual repository adapter smoke test passed (in-memory data only; no phone or personal records).');
