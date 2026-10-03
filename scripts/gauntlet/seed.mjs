// A realistic week for the gauntlet screenshots: a student's Saturday weekly review, built through the
// planner's own editPlan so the store is valid. Dates are relative to `now`, so the review always has a last week.
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {editPlan, freshPlanner, shiftDay, localDay} from '../../android-companion/planner-state.mjs';
import {migratePlannerUX} from '../../android-companion/planner-ux.mjs';
import {reviewWeek} from '../../android-companion/review-state.mjs';

export function seedStore(now = new Date()) {
  const data = freshStore();
  data.planner = freshPlanner();
  migratePlannerUX(data);
  const today = localDay(now), week = reviewWeek(today), lastWeek = shiftDay(week, -7);
  const at = (day, hm) => new Date(`${day}T${hm}:00`);
  const save = (collection, fields) => editPlan(data, {type: 'saveEntity', collection, fields});
  const task = (fields, when = now) => editPlan(data, {type: 'saveTask', fields}, when);
  const done = (id, day) => editPlan(data, {type: 'saveTask', id, fields: {done: true}}, at(day, '18:00'));

  const study = save('areas', {title: 'Studies', purpose: 'Learn the craft of development work properly'});
  const health = save('areas', {title: 'Health', purpose: 'Energy to do the work I care about'});
  const build = save('areas', {title: 'Building', purpose: 'Tools that make my own life easier'});
  save('areas', {title: 'Family'});
  const term = save('goals', {title: 'Finish Term 1 with work I am proud of', areaId: study, year: 2026, horizon: 'quarterly', period: 4});
  const isdm = save('projects', {title: 'Term 1 coursework', goalId: term, purpose: 'Every assessment handed in on time and well'});
  const brain = save('projects', {title: 'Second brain', purpose: 'Never re-read a reading to find one idea'});
  const fit = save('goals', {title: 'Run three mornings a week', areaId: health, year: 2026, horizon: 'quarterly', period: 4});
  const runs = save('projects', {title: 'Morning runs', goalId: fit});

  // Last week's Results (chosen in last week's review).
  const sun = shiftDay(today, 1), mon = shiftDay(today, 2), tue = shiftDay(today, 3);
  const critical = save('blocks', {title: 'RM critical review drafted with my group', purpose: 'So Sunday\'s submission is calm, not a 10 PM scramble', projectId: isdm});
  const pmdl = save('blocks', {title: 'PMDL post work ready to submit', purpose: 'Show what the course actually changed in how I lead', projectId: isdm});
  const readings = save('blocks', {title: 'All five RM readings in the second brain', purpose: 'Revise for the quiz from my own notes', projectId: brain});
  const running = save('blocks', {title: 'Three morning runs', purpose: 'Start the day clear-headed', projectId: runs});
  editPlan(data, {type: 'setWeekFocus', week: lastWeek, ids: [critical, pmdl, readings, running]});

  const d = n => shiftDay(lastWeek, n);
  const t1 = task({title: 'Read Snyder (Reading 2) and note the review checklist', blockId: critical, minutes: 60, must: true});
  const t2 = task({title: 'Agree the article and split sections with the group', blockId: critical, minutes: 30});
  task({title: 'Draft my section of the critical review', blockId: critical, minutes: 120, must: true});
  task({title: 'Run the plagiarism report and attach it', blockId: critical, minutes: 20});
  done(t1, d(1)); done(t2, d(2));
  const p1 = task({title: 'Reread PMDL session notes', blockId: pmdl, minutes: 45});
  const p2 = task({title: 'Write the post-work reflection', blockId: pmdl, minutes: 90, must: true});
  task({title: 'Check the upload format on the LMS', blockId: pmdl, minutes: 10});
  done(p1, d(1)); done(p2, d(3));
  for (let i = 1; i <= 5; i++) done(task({title: `Ingest RM Reading ${i}`, blockId: readings, minutes: 40}), d(i - 1));
  const r1 = task({title: 'Run 5 km before class', blockId: running, minutes: 40});
  task({title: 'Run 5 km before class (Thu)', blockId: running, minutes: 40});
  task({title: 'Long run Saturday', blockId: running, minutes: 60});
  done(r1, d(0));

  // Blocks for the coming week, not chosen yet.
  const dad = save('blocks', {title: 'DAD Excel workbook submitted', purpose: 'Prove I can turn data into a clear argument', projectId: isdm});
  task({title: 'Build the three charts for the DAD workbook', blockId: dad, minutes: 120, must: true});
  task({title: 'Write an interpretation under each chart', blockId: dad, minutes: 60});
  const quiz = save('blocks', {title: 'Confident for RM Quiz I', purpose: 'Walk in knowing the seven paradigms cold', projectId: isdm});
  task({title: 'Re-read Reading 1 on the seven paradigms', blockId: quiz, minutes: 45, must: true});
  task({title: 'Sit RM Quiz I', blockId: quiz, minutes: 60, must: true, planned: at(tue, '11:30').toISOString()});
  task({title: 'Make 20 flash cards from my notes', blockId: quiz, minutes: 40});
  task({title: 'Upload the workbook to the LMS', blockId: dad, minutes: 15, must: true, planned: at(mon, '10:15').toISOString()});
  task({title: 'Submit the critical review PDF with the plagiarism report', blockId: critical, minutes: 20, must: true, planned: at(sun, '21:00').toISOString()});
  task({title: 'Upload the PMDL post work', blockId: pmdl, minutes: 15, must: true, plannedDate: sun});
  save('blocks', {title: 'District demographic profile ready', purpose: 'Our group presents real post-2020 data, not guesses', projectId: isdm});
  save('blocks', {title: 'RPM app weekly review I actually use', purpose: 'Plan my week in ten calm minutes', projectId: null});

  // Inbox: loose captures with no Block.
  for (const title of ['Ask the group which district we picked', 'Check the LMS for the critical review article again',
    'Send the RI budget to Mariyam', 'Buy a new notebook for RM', 'Call home on Sunday', 'Clear 5 Oct morning clash: DAD exam vs GWBC'])
    task({title});

  // Today: a few scheduled tasks so Today and the Timeline have a real day.
  task({title: 'Finish my section of the critical review', blockId: critical, minutes: 90, must: true, planned: at(today, '10:00').toISOString()});
  task({title: 'Group call: merge sections', blockId: critical, minutes: 45, planned: at(today, '16:00').toISOString()});
  task({title: 'Weekly review', minutes: 30, planned: at(today, '19:30').toISOString(), recurrence: 'weekly'});
  editPlan(data, {type: 'context', approved: true, vision: 'A calm, capable year: good work at ISDM, a healthy body, tools that serve me.', goals: 'Finish Term 1 well. Run three mornings a week.'});
  data.planner.undo = null;
  return {data, week, lastWeek, today};
}
