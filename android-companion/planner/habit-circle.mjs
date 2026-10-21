/**
 * The habit circle above Today's Add: the one habit due now (habit-priority.mjs), drawn as a segmented meter
 * (habit-meter.mjs). Water logs a glass in place with Undo, and a hold opens the Water sheet; a meal opens its Log a
 * meal sheet. Nothing due, no circle. Changes play one after another: a glass pours in or a meal is served, then the
 * circle leaves and the next habit rises from the +. While a sheet is open the circle waits for it to close.
 */
import {topHabit, habitMeters} from '../habit-priority.mjs';
import {attachSwipe} from '../task-swipe.mjs';
import {button} from './dom.mjs';
import {bodyApi} from './body-api.mjs';
import {drink, openWaterSheet} from './water.mjs';
import {openMealSheet} from './meals.mjs';
import {waterSVG, mealSVG, settleGlass, serveMeal, enterCircle, leaveCircle} from './habit-meter.mjs';
import {animateGlass} from './glass-animation.mjs';

const REFRESH = 30000;
const shows = app => !app.current() && app.state.tab === 'today';
const circle = {shown: undefined, node: null, queue: Promise.resolve(), busy: false};

function look(app) {
  if (!shows(app)) return {top: null, meters: null};
  const body = bodyApi(app), now = body.now();
  const input = {water: body.water(), meals: body.meals(), mealPlan: body.mealPlan()};
  const top = topHabit(input, now), meters = habitMeters(input, now);
  if (!top) return {top: null, meters};
  if (top.kind === 'water') {
    return {meters, top: {kind: 'water', key: 'water', count: top.count, goal: top.goal,
      label: `Water, ${top.count} of ${top.goal} glasses. Log a glass`}};
  }
  const {slots, logged} = meters.meals;
  return {meters, top: {kind: 'meal', key: 'meal:' + top.slot, slot: top.slot, slots: slots.length, index: slots.indexOf(top.slot),
    logged: logged.map(slot => slots.indexOf(slot)), label: `${top.name} not logged. Log ${top.name.toLowerCase()}`}};
}

const drawing = habit => (habit.kind === 'water' ? waterSVG(habit.count, habit.goal) : mealSVG(habit.slots, habit.logged));
const sameDrawing = (a, b) => (a.kind === 'water' ? a.count === b.count && a.goal === b.goal
  : a.slots === b.slots && a.logged.join() === b.logged.join());
const svg = () => circle.node.querySelector('svg');

async function pour(from, to) {
  const drawing = svg();
  await animateGlass(drawing, from, to);
  settleGlass(drawing, to);
}

function draw(habit) {
  circle.node.innerHTML = drawing(habit);
  circle.node.dataset.habit = habit.kind;
}

function make(app, slot) {
  const body = bodyApi(app);
  const node = button('', () => tap(app, slot, body), 'habit-circle');
  attachSwipe(node, {hold: () => { if (circle.shown?.kind === 'water') openWaterSheet(app, body); },
    haptic: () => app.api.native('haptic', {kind: 'hold'}).catch(() => {})});
  return node;
}

/** Water starts pouring at once; the save follows, and a failed save redraws the glass that was not logged. */
async function tap(app, slot, body) {
  const habit = circle.shown;
  if (!habit || circle.busy) return;
  if (habit.kind === 'meal') return openMealSheet(app, body, {slot: habit.slot});
  circle.busy = true;
  const from = habit.count;
  circle.shown = {...habit, count: from + 1};
  circle.queue = circle.queue.then(() => pour(from, from + 1));
  await drink(app, body);
  paintHabit(app, slot);
  await circle.queue;
  circle.busy = false;
}

async function step(app, slot) {
  if (circle.shown && !app.dom.sheet.hidden) return;
  const {top, meters} = look(app);
  const was = circle.shown;
  if (was && top && was.key === top.key) {
    if (!sameDrawing(was, top)) {
      if (top.kind === 'water' && top.count === was.count + 1 && top.goal === was.goal) await pour(was.count, top.count);
      else draw(top);
    }
    circle.shown = top;
    circle.node.setAttribute('aria-label', top.label);
    return;
  }
  if (was && circle.node) {
    if (was.kind === 'water' && meters?.water.count === was.count + 1) await pour(was.count, was.count + 1);
    if (was.kind === 'meal' && meters?.meals.logged.includes(was.slot)) await serveMeal(svg(), was.index);
    await leaveCircle(circle.node);
    circle.node.remove();
    circle.node = null;
  }
  const first = circle.shown === undefined;
  circle.shown = top;
  app.dom.planner.dataset.habit = String(!!top);
  if (!top) return;
  circle.node = make(app, slot);
  draw(top);
  circle.node.setAttribute('aria-label', top.label);
  slot.append(circle.node);
  if (!first) await enterCircle(circle.node);
}

/** Looks again at what is due; each look waits for the motion before it. */
export function paintHabit(app, slot) {
  circle.queue = circle.queue.then(() => step(app, slot)).catch(() => {});
  return circle.queue;
}

/** Water and meals come due as time passes, and a meal logged from its sheet shows once the sheet closes. */
export function watchHabit(app, slot) {
  setInterval(() => { if (slot.isConnected) paintHabit(app, slot); }, REFRESH);
  new MutationObserver(() => { if (app.dom.sheet.hidden) paintHabit(app, slot); })
    .observe(app.dom.sheet, {attributes: true, attributeFilter: ['hidden']});
}
