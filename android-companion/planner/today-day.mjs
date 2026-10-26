/**
 * Today's sheet on the real plan: the anytime chips, then the timeline (spine-model.mjs, drawn by spine-view.mjs) with
 * the day's tasks, calendar events, Routines, meals and Result deadlines. It opens with now in view; a floating Now
 * button returns there.
 */
import {buildSpine} from '../spine-model.mjs';
import {routineOn, routineState, doneAll, usualMeals} from '../body-state.mjs';
import {localDay, blockDue, timelineItems} from '../planner-state.mjs';
import {dayTasks} from '../planner-ux.mjs';
import {spineList, spineRow, anytimeChips} from './spine-view.mjs';
import {anytimeLabel} from '../spine-model.mjs';
import {el, icon, button, emptyState} from './dom.mjs';
import {dueInfo} from './format.mjs';
import {notice} from './snackbar.mjs';
import {toggleDone} from './task-row.mjs';
import {attachRowGestures} from './row-gestures.mjs';
import {attachSpineDrag} from './spine-drag-ui.mjs';
import {repeats} from '../planner-recurrence.mjs';
import {openRunSheet} from './routines.mjs';
import {openMealSheet} from './meals.mjs';
import {holdToEdit} from './habits.mjs';
import {bodyApi} from './body-api.mjs';
import {openResults} from './today-model.mjs';
import {dueDay} from './today-header.mjs';

const OPEN_OFFSET = 160;
const state = {model: null, app: null, observer: null, timer: null};

function dayTask(app, task, done) {
  const at = task.start ?? (task.planned ? Date.parse(task.occurrence ?? task.planned) : null);
  const start = at != null && localDay(at) === app.state.day ? at : null;
  const block = app.p().blocks.find(b => b.id === task.blockId);
  return {id: task.id, title: task.title, start, minutes: task.minutes ?? null, done, must: !!task.must, result: block?.title ?? null,
    tone: app.tone(app.context(task).area), occurrence: task.occurrence, ref: task};
}

function dayRoutines(body, day, now) {
  return body.routines().filter(r => routineOn(r, day)).map(routine => {
    const run = body.runFor(routine.id, day) ?? {routineId: routine.id, day, marks: {}};
    const {state: runState, progress} = routineState(routine, run, now);
    return {...routine, state: runState, progress};
  }).filter(r => r.state !== 'skipped');
}

function spineModel(app) {
  const {day, calendar = []} = app.state;
  const data = app.data(), body = bodyApi(app), now = new Date(), live = day === localDay(now);
  const listed = dayTasks(data, day);
  const tasks = [...listed.active.map(t => dayTask(app, t, false)), ...listed.completed.map(t => dayTask(app, t, true))];
  const events = timelineItems(data, day, calendar).filter(item => item.source === 'calendar');
  const deadlines = openResults(data).filter(block => dueDay(data, block) === day)
    .map(block => ({id: block.id, title: block.title, at: +dueInfo(blockDue(data, block.id).value, now).at}));
  return {
    model: buildSpine({day, now: +now, live, tasks, events: events.filter(e => !e.allDay), deadlines,
      routines: dayRoutines(body, day, now), meals: body.meals().filter(m => localDay(m.at) === day),
      window: body.water().settings, mealPlan: body.mealPlan()}),
    allDay: events.filter(e => e.allDay),
  };
}

async function toggleRoutine(app, body, row) {
  const routine = body.routine(row.routine.id);
  if (!routine) return;
  const run = body.runFor(routine.id, app.state.day);
  const next = row.done ? {routineId: routine.id, day: app.state.day, marks: {}} : doneAll(routine, run, new Date());
  try {
    await body.saveRun({...next, day: app.state.day});
  } catch {
    notice(app, "Couldn't save that. Try again.");
    return;
  }
  app.render();
  notice(app, row.done ? `${routine.name} reopened` : `${routine.name} done`, {undo: true});
}

/** Swipe right on a meal not yet logged: log it now as the usual food for that meal, with Undo; with none yet, the sheet. */
async function logMealNow(app, body, row) {
  const [usual] = usualMeals(body.meals(), row.slot);
  if (!usual) return openMealSheet(app, body, {mealId: null, slot: row.slot});
  try {
    await body.saveMeal({name: usual, slot: row.slot, at: new Date().toISOString()});
  } catch {
    notice(app, "Couldn't save that. Try again.");
    return false;
  }
  app.render();
  notice(app, `${row.label.split(' · ')[0]} logged · ${usual}`, {undo: true});
  return true;
}

function toggleTask(app, row) {
  const node = app.dom.work.querySelector(`.spine-row[data-key="${CSS.escape(row.key)}"]`);
  node?.classList.toggle('done', !row.done);
  node?.classList.toggle('just-done', !row.done);
  node?.querySelector('.spine-check')?.setAttribute('aria-checked', String(!row.done));
  return toggleDone(app, row.task.ref, row.task.occurrence);
}

/** A timed task that does not repeat can be moved and resized on the spine; a repeat is changed from its sheet. */
const movable = row => row.start != null && !row.done && !repeats(row.task.ref);

