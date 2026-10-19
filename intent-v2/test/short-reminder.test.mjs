import test from 'node:test';
import assert from 'node:assert/strict';
import {completeShortReminder} from '../src/short-reminder.mjs';
import {sourceUnits} from '../src/context.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {orphanChoiceTurn} from '../src/choice-reply.mjs';
const input=raw=>({sourceUnits:sourceUnits(raw),context:{now:'2026-10-19T04:30:00Z'}});
test('standalone reminders complete from their words even when the model only asks in prose',()=>{
 for(const raw of ['set a reminder in 5','remind me in 5','alarm in 10','reminder tomorrow morning','5 min baad yaad dilana','set an alarm in 2 hours']){
  const i=input(raw),output=completeShortReminder({reply:'What is it for?',operations:[]},i),parsed=interpretTurn(output,{units:i.sourceUnits,messageId:'m',visibleEntities:[]});
  assert.equal(parsed.operations.length,1);assert.equal(parsed.question,null);assert.equal(parsed.reply,'');
 }
});
test('bare clocks are ready for deterministic time inference without a question',()=>{
 for(const raw of ['remind me at 6','wake me up at 7']){
  const parsed=completeShortReminder({},input(raw));
  assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').op,'set');
  assert.equal(parsed.question,null);
  assert.equal(parsed.reply,'');
 }
});
test('existing items, mixed requests, unsupported units and focused replies stay with the model',()=>{
 const sentinel={operations:[],reply:'model result'};
 for(const raw of ['remind me about Raj in 5','alarm in 5 then call Mom','remind me in 5 months','remind me in -5','remind me in 5.5','remind me in 5 seconds','remind me at 6 to call mom and buy milk','remind me at 6 to call mom because she needs help'])assert.equal(completeShortReminder(sentinel,input(raw)),sentinel,raw);
 assert.equal(completeShortReminder(sentinel,{...input('remind me in 5'),activeDraft:{id:'d'}}),sentinel);
 for(const subject of ['call mom & buy milk','call mom, buy milk','call mom plus buy milk','call mom also buy milk','call mom so she can sleep'])assert.equal(completeShortReminder(sentinel,input('remind me at 6 to '+subject)),sentinel,subject);
});
test('a closed choice cannot manufacture a new question about unrelated saved items',()=>{
 const output={operations:[{kind:'archive',entity:'task',targetId:'102'}],clarification:{choices:[{label:'Gym morning'}]}};
 for(const raw of ['That one only','Both','First','all of them']){
  const parsed=orphanChoiceTurn(output,input(raw));
  assert.deepEqual(parsed.operations,[]);assert.equal(parsed.clarification,null);
 }
 assert.equal(orphanChoiceTurn(output,{...input('Both'),openQuestion:{id:'q'}}),output);
 assert.equal(orphanChoiceTurn(output,input('Delete this')),output);
});
