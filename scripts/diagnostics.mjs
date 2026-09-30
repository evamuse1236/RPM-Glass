#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),command=args.shift()??'inspect',options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw new Error('Use --name value');options[args[i].slice(2)]=args[i+1];}
const allowed=new Set(['label','session','operation','installation','level','version','outcome','since','cursor','limit']);
for(const key of Object.keys(options))if(!allowed.has(key))throw new Error(`Unknown option: ${key}`);
let fn,payload;
if(command==='inspect'){
  payload={paginationOpts:{numItems:Math.min(100,Math.max(1,Number(options.limit??50))),cursor:options.cursor??null}};
  for(const [flag,field] of Object.entries({session:'sessionId',operation:'operationId',installation:'installationId',level:'level',version:'appVersion',outcome:'outcome'}))if(options[flag])payload[field]=options[flag];
  if(options.since){payload.since=Date.parse(options.since);if(!Number.isFinite(payload.since))throw new Error('Use an ISO date for --since');}
  fn='diagnostics:inspect';
}else if(command==='pair'){
  if(!options.label)throw new Error('Use pair --label "Phone name"');fn='diagnostics:createPairingCode';payload={label:options.label};
}else if(command==='devices'){fn='diagnostics:listDevices';payload={};}
else if(command==='revoke'){
  if(!options.installation)throw new Error('Use revoke --installation UUID');fn='diagnostics:revoke';payload={installationId:options.installation};
}else throw new Error('Use inspect, devices, pair, or revoke');
const result=spawnSync('npx',['convex','run',fn,JSON.stringify(payload),'--deployment','vishwajit1236:rpm:prod'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
