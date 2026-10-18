/** Sample tasks, calendar events and deadlines for the preview's "Day" layout, one set per scenario. */
import {atMinutes, minutesOf} from './body-state.mjs';

const LAB = ['Physics lab report submitted', 'area-2'];
const QUIZ = ['Chemistry quiz revised', 'area-3'];
const ADMIN = ['Life admin sorted', 'area-1'];

function maker(day) {
  const at = time => +atMinutes(day, minutesOf(time));
  const task = (id, title, time, minutes, [result, tone] = [null, 'neutral'], done = false) =>
    ({id, title, start: time ? at(time) : null, minutes, result, tone, done});
  const event = (id, title, from, to) => ({id, title, start: at(from), end: at(to)});
  return {at, task, event};
}

function plan(day, done = false) {
  const {at, task, event} = maker(day);
  return {
    tasks: [
      task('revise', 'Revise chapter 4 notes', '09:15', 30, QUIZ, done),
      task('bank', 'Call the bank about the card', '10:30', 15, ADMIN, done),
      task('partner', 'Email lab partner the data', '11:30', 15, LAB, true),
      task('draft', 'Draft the method section', '14:00', 45, LAB, done),
      task('tomorrow', 'Plan tomorrow', '21:00', 15, undefined, done),
      ...(done ? [] : [
        task('supervisor', 'Email supervisor about the deadline', null, 15, LAB),
        task('summary', 'Read the chapter 3 summary', null, 20, QUIZ),
        task('refs', 'Clean up the reference list', null, 60, LAB),
      ]),
    ],
    events: [event('reading', 'Reading group', '09:00', '10:00'), event('lecture', 'Physics lecture', '15:00', '16:30'),
      event('gym', 'Gym', '18:00', '19:00')],
    deadlines: [{id: 'quiz', title: 'RM Quiz I', at: at('17:00'), achieved: done}],
  };
}

function packed(day) {
  const {at, task, event} = maker(day);
  return {
    tasks: [
      task('run', 'Morning run', '06:00', 30, ADMIN),
      task('revise', 'Revise chapter 4 notes', '09:15', 30, QUIZ),
      task('form', 'Fill in the lab safety form', '11:15', 30, LAB),
      task('supervisor', 'Email supervisor about the deadline', '12:15', 15, LAB),
      task('outline', 'Outline the discussion section', '13:00', 45, LAB),
      task('draft', 'Draft the method section', '14:00', 45, LAB),
      task('worksheet', 'Finish the chemistry worksheet', '19:30', 60, QUIZ),
      task('tomorrow', 'Plan tomorrow', '21:00', 15),
      task('refs', 'Clean up the reference list', null, 60, LAB),
      task('dentist', 'Book a dentist appointment', null, 10, ADMIN),
    ],
    events: [event('reading', 'Reading group', '09:00', '10:00'), event('seminar', 'Department seminar', '09:30', '10:30'),
      event('lab', 'Lab meeting', '11:00', '12:00'), event('lecture', 'Physics lecture', '15:00', '16:30'),
      event('tutorial', 'Maths tutorial', '16:00', '17:00'), event('gym', 'Gym', '18:00', '19:00')],
    deadlines: [{id: 'sheet', title: 'Chem worksheet draft', at: at('12:00'), achieved: false},
      {id: 'quiz', title: 'RM Quiz I', at: at('17:00'), achieved: false}],
  };
}

export function daySample(scenario, day) {
  if (scenario === 'empty') return {tasks: [], events: [], deadlines: []};
  if (scenario === 'packed') return packed(day);
  return plan(day, scenario === 'done');
}
