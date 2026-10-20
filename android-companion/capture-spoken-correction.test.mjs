import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime} from '../cli/interpret.mjs';
import {validateIntentTimes} from './intent-time-guard.mjs';
import {interpretTurn} from '../intent-v2/src/interpret.mjs';
import {sourceUnits} from '../intent-v2/src/context.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
const now=new Date('2026-10-19T04:30:00Z');

test('spoken hour-minute clocks are precise while counts remain counts',()=>{
 for(const [words,at] of [['five thirty','2026-10-19T12:00:00.000Z'],['at five forty five','2026-10-19T12:15:00.000Z'],['at for thirty','2026-10-19T11:00:00.000Z'],['kal subah saade paanch baje','2026-10-20T00:00:00.000Z']]){
  const parsed=interpretTime(words,now,{evidence:words+' utha dena',inferBareClock:true});
  assert.equal(parsed.status,'parsed',words);assert.equal(parsed.planned,at,words);
 }
 for(const words of ['buy for kg rice','buy two dozen eggs','buy 2 kg atta and 5 litre oil'])assert.equal(interpretTime(words,now,{inferBareClock:true}).planned,null,words);
});

test('a bare exact clock in a multi-action source uses the next twelve hours',()=>{
 const raw='pay wifi today call plumber at 5 no wait 6 he said after 6 so 6:30 and buy rice tomorrow';
 const parsed=interpretTurn(turn(raw,[operation([field('title','Call plumber','call plumber'),field('time','6:30','6:30')]),operation([field('title','Buy rice','buy rice')],{opId:'rice'})]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:sourceUnits(raw),context:{now:now.toISOString(),nowLocal:'2026-10-19 10:00',entities:[]}}});
 assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').value,'2026-10-19T13:00:00.000Z');
});

test('a corrected clock followed by its new day can be validated from exact words',()=>{
 const raw='put laundry today at 4 no 5 actually make it tomorrow same time and haircut friday at 11';
 const parsed=interpretTurn(turn(raw,[operation([field('title','Laundry','laundry'),field('time','tomorrow at 5','no 5 actually make it tomorrow same time')]),operation([field('title','Haircut','haircut')],{opId:'hair'})]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:sourceUnits(raw),context:{now:now.toISOString(),entities:[]}}});
 assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').value,'2026-10-20T11:30:00.000Z');
});

test('a past kal clause cannot block a separate exact clock or lend it a period',()=>{
 const raw='kal raat Raj ka call miss ho gaya tha, aaj wala 4 baje wala theek hai, bas usse pehle 3:30 baje notes ready karne hai';
 const parsed=interpretTurn(turn(raw,[operation([field('title','Get notes ready','notes ready karne hai'),field('time','3:30 baje','3:30 baje')])]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:sourceUnits(raw),context:{now:now.toISOString(),entities:[]}}});
 assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').value,'2026-10-19T10:00:00.000Z');
});

test('an explicit due clock wins over a conflicting relative nudge',()=>{
 const raw='submit workbook is now due at five forty five not five so push it fifteen minutes and keep the alarm';
 const parsed=interpretTurn(turn(raw,[operation([field('time','5:15 pm',null,'suggested')],{kind:'update',targetId:'104'})]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[{entity:'task',id:'104'}]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:sourceUnits(raw),context:{now:now.toISOString(),entities:[{entity:'task',id:'104',title:'Submit workbook',savedLocalDate:'2026-10-19',startLocal:'2026-10-19 17:00'}]}}});
 const f=parsed.operations[0].fields.find(f=>f.name==='time');
 assert.equal(f.value,'2026-10-19T12:15:00.000Z');assert.equal(f.evidence,'five forty five');
});

test('the near-future thodi der window saves today without a clock',()=>{
 const parsed=interpretTime('thodi der mein',now);
 assert.equal(parsed.status,'date_only');assert.equal(parsed.plannedDate,'2026-10-19');assert.equal(parsed.planned,null);
});

