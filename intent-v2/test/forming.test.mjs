import test from 'node:test';
import assert from 'node:assert/strict';
import {readForming,formingClauses} from '../src/forming.mjs';

const now=new Date('2026-10-20T10:00:00+05:30');
const read=text=>readForming(text,{now});
const local=iso=>{const d=new Date(iso);return `${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;};

test('one task: the day, the clock and a reminder with its lead time',()=>{
 const [task,...more]=read('Call Amma tomorrow at 6 pm, remind me 10 min before');
 assert.equal(more.length,0);
 assert.equal(task.title,'Call Amma');
 assert.equal(task.plannedDate,'2026-10-21');
 assert.equal(local(task.planned),'21 18:00');
 assert.equal(task.alert,'reminder');
 assert.equal(task.leadMinutes,10);
 assert.equal(task.minutes,null,'a lead time is not the task’s length');
});

test('a long sentence gives one reading per task, in order',()=>{
 const tasks=read('Past paper section B on Thursday at 5 pm, must. Run 3 km every morning at 6 am. Email Prof Rao about the citation format');
 assert.deepEqual(tasks.map(t=>t.title),['Past paper section B','Run 3 km','Email Prof Rao about the citation format']);
 assert.equal(local(tasks[0].planned),'22 17:00');
 assert.equal(tasks[0].must,true);
 assert.equal(tasks[1].recurrence,'daily');
 assert.equal(local(tasks[1].planned),'21 6:00');
 assert.equal(tasks[1].must,false);
 assert.deepEqual([tasks[2].planned,tasks[2].plannedDate,tasks[2].alert,tasks[2].must],[null,null,null,false]);
});

test('an alarm: "wake me" is a morning clock that rings',()=>{
 const [task]=read('Wake me at 6:30 with an alarm for the RM quiz');
 assert.equal(task.title,'Wake up for the RM quiz');
 assert.equal(local(task.planned),'21 6:30');
 assert.equal(task.alert,'alarm');
});

test('each chip kind reads on its own',()=>{
 assert.equal(read('Read chapter 3 for 45 minutes')[0].minutes,45);
 assert.equal(read('Read chapter 3 for an hour')[0].minutes,60);
 assert.equal(read('Must submit the form by Friday')[0].must,true);
 assert.equal(read('Must submit the form by Friday')[0].plannedDate,'2026-10-23');
 assert.equal(read('Water plants every Monday at 8 am')[0].recurrence,'weekly');
 assert.equal(read('Water plants every Monday at 8 am')[0].plannedDate,'2026-10-26');
 assert.equal(read('Stretch every weekday')[0].recurrence,'weekdays');
 assert.equal(read('Change the filter every 3 days')[0].repeatAfterDays,3);
 const reminder=read('Remind me in 10 minutes to stretch')[0];
 assert.deepEqual([reminder.title,reminder.alert,local(reminder.planned)],['Stretch','reminder','20 10:10']);
 assert.deepEqual([read('set an alarm for 7 am')[0].title,read('set an alarm for 7 am')[0].alert],['Alarm','alarm']);
 assert.equal(read('Call Amma tomorrow')[0].planned,null,'a day alone names no clock');
 assert.equal(read('Call Amma tomorrow')[0].plannedDate,'2026-10-21');
});

test('what was not said stays unread',()=>{
 const [bank]=read('call the bank, no alarm');
 assert.deepEqual([bank.title,bank.alert],['Call the bank',null]);
 const [eggs]=read('buy 9 eggs tonight');
 assert.equal(eggs.planned,null,'a quantity is never a clock');
 assert.equal(eggs.minutes,null);
 assert.equal(read('Remind me 10 min before').length,1);
 assert.equal(read('Remind me 10 min before')[0].leadMinutes,10);
 assert.deepEqual(read('What is planned today?'),[],'a question is not a task');
 assert.deepEqual(read('C'),[]);
});

test('sentences split at a stop followed by a space, never inside a clock',()=>{
 assert.deepEqual(formingClauses('Call at 5.30 pm. Buy milk!\nRun'),['Call at 5.30 pm.','Buy milk!','Run']);
 assert.equal(read('a. b. c. d. e. f. g. Buy milk at 6 pm').length<=6,true);
});
