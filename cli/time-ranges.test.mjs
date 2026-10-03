import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretTime} from './interpret.mjs';

const now=new Date(2026,8,27,12,1);
for(const phrase of ['today from 2 pm to 3 pm','today 2–3pm','today between 2pm and 3pm','today from two pm to three pm','today 14:00-15:00','today from two to three pm'])test(`range: ${phrase}`,()=>{
 const p=interpretTime(phrase,now);assert.equal(p.status,'parsed');assert.equal(new Date(p.planned).getHours(),14);assert.equal(p.minutes,60);assert.equal(new Date(p.end).getHours(),15);assert.ok(p.matched.some(m=>m.end));
});
for(const phrase of ['today from 2 to 3','today 3pm-2pm','today 2pm-2pm','today 2pm to tomorrow 3pm','from Monday to Friday','today at 25:00','today 2pm or 3pm','today 2pm-3pm for 30 minutes','today 2pm to 99pm','today from 2pm to','every day 2pm-3pm','tomorrow 2pm-3pm for 0 minutes','tomorrow 2pm-3pm for 9999 minutes','tomorrow 2pm-3pm for -30 minutes','tomorrow 2:70pm-3pm','tomorrow 2pm-3:90pm'])test(`review: ${phrase}`,()=>{
 const p=interpretTime(phrase,now);assert.equal(p.status,'review');assert.equal(p.planned,null);assert.equal(p.minutes,null);
});
test('overnight range retains the next-day endpoint',()=>{const p=interpretTime('today from 11pm to 1am',now);assert.equal(p.status,'parsed');assert.equal(p.minutes,120);assert.equal(new Date(p.end).getDate(),28);});
test('matching stated duration is accepted',()=>{const p=interpretTime('today 2pm-3pm for 60 minutes',now);assert.equal(p.status,'parsed');assert.equal(p.minutes,60);});
test('range in the past remains unscheduled',()=>assert.equal(interpretTime('today 9am-10am',now).status,'review'));
test('explicit timezone endpoints yield elapsed minutes',()=>{const p=interpretTime('tomorrow 2pm-3pm EST',now);assert.equal(p.planned,'2026-09-28T19:00:00.000Z');assert.equal(p.end,'2026-09-28T20:00:00.000Z');assert.equal(p.minutes,60);});
test('generated ranges survive clock, midnight, month/year and timezone boundaries',()=>{
 const previous=process.env.TZ;let checked=0;
 try{for(const zone of ['UTC','Asia/Kolkata','Asia/Kathmandu','America/New_York','Europe/London','Australia/Adelaide']){
  process.env.TZ=zone;
  for(const date of [[2026,8,27],[2026,11,31]])for(let hour=0;hour<24;hour++)for(const minute of [0,30])for(const duration of [15,60,120]){
   const reference=new Date(...date,0),start=new Date(...date, hour,minute);start.setDate(start.getDate()+1);const end=new Date(+start+duration*60000),clock=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
   const phrase=`tomorrow ${clock(start)}-${clock(end)}`,p=interpretTime(phrase,reference);
   assert.equal(p.status,'parsed',`${zone}: ${phrase}: ${p.reason}`);assert.equal(p.planned,start.toISOString(),`${zone}: ${phrase}`);assert.equal(p.end,end.toISOString());assert.equal(p.minutes,duration);checked++;
  }
 }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
 assert.equal(checked,1728);
});
test('DST gaps and repeated wall clocks require clarification, fixed offsets remain usable',()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';
 try{for(const phrase of ['2026-03-08 02:15-03:15','2026-03-08 01:30-02:30','2026-11-01 01:15-02:15','2026-11-01 at 01:30'])assert.equal(interpretTime(phrase,new Date('2026-01-01T00:00:00Z')).status,'review',phrase);
 const p=interpretTime('2026-11-01 01:15-02:15 EST',new Date('2026-01-01T00:00:00Z'));assert.equal(p.status,'parsed');assert.equal(p.minutes,60);
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('"before" a day lands on the day before it, "by" on the day itself',()=>{
 assert.equal(interpretTime('before the 30th',now).plannedDate,'2026-09-29');
 assert.equal(interpretTime('by the 30th',now).plannedDate,'2026-09-30');
 assert.equal(interpretTime('before tomorrow',now).plannedDate,'2026-09-27');
});