test('punctuated day-after corrections retain the next day, without treating event anchors as dates',()=>{
 for(const words of ['day after, same time','day after instead same time','make it day after instead same time'])assert.equal(interpretTime(words,now).plannedDate,'2026-10-21');
 assert.equal(interpretTime('day after the exam',now).plannedDate,null);
});

test('a due-clock mention cannot overwrite an explicitly cleared schedule',()=>{
 const raw='Submit workbook is now due at five forty five, but remove its time from my plan';
 const parsed=interpretTurn(turn(raw,[operation([field('time',null,'remove its time', 'stated','clear')],{kind:'update',targetId:'104'})]),{units:sourceUnits(raw),messageId:'m',visibleEntities:[{entity:'task',id:'104'}]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:sourceUnits(raw),context:{now:now.toISOString(),entities:[{entity:'task',id:'104',title:'Submit workbook',savedLocalDate:'2026-10-19',startLocal:'2026-10-19 17:00'}]}}});
 assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').op,'clear');
});

test('near-window recovery cannot take another action or an explicit day choice',()=>{
 for(const raw of ['tomorrow thodi der mein hang clothes, remind me','thodi der mein hang clothes and call Raj at 6 or 7']){
  const parsed=interpretTurn(turn(raw,[operation([field('title','Hang clothes','hang clothes'),field('time',null,null,'stated','unknown')])],{question:{opId:'task1',field:'time',prompt:'Which time?',options:[]}}),{units:sourceUnits(raw),messageId:'m',visibleEntities:[]});
  validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:sourceUnits(raw),context:{now:now.toISOString(),entities:[]}}});
  assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').op,'unknown',raw);assert.ok(parsed.question);
 }
});

test('partial validation keeps the original multi-action ownership for a vague window',()=>{
 const raw='thodi der mein hang clothes and call Raj',units=sourceUnits(raw);
 const full=interpretTurn(turn(raw,[operation([field('title','Hang clothes','hang clothes'),field('time',null,null,'stated','unknown')]),operation([field('title','Call Raj','call Raj')],{opId:'raj'})]),{units,messageId:'m',visibleEntities:[]});
 const partial={...full,operations:[full.operations[0]]};
 validateIntentTimes(partial,{input:{messageId:'m',sourceUnits:units,context:{now:now.toISOString(),entities:[]}},sourceOperations:full.operations});
 assert.equal(partial.operations[0].fields.find(f=>f.name==='time').op,'unknown');
});

test('a same-time day correction uses its exact day even if the model emits malformed inherited time',()=>{
 const raw='the shopping thing tomorrow, make it day after instead same time',units=sourceUnits(raw);
 const parsed=interpretTurn(turn(raw,[operation([field('time','day after 6 PM',null,'suggested')],{kind:'update',targetId:'105'})]),{units,messageId:'m',visibleEntities:[{entity:'task',id:'105'}]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:units,context:{now:now.toISOString(),entities:[{entity:'task',id:'105',title:'Buy groceries',savedLocalDate:'2026-10-20',startLocal:'2026-10-20 18:00'}]}}});
 const f=parsed.operations[0].fields.find(f=>f.name==='time');assert.equal(f.value,'day after');assert.equal(f.evidence,'day after');assert.equal(f.origin,'stated');
});

test('an unquoted reminder clock may be recovered only right after its exact action quote',()=>{
 const raw='remind me to buy for kg rice and two dozen eggs at for thirty';
 const units=sourceUnits(raw),parsed=interpretTurn(turn(raw,[operation([field('title','Buy rice and eggs','buy for kg rice and two dozen eggs'),field('alert','reminder','remind me'),field('time',null,null,'stated','unknown')])]),{units,messageId:'m',visibleEntities:[]});
 validateIntentTimes(parsed,{input:{messageId:'m',sourceUnits:units,context:{now:now.toISOString(),entities:[]}}});
 assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').value,'2026-10-19T11:00:00.000Z');
});
