import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {createMemoryBackend,createRepository} from '../intent-v2/src/repository.mjs';
import {editPlan} from './planner-state.mjs';
import {createWebSyncProcessor} from './web-sync-commands.mjs';

test('completion and reopening conflict after phone changes a day-only schedule or the task identity',async()=>{
  for(const type of ['complete','uncomplete'])for(const fields of [{plannedDate:'2026-10-20'},{title:'Call a different bank'}]){
    const data=freshStore();editPlan(data,{type:'saveTask',fields:{title:'Call the bank',plannedDate:'2026-10-19',done:type==='uncomplete'}});
    const backend=createMemoryBackend(data),processor=createWebSyncProcessor({backend}),base=await processor.snapshot();
    await createRepository(backend).transact(randomUUID(),{},next=>editPlan(next,{type:'saveTask',id:1,fields}));
    const result=await processor.process({id:randomUUID(),type,args:{taskId:1},baseRevision:base.revision,createdAt:'2026-10-19T01:30:00Z'},{snapshots:[base]});
    assert.equal(result.status,'conflict');
    const saved=await backend.load();assert.equal(saved.entries[0].done,type==='uncomplete');
    for(const [key,value]of Object.entries(fields))assert.equal(saved.entries[0][key],value);
  }
});