function handlers(app) {
  const body = bodyApi(app);
  return {
    toggleTask: row => toggleTask(app, row),
    gestures: (card, row) => attachRowGestures(app, card, row.task.ref, {leave: false, hold: !movable(row),
      complete: () => toggleTask(app, row)}),
    drag: (card, row) => { if (movable(row)) attachSpineDrag(app, card, row, {dayStart: Date.parse(app.state.day + 'T00:00:00')}); },
    openTask: task => app.actions.openTask(task.id, task.occurrence),
    openEvent: event => app.actions.calendarDetails(event),
    resolve(row) {
      const others = state.model.rows.filter(r => r.kind === 'event' && r.start < row.end && row.start < r.end);
      app.actions.resolveClash([{...row.task.ref, source: 'rpm', start: row.start, end: row.end, occurrence: row.task.occurrence},
        ...others.map(r => ({...r.event, source: 'calendar'}))].sort((a, b) => a.start - b.start));
    },
    toggleRoutine: row => toggleRoutine(app, body, row),
    openRoutine: id => openRunSheet(app, body, id, app.state.day),
    openMeal: row => openMealSheet(app, body, {mealId: row.meal?.id ?? null, slot: row.slot}),
    holdHabit: (node, id, sides) => holdToEdit(app, node, id, sides),
    logMealNow: row => logMealNow(app, body, row),
    plan: row => app.actions.addTask({planned: new Date(row.plan).toISOString(), plannedDate: app.state.day}),
  };
}

/** All-day events and the tasks with no time, as one strip of chips above the timeline. */
function chips(app, allDay, anytime, on) {
  const row = el('div', 'spine-chips');
  row.dataset.key = 'chips';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', anytime.length ? anytimeLabel(anytime, app.state.day === localDay()) : 'All day');
  for (const event of allDay) {
    const chip = button('', () => app.actions.calendarDetails(event), 'spine-chip outlined');
    chip.dataset.key = 'allday:' + (event.id ?? event.title);
    chip.append(icon('event'), el('span', 'chip-label', event.title));
    chip.setAttribute('aria-label', `${event.title}, all day, calendar event`);
    row.append(chip);
  }
  row.append(...anytimeChips(anytime, on));
  return row.children.length ? row : null;
}

export function renderDay(app, page) {
  const {model, allDay} = spineModel(app);
  state.model = model;
  state.app = app;
  const on = handlers(app);
  const top = chips(app, allDay, model.anytime, on);
  if (top) page.append(top);
  if (model.empty) {
    page.append(emptyState({symbol: 'wb_sunny', title: model.nowKey ? 'Nothing planned for today' : 'Nothing planned for this day',
      body: 'Start with a Result that matters, then choose its first task.', action: () => app.actions.newEntity('blocks'),
      label: 'Plan a Block', secondary: button('Add a task', () => app.actions.addTask({plannedDate: app.state.day}), 'text-btn')}));
  }
  page.append(spineList(model, on));
  state.timer ??= setInterval(tick, 30000);
  requestAnimationFrame(() => watchNow(app));
}

const nowNode = app => (state.model?.nowKey
  ? app.dom.work.querySelector(`.spine > [data-key="${CSS.escape(state.model.nowKey)}"]`) : null);

/** The floating Now button shows while now is out of view (day.css reads `data-now-off`). */
function watchNow(app) {
  const root = app.dom.planner;
  state.observer?.disconnect();
  state.observer = null;
  const target = nowNode(app);
  root.dataset.nowOff = 'false';
  if (!target) return;
  state.observer = new IntersectionObserver(([entry]) => { root.dataset.nowOff = String(!entry.isIntersecting); },
    {root: app.dom.scroll});
  state.observer.observe(target);
}

/** Where Today opens: at the top when now is already in view above the tab bar, otherwise now 160 px below the top. */
export function dayScroll(app) {
  const target = nowNode(app);
  if (!target) return 0;
  const view = app.dom.scroll.getBoundingClientRect();
  const top = target.getBoundingClientRect().top - view.top + app.dom.scroll.scrollTop;
  const room = view.height - (parseFloat(getComputedStyle(app.dom.planner).getPropertyValue('--nav-measured')) || 0);
  return top + target.offsetHeight <= room ? 0 : Math.max(0, top - OPEN_OFFSET);
}

export function jumpToNow(app) {
  const smooth = matchMedia('(prefers-reduced-motion: no-preference)').matches;
  app.dom.scroll.scrollTo({top: dayScroll(app), behavior: smooth ? 'smooth' : 'instant'});
}

/** Every 30 s: rows whose words changed are redrawn in place; a change in what is past, now or next redraws the day. */
function tick() {
  const app = state.app;
  const list = app?.dom.work.querySelector('.spine');
  if (!list || !app.dom.sheet.hidden) return;
  const next = spineModel(app).model;
  if (next.shape !== state.model.shape) return app.render();
  state.model = next;
  const on = handlers(app);
  for (const row of next.rows) {
    const old = list.querySelector(`:scope > [data-key="${CSS.escape(row.key)}"]`);
    const fresh = spineRow(row, on);
    fresh.setAttribute('role', old?.getAttribute('role') ?? 'listitem');
    if (old && old.outerHTML !== fresh.outerHTML) old.replaceWith(fresh);
  }
  watchNow(app);
}
