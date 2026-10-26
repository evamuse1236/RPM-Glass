import test from 'node:test';
import assert from 'node:assert/strict';
import {partialOperations} from '../src/partial-output.mjs';
import {field,operation,turn} from './helpers.mjs';

test('partial JSON exposes only complete titles and complete chip values',()=>{
 const prefix='{"operations":[{"opId":"a","kind":"create","entity":"task","fields":[';
 assert.deepEqual(partialOperations(prefix+'{"name":"title","op":"set","value":"Call mo'),[]);
 const title='{"name":"title","op":"set","value":"Call mom"}';
 const expected={opId:'a',kind:'create',entity:'task',title:'Call mom',time:null,minutes:null};
 assert.deepEqual(partialOperations(prefix+title),[expected]);
 assert.deepEqual(partialOperations(prefix+title+',{"name":"minutes","op":"set","value":1'),[expected]);
 assert.deepEqual(partialOperations(prefix+title+',{"name":"minutes","op":"set","value":15}'),[{...expected,minutes:15}]);
 assert.deepEqual(partialOperations(prefix+title+',{"name":"time","op":"set","value":"8pm"}'),[{...expected,time:'8pm'}]);
});
test('escaped quotes and Unicode survive every byte boundary without invented title text',()=>{
 const text=JSON.stringify(turn('Call mom',[operation([field('title','Say "hi" ☺','hi')])]));
 for(let i=0;i<=text.length;i++)for(const op of partialOperations(text.slice(0,i)))assert.equal(op.title,'Say "hi" ☺');
});

test('partial events are changed lists, at least 150ms apart, and stop before ready',async()=>{
 const {partialEmitter}=await import('../src/partial-output.mjs');
 let now=0,callback;const emitted=[];
 const emitter=partialEmitter({messageId:'m',emit:e=>emitted.push({at:now,event:e}),now:()=>now,schedule:fn=>{callback=fn;return 1;},cancel:()=>{callback=null;}});
 const output=minutes=>JSON.stringify({operations:[operation([field('title','Call mom','mom'),field('minutes',minutes,'minutes')])]});
 emitter.push(output(10));emitter.push(output(10));now=50;emitter.push(output(15));
 assert.equal(emitted.length,1);now=150;callback();assert.equal(emitted.length,2);
 assert.deepEqual(Object.keys(emitted[1].event),['type','messageId','operations']);assert.equal(emitted[1].event.type,'partial');
 assert.equal(emitted[1].event.operations[0].minutes,15);
 now=200;emitter.push(output(20));emitter.close();assert.equal(callback,null);assert.equal(emitted.length,2);
});
