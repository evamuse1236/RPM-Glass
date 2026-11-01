import test from 'node:test';
import assert from 'node:assert/strict';
import {createRamble,applyRamble} from './voice-turn.mjs';
import {TZ,NOW,call,tools,said,heard,turnDone,day,reply,words} from './voice-turn-fixtures.mjs';

test('the capture keeps each tool call with its args and its result or refusal, and the reply as the reason', () => {
 const {data,ids}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('Groceries are boring. Add pay rent.'));r.stop();
 const [refused,added]=reply(r,tools(call('delete_task',{id:ids.milk}),call('save_task',{title:'Pay rent'})));
 r.receive(turnDone);r.receive(said('I added Pay rent. Should I remove Groceries?'));r.receive(turnDone);
 assert.match(refused.error,/did not ask to remove/);
 assert.equal(applyRamble(data,r.result(),words).status,'applied');
 const capture=data.intentV2.captures['m-1'];
 assert.deepEqual(capture.voice.calls,[
  {name:'delete_task',args:{id:ids.milk},error:'They did not ask to remove this. Change nothing and ask them first.'},
  {name:'save_task',args:{title:'Pay rent'},result:{saved:added.saved}},
 ]);
 assert.equal(capture.reply,'I added Pay rent. Should I remove Groceries?');
});

test('the call record drops key-like fields, hides keys in text, and stays short', () => {
 const {data,ids}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 const key='AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUv';
 r.receive(heard('Remove groceries'));r.stop();
 for(let i=0;i<24;i++)reply(r,tools(call('get_plan')));
 reply(r,tools(call('delete_task',{id:ids.milk,token:'tok-123',apiKey:key,note:`key=${key} ${'x'.repeat(400)}`})));
 const {calls}=r.result();
 assert.equal(calls.length,20);
 assert.deepEqual(calls[0],{name:'get_plan',args:{},result:'plan'});
 const last=calls.at(-1);
 assert.deepEqual(Object.keys(last.args),['id','note']);
 assert.ok(last.args.note.length<=201);
 r.receive(turnDone);
 const outcome=applyRamble(data,{...r.result(),batch:null,failed:'Voice stopped.'},words);
 assert.equal(outcome.status,'words-kept');
 const kept=JSON.stringify(data.intentV2.captures['m-1']);
 assert.ok(data.intentV2.captures['m-1'].lastError.calls.length===20);
 for(const secret of [key,'tok-123','"token"','apiKey'])assert.ok(!kept.includes(secret),secret);
});
