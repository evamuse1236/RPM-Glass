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
