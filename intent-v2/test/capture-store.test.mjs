import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryBackend,createRepository,captureBackend} from '../src/repository.mjs';

for(const lostAck of [false,true])test(`capture copy recovers real saves and other writers: lostAck=${lostAck}`,async()=>{
 const memory=createMemoryBackend({version:0,entries:[]});let first=true,loads=0;
 const backend={load:()=>{loads++;return memory.load();},save:async(expected,next)=>{
  if(first){first=false;if(lostAck){await memory.save(expected,next);throw new Error('Acknowledgement lost');}
   await memory.save(expected,{version:expected+1,entries:['other writer']});}
  return memory.save(expected,next);
 }};
 const repo=createRepository(captureBackend(backend));
 await repo.load();await repo.transact('add',{},data=>{data.entries.push('capture');return {saved:true};});
 assert.equal(loads,2);
 assert.deepEqual((await memory.load()).entries,lostAck?['capture']:['other writer','capture']);
 assert.deepEqual(await repo.receipt('add'),{saved:true});
 assert.equal(loads,2);
});
