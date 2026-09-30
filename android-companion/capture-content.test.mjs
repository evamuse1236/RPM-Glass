import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSchedule,captureDuration} from './capture-content.mjs';
const options={timeZone:'Asia/Kolkata',reference:new Date('2026-09-28T04:00:00Z')};
test('same-day range shows one date, compact clocks and duration',()=>{
 assert.deepEqual(captureSchedule({planned:'2026-09-28T08:30:00Z',end:'2026-09-28T09:30:00Z',minutes:60},options),{date:'28 Sept',time:'2 pm to 3 pm',duration:'1 hr'});
});
test('overnight range retains both dates and does not imply the same day',()=>{
 const s=captureSchedule({planned:'2026-09-28T17:30:00Z',end:'2026-09-28T19:30:00Z',minutes:120},options);
 assert.equal(s.crossDay,true);assert.equal(s.startLabel,'28 Sept · 11 pm');assert.equal(s.endLabel,'29 Sept · 1 am');
});
test('date-only values stay calendar dates in distant timezones',()=>{
 for(const timeZone of ['Pacific/Kiritimati','Pacific/Honolulu'])assert.equal(captureSchedule({plannedDate:'2026-09-28'},{...options,timeZone}).date,'28 Sept');
 assert.equal(captureSchedule({plannedDate:'2026-09-28'},options).time,'Time not set');
});
test('year boundaries show the years and clocks retain nonzero minutes',()=>{
 const s=captureSchedule({planned:'2026-12-31T18:00:00Z',end:'2026-12-31T19:45:00Z',minutes:105},options);
 assert.equal(s.startLabel,'31 Dec 2026 · 11:30 pm');assert.equal(s.endLabel,'1 Jan 2027 · 1:15 am');assert.equal(s.duration,'1 hr 45 min');
});
test('DST repeated clocks keep their different offsets',()=>{
 const s=captureSchedule({planned:'2026-11-01T05:30:00Z',end:'2026-11-01T06:30:00Z',minutes:60},{...options,timeZone:'America/New_York'});
 assert.equal(s.time,'1:30 am GMT-4 to 1:30 am GMT-5');
});
test('unresolved or malformed times never become a plausible schedule',()=>{
 assert.equal(captureSchedule({status:'review',reason:'AM or PM?'},options).review,'AM or PM?');
 assert.equal(captureSchedule({planned:'invalid'},options).review,'Check this date and time.');
 assert.equal(captureSchedule({plannedDate:'2026-02-30'},options),null);
 assert.equal(captureDuration(null),null);assert.equal(captureDuration(0),null);
});
