import test from 'node:test';import assert from 'node:assert/strict';
import {validateIntentTimes} from './intent-time-guard.mjs';
const input=text=>({messageId:'m1',sourceUnits:[{id:'s0',text}],context:{now:'2026-10-03T09:30:00.000Z',nowLocal:'2026-10-03T15:00',entities:[]}});
const turn=(value,evidence)=>({mode:'capture',operations:[{opId:'op1',kind:'create',entity:'task',fields:[{name:'time',op:'set',value,origin:'stated',evidence,sourceMessageId:'m1'}]}]});
test('a bare clock said with "morning" or "evening" has stated its AM/PM',()=>{
 const words='tomorrow I want to finish the charts in the morning like 9 or 10';
 assert.doesNotThrow(()=>validateIntentTimes(turn('tomorrow from 9am to 10am',words),{input:input(words)}));
 const evening='kal shaam 7 baje groceries';
 assert.doesNotThrow(()=>validateIntentTimes(turn('tomorrow 7pm',evening),{input:input(evening)}));
});
test('a bare clock with no part of day still may not borrow AM/PM',()=>{
 const words='tomorrow like 9 or 10';
 assert.throws(()=>validateIntentTimes(turn('tomorrow from 9am to 10am',words),{input:input(words)}),/Time precision/);
 const morning='tomorrow morning like 9';
 assert.throws(()=>validateIntentTimes(turn('tomorrow 9pm',morning),{input:input(morning)}),/Time precision/);
});

test('the clock guard accepts the parser\'s stated morning, noon and spoken clocks',()=>{
 for(const words of ['tomorrow morning at 9','tomorrow morning at eight','today at noon','tomorrow at midnight'])
  assert.doesNotThrow(()=>validateIntentTimes(turn(words,words),{input:input(words)}),words);
});

test('a part of day on another action cannot authorize an invented clock',()=>{
 const words='Read tomorrow at nine. Walk in the evening at 7pm.';
 const parsed=turn('tomorrow 9pm','tomorrow at nine');
 validateIntentTimes(parsed,{input:input(words)});
 assert.equal(parsed.operations[0].fields[0].value,'2026-10-04T03:30:00.000Z');
 assert.equal(parsed.operations[0].fields[0].inference.rule,'stated-day-waking');
});

test('a day correction may repeat only a verified unchanged saved clock',()=>{
 const words='no, I meant Thursday',i=input(words);
 i.context.entities=[{entity:'task',id:'7',title:'Book a haircut',savedLocalDate:'2026-10-04',startLocal:'2026-10-04 16:00'}];
 const correction=()=>({...turn('Thursday at 4 pm',words),operations:[{opId:'op1',sourceId:'s0',kind:'update',entity:'task',targetId:'7',fields:[{name:'time',op:'set',value:'Thursday at 4 pm',origin:'stated',evidence:words,sourceMessageId:'m1'}]}]});
 const parsed=correction();
 assert.doesNotThrow(()=>validateIntentTimes(parsed,{input:i}));
 assert.equal(parsed.operations[0].fields[0].value,words);
 const changed=correction();changed.operations[0].fields[0].value='Thursday at 5 pm';
 assert.throws(()=>validateIntentTimes(changed,{input:i}),{code:'UNSUPPORTED_TIME'});
 const explicit=input('Thursday at 5 pm');explicit.context.entities=i.context.entities;
 const wrong=correction();wrong.operations[0].fields[0].evidence='Thursday at 5 pm';
 assert.throws(()=>validateIntentTimes(wrong,{input:explicit}),{code:'UNSUPPORTED_TIME'});
});
