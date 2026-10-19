import test from 'node:test';
import assert from 'node:assert/strict';
import {completeShortReminder} from '../src/short-reminder.mjs';
import {sourceUnits} from '../src/context.mjs';
import {interpretTurn} from '../src/interpret.mjs';
const input=raw=>({sourceUnits:sourceUnits(raw),context:{now:'2026-10-19T04:30:00Z'}});
test('standalone reminders complete from their words even when the model only asks in prose',()=>{
 for(const raw of ['set a reminder in 5','remind me in 5','alarm in 10','reminder tomorrow morning','5 min baad yaad dilana','set an alarm in 2 hours']){
  const i=input(raw),output=completeShortReminder({reply:'What is it for?',operations:[]},i),parsed=interpretTurn(output,{units:i.sourceUnits,messageId:'m',visibleEntities:[]});
  assert.equal(parsed.operations.length,1);assert.equal(parsed.question,null);assert.equal(parsed.reply,'');
 }
});
test('bare clocks have exactly one typed AM/PM question and no invented day',()=>{
 for(const raw of ['remind me at 6','wake me up at 7']){
  const parsed=completeShortReminder({},input(raw));
  assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').op,'unknown');
  assert.equal(parsed.question.options.length,2);assert.ok(parsed.question.options.every(o=>!o.value.includes('tomorrow')));
  assert.equal(parsed.reply,'');
 }
});
test('named subjects, existing items, mixed requests, unsupported units and focused replies stay with the model',()=>{
 const sentinel={operations:[],reply:'model result'};
 for(const raw of ['set a reminder in 5 mins to call mom','remind me about Raj in 5','alarm in 5 then call Mom','remind me in 5 months','remind me in -5','remind me in 5.5','remind me in 5 seconds'])assert.equal(completeShortReminder(sentinel,input(raw)),sentinel,raw);
 assert.equal(completeShortReminder(sentinel,{...input('remind me in 5'),activeDraft:{id:'d'}}),sentinel);
});
