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
import {captureWeekday,scheduleChips,addedSummary} from './capture-content.mjs';
test('chips give a weekday date and one time chip with the duration',()=>{
 const item={planned:'2026-10-03T09:00:00Z',end:'2026-10-03T09:30:00Z',minutes:30};
 const s=captureSchedule(item,options),chips=scheduleChips(s,captureWeekday(item,options));
 assert.deepEqual(chips.map(c=>c.label),['Sat 3 Oct','2:30 pm to 3 pm · 30 min']);
});
test('date-only chips say Time not set and never All day',()=>{
 const item={plannedDate:'2026-10-03',minutes:45};
 const chips=scheduleChips(captureSchedule(item,options),captureWeekday(item,options));
 assert.deepEqual(chips.map(c=>c.label),['Sat 3 Oct','Time not set','45 min']);
 assert.equal(chips[1].muted,true);
});
test('overnight chips keep both ends and unresolved times have no chips',()=>{
 const s=captureSchedule({planned:'2026-09-28T17:30:00Z',end:'2026-09-28T19:30:00Z',minutes:120},options);
 assert.deepEqual(scheduleChips(s).map(c=>c.label),['28 Sept · 11 pm','29 Sept · 1 am']);
 assert.deepEqual(scheduleChips(captureSchedule({status:'review',reason:'AM or PM?'},options)),[]);
});
test('added summary says where each new task went',()=>{
 const task=(block)=>({kind:'create',entity:'task',fields:block?[{name:'blockId',op:'set',value:'b1',displayValue:block}]:[]});
 assert.equal(addedSummary([task('Explain the chapter'),task('Explain the chapter'),task(null)]),'3 tasks added · 2 to Explain the chapter, 1 to Inbox');
 assert.equal(addedSummary([task(null)]),'1 task added to Inbox');
 assert.equal(addedSummary([{kind:'update',entity:'task',fields:[]}]),'Change saved');
});
test('proposal times and Result deadlines are absolute days, never Tomorrow beside a weekday',async()=>{
 const {scheduleText,dueText,absoluteDay}=await import('./capture-content.mjs');
 const {clock}=await import('./planner/format.mjs');
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const reference=new Date('2026-10-03T06:00:00');
 const at=new Date('2026-10-04T09:00:00'),end=new Date('2026-10-04T10:00:00');
 assert.equal(scheduleText({planned:at.toISOString()},{timeZone:zone,reference}),'Sun 4 Oct, '+clock(at));
 assert.equal(scheduleText({planned:at.toISOString(),end:end.toISOString(),minutes:60},{timeZone:zone,reference}),`Sun 4 Oct, ${clock(at)}–${clock(end)}`);
 assert.equal(scheduleText({plannedDate:'2026-10-03'},{timeZone:zone,reference}),'Today');
 assert.equal(absoluteDay('2027-01-02','2026-10-03'),'Sat 2 Jan 2027');
 assert.equal(scheduleText({planned:'2026-09-28T08:30:00Z'},{...options,deviceZone:'Europe/London'}),'Mon 28 Sept, 2 pm');
 assert.equal(scheduleText({status:'review',reason:'AM or PM?'},options),null);
 assert.equal(scheduleText(null),null);
 const due=new Date('2026-10-05T10:30:00');
 assert.equal(dueText({at:due,value:'2026-10-05T10:30',overdue:false},'2026-10-03'),'Due Mon 5 Oct, '+clock(due));
 assert.equal(dueText({at:due,value:'2026-10-03',overdue:false},'2026-10-03'),'Due today');
 assert.equal(dueText({label:'Overdue since Fri, Oct 2',overdue:true}),'Overdue since Fri, Oct 2');
 assert.equal(dueText(null),null);
});
