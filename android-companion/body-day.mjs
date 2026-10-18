/**
 * The preview's "Day" layout of Today: the date, the week strip and week line, then the whole day by time
 * (day-model.mjs, drawn by planner/day-view.mjs). It opens at now; the top bar collapses and offers "Now".
 */
import {buildDay} from './day-model.mjs';
import {daySample} from './body-day-samples.mjs';
import {localDay, waterStatus, routineProgress, clockText} from './body-state.mjs';
import {dayCanvas, taskRow, fitCards} from './planner/day-view.mjs';
import {el, icon, button, emptyState, listItem} from './planner/dom.mjs';
import {longDate, duration} from './planner/format.mjs';
import {todaysRoutines, openRunSheet} from './planner/routines.mjs';
import {drink, openWaterSheet} from './planner/water.mjs';
import {openMealSheet} from './planner/meals.mjs';
import {openSheet, closeSheet} from './planner/sheet.mjs';
import {notice} from './planner/snackbar.mjs';
import {spanText} from './day-parts.mjs';

const OPEN_OFFSET = 160;
const state = {scenario: null, sample: null, early: false, openedFor: null, observers: [], model: null, ctx: null};
const smooth = () => matchMedia('(prefers-reduced-motion: no-preference)').matches;

function model({body, settings}) {
  const now = body.now(), day = localDay(now);
  if (state.scenario !== settings.day) {
    state.scenario = settings.day;
    state.sample = daySample(settings.day, day);
    state.early = false;
  }
  const routines = todaysRoutines(body).map(({routine, row}) => ({...routine, state: row.state,
    progress: routineProgress(routine, body.runFor(routine.id))}));
  const water = body.water();
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 96;
  return buildDay({day, now: +now, ...state.sample, routines, meals: body.meals().filter(m => localDay(m.at) === day),
    water: {...water, glasses: water.glasses.map(g => new Date(g)), status: waterStatus({...water, now})},
    size, large: document.documentElement.dataset.largeText === 'true', early: state.early});
}

function header(now) {
  const head = el('div', 'day-header');
  const line = el('div', 'date-line');
  const date = button('', null, 'date-button');
  date.append(el('span', '', longDate(localDay(now))), icon('arrow_drop_down'));
  line.append(date);
  const strip = el('div', 'week-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Next seven days');
  for (let i = 0; i < 7; i++) {
    const d = new Date(+now + i * 864e5);
    const cell = button('', null, 'week-day' + (i ? '' : ' is-today'));
    cell.setAttribute('aria-pressed', String(!i));
    const marks = el('span', 'day-marks');
    if (i === 2) marks.append(icon('hourglass_bottom', {fill: true, cls: 'day-due'}));
    else if (i % 3 !== 1) marks.append(el('span', 'day-dot'));
    cell.append(el('span', 'week-letter', d.toLocaleDateString([], {weekday: 'narrow'})),
      el('span', 'week-number tnum', String(d.getDate())), marks);
    strip.append(cell);
  }
  const week = button('', null, 'week-line');
  const copy = el('span', 'week-line-text');
  copy.append(el('span', 'week-line-lead', '3 Results this week'), el('span', 'sep', ' · '), el('span', 'phrase', '1 achieved'));
  week.append(icon('event_upcoming', {cls: 'leading'}), copy, icon('chevron_right', {cls: 'trailing'}));
  head.append(line, strip, week);
  return head;
}

function handlers(app, body) {
  const rerender = () => app.render();
  const toggleTask = task => {
    task.done = !task.done;
    rerender();
    notice(app, task.done ? `Done · ${task.title}` : `Not done · ${task.title}`);
  };
  const facts = (sheet, lines) => sheet.body.append(...lines.map(text => el('p', 'body-helper tnum', text)));
  const on = {
    toggleTask,
    openTask(task) {
      const sheet = openSheet(app, task.title);
      facts(sheet, [task.start ? `${clockText(task.start)} · ${duration(task.minutes)}` : `No time · ${duration(task.minutes)}`,
        `Part of ${task.result ?? 'No block'}`]);
      sheet.actions.append(button(task.done ? 'Mark incomplete' : 'Mark complete', () => { closeSheet(app); toggleTask(task); }, 'filled-btn'));
    },
    openEvent: event => facts(openSheet(app, event.title), [spanText(event.start, event.end), 'Calendar event · read-only']),
    resolve(item) {
      const sheet = openSheet(app, 'Clash · ' + spanText(item.start, item.end));
      const others = state.model.items.filter(i => i.kind === 'event' && i.start < item.end && item.start < i.end);
      facts(sheet, [...others.map(i => `${i.event.title} · ${i.time}`), `${item.task.title} · ${spanText(item.start, item.end)} · can move`]);
    },
    more(group) {
      const sheet = openSheet(app, `${clockText(group.start)} · ${group.keys.length} items`);
      for (const item of state.model.items.filter(i => group.keys.includes(i.key))) {
        const title = item.task?.title ?? item.event?.title ?? item.label;
        sheet.body.append(listItem({headline: title, supporting: item.time ?? spanText(item.start, item.end),
          onClick: () => (item.task ? on.openTask(item.task) : on.openEvent(item.event))}));
      }
    },
    schedule(slots) {
      for (const {task, start} of slots) task.start = start;
      rerender();
      notice(app, `Scheduled ${spanText(slots[0].start, slots.at(-1).start + slots.at(-1).task.minutes * 60000)}`);
    },
    unfoldEarly: () => { state.early = true; rerender(); },
    openRoutine: id => openRunSheet(app, body, id),
    openWater: () => openWaterSheet(app, body),
    drink: () => drink(app, body),
    openMeal: slot => openMealSheet(app, body, {mealId: slot.meal?.id ?? null}),
  };
  return on;
}

