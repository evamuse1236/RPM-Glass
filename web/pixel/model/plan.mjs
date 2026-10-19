/** The snapshot read through the phone's own planner rules, so web and phone agree on what is due and when. */
import {localDay, shiftDay, blockDue, blockTasks, totals} from '../../../android-companion/planner-state.mjs';
import {dayTasks} from '../../../android-companion/planner-ux.mjs';
import {dueInfo, duration, plural} from '../../../android-companion/planner/format.mjs';

export {localDay, shiftDay};

/** The phone's in-memory shape: tasks as entries, Results and the rest under `planner`. */
export function phoneData(snapshot) {
  return {
    entries: snapshot.tasks,
    planner: {schema: 1, blocks: snapshot.blocks, projects: snapshot.projects, goals: snapshot.goals,
      areas: snapshot.areas, events: [], drafts: []},
  };
}

export const openBlocks = snapshot => snapshot.blocks.filter(b => !b.archived);
export const blockOf = (snapshot, id) => (id ? snapshot.blocks.find(b => b.id === id) ?? null : null);

export function resultFacts(snapshot, block, now) {
  const data = phoneData(snapshot);
  const rows = blockTasks(data, block.id);
  const done = rows.filter(t => t.done).length;
  const left = rows.length - done;
  const due = dueInfo(blockDue(data, block.id)?.value, now);
  const mustLeft = totals(rows).must;
  return {rows, done, total: rows.length, left, due, leftText: left ? `${plural(left, 'task')} left` : 'No tasks left',
    mustText: mustLeft ? `${duration(mustLeft)} of Musts left` : null};
}

export const dayOf = (snapshot, day, now) => dayTasks(phoneData(snapshot), day, +now);

export function inboxTasks(snapshot) {
  return snapshot.tasks.filter(t => !t.archived && !t.done && !t.blockId && !t.planned && !t.plannedDate)
    .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.id - b.id);
}

/** Open Results, soonest deadline first, then those without one. */
export function quests(snapshot, now) {
  return openBlocks(snapshot).map(block => ({block, ...resultFacts(snapshot, block, now)}))
    .sort((a, b) => (a.due?.at ?? Infinity) - (b.due?.at ?? Infinity));
}

/** Monday to Sunday around `now`: each day's timed and dated tasks, what was done, and the Results due. */
export function week(snapshot, now) {
  const today = localDay(now);
  const monday = shiftDay(today, -((new Date(today + 'T12:00').getDay() + 6) % 7));
  const dues = quests(snapshot, now).filter(q => q.due && !q.due.overdue);
  return Array.from({length: 7}, (_, i) => {
    const day = shiftDay(monday, i);
    const {active, completed} = dayOf(snapshot, day, now);
    const timed = active.filter(t => t.start).sort((a, b) => a.start - b.start);
    const dated = active.filter(t => !t.start);
    return {day, today: day === today, past: day < today, timed, dated, completed,
      deadlines: dues.filter(q => localDay(q.due.at) === day)};
  });
}

const pad = n => String(n).padStart(2, '0');

/** Where a task goes when moved to `day`: a timed task keeps its clock time, an untimed one gets the day. */
export function moveArgs(task, day) {
  if (day == null) return {taskId: task.id, time: null, day: null};
  if (!task.planned) return {taskId: task.id, time: null, day};
  const at = new Date(task.planned);
  return {taskId: task.id, time: new Date(`${day}T${pad(at.getHours())}:${pad(at.getMinutes())}`).toISOString(), day: null};
}
