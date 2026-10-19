import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime} from './interpret.mjs';

const parse=(text,now='2026-10-19T16:26:00+05:30',subject='')=>interpretTime(text,new Date(now),{subject,inferBareClock:true});
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
 for(const text of ['tomorrow at 6am','tomorrow morning at 6','tomorrow at 18:30','tomorrow at 06:30','tomorrow from 6 to 7','tomorrow morning'])assert.equal(parse(text).inference,undefined,text);
});
