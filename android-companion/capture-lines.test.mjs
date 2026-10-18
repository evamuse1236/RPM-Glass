import test from 'node:test';
import assert from 'node:assert/strict';
import {splitWhen,tally} from './capture-lines.mjs';
import {receiptLines} from './capture-receipt.mjs';

test('a when splits into a day chip and a time chip; a date alone is a day',()=>{
 assert.deepEqual(splitWhen('Today, 10:30 AM'),{day:'Today',time:'10:30 AM'});
 assert.deepEqual(splitWhen('Tue 20 Oct, 4:00 PM–4:30 PM'),{day:'Tue 20 Oct',time:'4:00 PM–4:30 PM'});
 assert.deepEqual(splitWhen('Tue 20 Oct'),{day:'Tue 20 Oct',time:null});
 assert.deepEqual(splitWhen(null),{day:null,time:null});
});

test('the card head counts what happened in one or two words',()=>{
 assert.equal(tally([{verb:'Added'}]),'Added');
 assert.equal(tally([{verb:'Added'},{verb:'Added'}]),'2 added');
 assert.equal(tally([{verb:'Added'},{verb:'Moved'},{verb:'Done'}]),'3 changes');
});

test('a receipt row carries the alert from alertIntent and the new task length',()=>{
 const data={entries:[{id:7,title:'Call the bank',plannedDate:'2026-10-20',minutes:30,alertIntent:{type:'reminder'}}],planner:{blocks:[]}};
 const draft={receipt:{changes:[{type:'create',collection:'tasks',id:7}]},operations:[{kind:'create',entity:'task',fields:[]}]};
 const [row]=receiptLines(data,draft);
 assert.equal(row.alert,'reminder');
 assert.equal(row.minutes,30);
 assert.equal(row.where,'Inbox');
});

test('an alert that is off never shows on the receipt',()=>{
 const data={entries:[{id:8,title:'Stretch',alertIntent:{type:'off'}}],planner:{blocks:[]}};
 const draft={receipt:{changes:[{type:'create',collection:'tasks',id:8}]},operations:[{kind:'create',entity:'task',fields:[]}]};
 assert.equal(receiptLines(data,draft)[0].alert,null);
});
