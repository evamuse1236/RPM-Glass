import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {existsSync} from 'node:fs';
import {cliCall} from './cli.mjs';

test('CLI cancellation waits for process close before deleting its working directory',async()=>{
 let directory,systemFile,closed=false,existsAtClose=false;
 const spawnImpl=(_command,args,options)=>{
  directory=options.cwd;systemFile=args[args.indexOf('--system-prompt-file')+1];
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=()=>{setTimeout(()=>{
   existsAtClose=existsSync(directory)&&existsSync(systemFile);closed=true;child.emit('close',null);
  },25);return true;};
  return child;
 };
 await assert.rejects(cliCall({prompt:'test',input:'test',schema:{type:'object'},timeoutMs:5,spawnImpl}),/CLI transport timed out or was cancelled/);
 assert.equal(closed,true);assert.equal(existsAtClose,true);
 assert.equal(existsSync(directory),false);assert.equal(existsSync(systemFile),false);
});

test('CLI startup failure keeps the original transport error and cleans its files after close',async()=>{
 let directory,systemFile;
 const spawnImpl=(_command,args,options)=>{
  directory=options.cwd;systemFile=args[args.indexOf('--system-prompt-file')+1];
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  setImmediate(()=>{child.emit('error',new Error('fake startup failure'));child.emit('close',null);});
  return child;
 };
 await assert.rejects(cliCall({prompt:'test',input:'test',schema:{type:'object'},spawnImpl}),/Claude CLI could not start/);
 assert.equal(existsSync(directory),false);assert.equal(existsSync(systemFile),false);
});
