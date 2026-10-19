import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {bundleOptions} from '../scripts/build-companion-assets.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';

test('the shipped headless entry boots with eval blocked and saves commands through the native bridge', async () => {
  const output=await build({...bundleOptions,entryPoints:['android-companion/sync-runtime.mjs'],write:false});
  let data=seedStore(new Date('2026-10-19T07:00:00+05:30')).data;
  data.syncSavedAt='2026-10-19T01:30:00.000Z';
  const base=buildSnapshot(data),task=data.entries.find(row=>!row.done),id='12345678-1234-4123-8123-123456789abc';
  let input={commands:[],snapshots:[base],revokedCommandIds:[]},completed,failed;
  const result=new Promise((resolve,reject)=>{completed=resolve;failed=reject;});
  const window={RpmSync:{
    complete:value=>completed(JSON.parse(value)),failed:()=>failed(new Error('Headless runtime failed')),
    invoke:(requestId,action,payload)=>queueMicrotask(()=>{
      let value,error=null;const p=JSON.parse(payload);
      try {
        if(action==='input')value=structuredClone(input);
        else if(action==='load')value={data:structuredClone(data)};
        else if(action==='save'){
          assert.equal(p.expected,data.version);assert.equal(p.data.version,data.version+1);
          data={...p.data,syncSavedAt:'2026-10-19T01:31:00.000Z'};value={};
        }else throw new Error(`Unexpected bridge action ${action}`);
      }catch(problem){error=String(problem);}
      window.rpmBridgeResult(requestId,value,error);
    })
  }};
  const context=vm.createContext({window,crypto:webcrypto,structuredClone,TextEncoder,TextDecoder,setTimeout,clearTimeout,AbortSignal,AbortController,console}, {codeGeneration:{strings:false,wasm:false}});
  await vm.runInContext(`(async()=>{${output.outputFiles[0].text}\n})()`,context);
  assert.equal((await result).snapshot.revision,0);
  async function run(commands,revokedCommandIds=[]){
    input={commands,snapshots:[base],revokedCommandIds};
    const done=new Promise((resolve,reject)=>{completed=resolve;failed=reject;});
    await window.rpmSyncRun();return done;
  }
  const command={id,type:'complete',args:{taskId:task.id},baseRevision:base.revision,createdAt:'2026-10-19T01:30:00Z'};
  const applied=await run([command]);assert.equal(applied.acks[0].status,'applied');assert.equal(data.entries.find(row=>row.id===task.id).done,true);
  const version=data.version,retry=await run([command],[id]);assert.deepEqual(retry.acks,applied.acks);assert.equal(data.version,version);
  const water={...command,id:'87654321-4321-4123-8123-123456789abc',type:'log-water',args:{at:'2026-10-19T01:30:00Z'}};
  const before=data.planner.body.water.glasses.length,cancelled=await run([water],[water.id]);
  assert.equal(cancelled.acks[0].status,'rejected');assert.equal(data.planner.body.water.glasses.length,before);
});