function jumpToNow(app, animate) {
  const line = app.dom.work.querySelector('.day-now');
  if (!line) return;
  const top = line.getBoundingClientRect().top - app.dom.scroll.getBoundingClientRect().top + app.dom.scroll.scrollTop - OPEN_OFFSET;
  app.dom.scroll.scrollTo({top: Math.max(0, top), behavior: animate && smooth() ? 'smooth' : 'instant'});
}

/** After the page is in the document: the bar's subtitle and Now button, what is in view, and opening at now. */
function mount(app, model, {entering}) {
  const {bar, planner, scroll, work} = app.dom;
  const title = bar.querySelector('.top-title');
  if (title) {
    title.classList.add('with-subtitle', 'day-bar-title');
    title.replaceChildren(el('span', 'top-title-text', 'Today'), el('span', 'top-subtitle tnum', model.now.label));
    const jump = button('Now', () => jumpToNow(app, true), 'text-btn day-jump');
    jump.setAttribute('aria-label', 'Jump to now, ' + model.now.label);
    bar.append(jump);
  }
  state.observers.forEach(o => o.disconnect());
  const watch = (selector, key) => {
    const target = work.querySelector(selector);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => { planner.dataset[key] = String(!entry.isIntersecting); }, {root: scroll});
    observer.observe(target);
    state.observers.push(observer);
  };
  watch('.day-page .date-line', 'dayCollapsed');
  watch('.day-now', 'nowOff');
  const canvas = work.querySelector('.day-canvas');
  if (canvas) requestAnimationFrame(() => fitCards(canvas));
  if (entering && model.empty) scroll.scrollTop = 0;
  else if (entering) jumpToNow(app, false);
}

export function renderDay(app, body, page, settings) {
  const key = [settings.day, settings.clock, document.documentElement.dataset.largeText].join('|');
  const entering = !app.dom.work.querySelector('.day-canvas') || state.openedFor !== key;
  state.openedFor = key;
  state.ctx = {app, body, settings};
  const on = handlers(app, body);
  const day = state.model = model({body, settings});
  page.classList.add('day-page');
  page.append(header(body.now()));
  if (day.empty) page.append(emptyState({symbol: 'wb_sunny', title: 'Nothing planned for today', body: 'Start with a Result that matters, then choose its first task.'}));
  if (day.early) {
    const fold = button('', on.unfoldEarly, 'day-early');
    fold.append(icon('unfold_more'), el('span', '', day.early.label));
    fold.setAttribute('aria-label', day.early.label + '. Show those hours');
    page.append(fold);
  }
  page.append(dayCanvas(day, on));
  if (day.anytime.length) {
    const group = el('section', 'day-anytime');
    group.append(el('h2', 'day-anytime-head', 'Anytime'), ...day.anytime.map(task => taskRow(task, on)));
    page.append(group);
  }
  queueMicrotask(() => mount(app, day, {entering}));
}

/** Every 30 s: move the now line in place; a change in what is past or next redraws the day. */
function tick() {
  if (!state.ctx || !document.querySelector('.day-now')) return;
  const {app} = state.ctx;
  const next = model(state.ctx);
  const shape = m => JSON.stringify([m.doNext?.id, m.items.map(i => i.past), !!m.insert, m.from, m.to]);
  if (shape(next) !== shape(state.model)) return app.render();
  state.model = next;
  const line = document.querySelector('.day-now');
  line.style.setProperty('--y', next.now.y + 'px');
  line.setAttribute('aria-label', 'Now, ' + next.now.label);
  line.querySelector('.day-now-time').textContent = next.now.time;
  const sub = app.dom.bar.querySelector('.day-bar-title .top-subtitle');
  if (sub) sub.textContent = next.now.label;
  const flag = document.querySelector('.do-next .flag-next');
  if (flag && next.doNext) flag.textContent = next.doNext.label;
}
setInterval(tick, 30000);
Object.assign(window, {bodyDay: {tick, state}});
