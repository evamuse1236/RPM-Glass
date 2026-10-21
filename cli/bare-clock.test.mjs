import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime} from './interpret.mjs';

const parse=(text,now='2026-10-19T16:26:00+05:30',subject='')=>interpretTime(text,new Date(now),{subject,inferBareClock:true});
test('a leading numeric or spoken clock keeps its day without a preceding at',()=>{
 for(const [words,at] of [['9 tonight','2026-10-19T21:00:00+05:30'],['five thirty tonight','2026-10-19T17:30:00+05:30'],['9 tomorrow','2026-10-20T09:00:00+05:30'],['nine Thursday','2026-10-22T09:00:00+05:30']]){
  const result=parse(words,'2026-10-19T10:00:00+05:30');assert.equal(result.status,'parsed',words);assert.equal(result.planned,new Date(at).toISOString(),words);
 }
 for(const words of ['9 eggs tonight','five glasses tonight','5 minute tidy tonight','nine chapters tomorrow'])assert.equal(parse(words).planned,null,words);
});
for(const [now,text,expected] of [
 ['2026-10-19T16:26:00+05:30','at 6','2026-10-19T18:00:00+05:30'],
 ['2026-10-19T05:59:00+05:30','at 6','2026-10-19T06:00:00+05:30'],
 ['2026-10-19T06:00:00+05:30','at 6','2026-10-19T18:00:00+05:30'],
 ['2026-10-19T18:01:00+05:30','at 6','2026-10-20T06:00:00+05:30'],
 ['2026-10-19T23:59:00+05:30','at 12','2026-10-20T00:00:00+05:30'],
 ['2026-10-19T00:01:00+05:30','at 12','2026-10-19T12:00:00+05:30'],
 ['2026-10-19T18:31:00+05:30','at 6:30','2026-10-20T06:30:00+05:30'],
])test(`${text} after ${now} is the next occurrence`,()=>{
 const result=parse(text,now);assert.equal(result.planned,new Date(expected).toISOString());
 assert.equal(result.inference.rule,'next-12h');assert.ok(Date.parse(result.planned)>Date.parse(now));
 assert.ok(Date.parse(result.planned)-Date.parse(now)<=12*3600000);
 assert.ok(Date.parse(result.inference.alternateAt)>Date.parse(result.planned));
});
for(const [clock,subject,hour] of [['1','',13],['6','',18],['7','',7],['11','',11],['12','',12],['6','Wake up',6],['6','Gym morning',6],['6','Breakfast',6],['5','Run',5],['9','Dinner',21],['7','Call after work',19],['12','Breakfast',12]])
 test(`tomorrow at ${clock} for ${subject||'a task'} uses ${hour}:00`,()=>{
  const result=parse(`tomorrow at ${clock}`,undefined,subject);
  assert.equal(new Date(result.planned).getHours(),hour);assert.equal(result.plannedDate,'2026-10-20');assert.equal(result.inference.rule,'stated-day-waking');
 });
test('explicit periods, 24-hour clocks, ranges, and vague days do not receive a bare-clock inference',()=>{
 for(const text of ['tomorrow at 6am','tomorrow at 18:30','tomorrow at 06:30','tomorrow from 6 to 7','tomorrow morning'])assert.equal(parse(text).inference,undefined,text);
});
for(const [subject,clock,expected,rule] of [
 ['Wake up','7','2026-10-20T07:00:00+05:30','semantic-morning'],
 ['Morning run','9','2026-10-20T09:00:00+05:30','semantic-morning'],
 ['Gym morning','6','2026-10-20T06:00:00+05:30','semantic-morning'],
 ['Breakfast','8','2026-10-20T08:00:00+05:30','semantic-morning'],
 ['Subah uthana','7','2026-10-20T07:00:00+05:30','semantic-morning'],
 ['Dinner','8','2026-10-19T20:00:00+05:30','semantic-evening'],
 ['Raat ko khana','8','2026-10-19T20:00:00+05:30','semantic-evening'],
 ['Shaam ko walk','5','2026-10-19T17:00:00+05:30','semantic-evening'],
 ['Call after work','8','2026-10-19T20:00:00+05:30','semantic-evening'],
])test(`${subject} at ${clock} uses its own semantic period before next-12h`,()=>{
 const result=parse(`at ${clock}`,undefined,subject);
 assert.equal(result.planned,new Date(expected).toISOString());assert.equal(result.inference.rule,rule);
 assert.ok(Date.parse(result.inference.alternateAt)>Date.parse('2026-10-19T16:26:00+05:30'));
});
test('morning inference is narrow and explicit days keep their chosen day',()=>{
 assert.equal(parse('at 3',undefined,'Morning run').inference.rule,'next-12h');
 assert.equal(parse('at 7',undefined,'Run').inference.rule,'next-12h');
 assert.equal(parse('tomorrow at 7',undefined,'Wake up').planned,'2026-10-20T01:30:00.000Z');
 assert.equal(parse('today at 7',undefined,'Wake up').status,'review');
 assert.equal(parse('subah 7 baje uthana').planned,'2026-10-20T01:30:00.000Z');
 assert.equal(parse('at 8','2026-10-19T21:00:00+05:30','Dinner').planned,'2026-10-20T14:30:00.000Z');
});
for(const [text,expected,label] of [
 ['morning run at 9','2026-10-20T03:30:00.000Z','9 PM'],
 ['gym morning at 6','2026-10-20T00:30:00.000Z','6 PM'],
 ['subah 7 baje uthana','2026-10-20T01:30:00.000Z','7 PM'],
 ['raat 8 baje dawai leni hai','2026-10-19T14:30:00.000Z','8 AM'],
 ['shaam 7 baje walk karna hai','2026-10-19T13:30:00.000Z','7 AM'],
 ['tomorrow morning at 6','2026-10-20T00:30:00.000Z','6 PM'],
])test(`${text} keeps its semantic inference and alternate period`,()=>{
 const result=parse(text);assert.equal(result.status,'parsed');assert.equal(result.planned,expected);assert.equal(result.inference.alternateLabel,label);
});
