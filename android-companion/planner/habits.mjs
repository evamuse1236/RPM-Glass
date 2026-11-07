/**
 * Habits: routines, water and the meal times in one list that shows how today is going, each opening its editor.
 * Every editor is one move from where the user is: this list, a long press on the Today row, or the Edit button on the
 * row's own sheet.
 */
import {WATER_DEFAULTS, rangeText, daysText, clockText, atMinutes, minutesOf, localDay, routineOn,
  routineRowParts, routineState, joinParts, waterStatus} from '../body-state.mjs';
import {duration} from './format.mjs';
import {el, icon, button, iconButton, attrs} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {attachSwipe} from '../task-swipe.mjs';
import {openRoutineEditor} from './routine-editor.mjs';
import {openWaterEditor, openMealEditor} from './habit-editors.mjs';
import {drink} from './water.mjs';
import {logMealNow} from './meals.mjs';
import {openRunSheet} from './routines.mjs';
import {bodyApi} from './body-api.mjs';

const MEAL_PREFIX = 'meal:';
/** A meal's glyph: the Snack time menu item and the next meal's log action; in the list every habit leads with today's
 * progress ring instead. */
const MEAL_ICON = 'restaurant';
const timeWords = hhmm => clockText(atMinutes('2000-01-01', minutesOf(hhmm)));

const SVG = 'http://www.w3.org/2000/svg';
const svgNode = (tag, values) => attrs(document.createElementNS(SVG, tag), values);

/** Today's progress as one ring in the habit's timeline colour (`tone`: water, routine or meal): an arc for the share
 * done (3 of 8 glasses, 3 of 5 steps), a filled disc with a check once the habit is done. */
function progressMark(tone, done, total, {off = false} = {}) {
  const complete = total > 0 && done >= total;
  const svg = svgNode('svg', {class: `habit-ring tone-${tone}${complete ? ' done' : ''}${off ? ' off' : ''}`, viewBox: '0 0 24 24'});
  if (complete) {
    svg.append(svgNode('circle', {class: 'habit-ring-disc', cx: 12, cy: 12, r: 10}),
      svgNode('path', {class: 'habit-ring-check', d: 'M7.5 12.2L10.6 15.2L16.5 9.2'}));
    attrs(svg, {role: 'img', 'aria-label': 'Done today'});
    return svg;
  }
  svg.append(svgNode('circle', {class: 'habit-ring-track', cx: 12, cy: 12, r: 9}));
  const share = total ? Math.round(done / total * 100) : 0;
  if (share) svg.append(svgNode('circle', {class: 'habit-ring-arc', cx: 12, cy: 12, r: 9, pathLength: 100, 'stroke-dasharray': `${share} 100`}));
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/**
 * One habit: today's ring, its name and one quiet line of today's state open the editor. The trailing slot holds a
 * chevron, or on the next thing still to do its one-tap action (log a glass, log the meal, start the routine);
 * `off` dims a meal hidden from Today.
 */
function habitRow(mark, name, summary, open, {off = false, action = null} = {}) {
  const row = el('div', off ? 'habit-row habit-hidden' : 'habit-row');
  const copy = el('span', 'habit-copy');
  copy.append(button(name, open, 'habit-open'));
  if (summary) copy.append(summary instanceof Node ? summary : el('span', 'habit-summary tnum', summary));
  row.append(mark, copy, action ?? icon('chevron_right', {cls: 'habit-chevron'}));
  return row;
}

/** A meal's line: when it was eaten and what, else its planned time, or that it is hidden from Today. */
function mealLine(meal, eaten) {
  if (eaten) {
    const line = el('span', 'habit-summary habit-meal-line tnum', `${clockText(new Date(eaten.at))} · `);
    line.append(el('span', 'habit-logged', eaten.name));
    return line;
  }
  return el('span', 'habit-summary habit-meal-line tnum', timeWords(meal.at) + (meal.on ? '' : ' · Not on Today'));
}

/** The next thing to do gets one countdown in the primary colour, as the timeline gives its next item. */
function addSoon({summary, due, nowWords = 'now'}, now) {
  const minutes = Math.ceil((due - now) / 60000);
  summary.append(' · ', el('span', 'habit-soon', minutes <= 0 ? nowWords : `in ${duration(minutes)}`));
}

/** What the Water row says after the count: when the next glass is due, or that reminders are off. */
function waterNext(status, settings) {
  if (status.reached) return '';
  if (settings.reminders === false) return ' · reminders off';
  return status.nextAt && !status.pending ? ` · next at ${clockText(status.nextAt)}` : '';
}

/** The next thing's one-tap action: its log glyph (a glass, a meal, start) on a tonal disc in the habit's colour, centred
 * where the chevron is, so every row keeps one right edge and the row itself still opens the editor. */
const doButton = (tone, glyph, label, onClick) => iconButton(glyph, label, onClick, {cls: `habit-do tone-${tone}`});

export function openHabits(app, body = bodyApi(app), {motion = 'forward'} = {}) {
  const {body: content} = openSheet(app, 'Habits', {variant: 'choice habits', motion});
  const list = el('div', 'habit-list');
  const add = el('div', 'habit-row habit-add');
  content.append(list, add);
  const back = () => openHabits(app, body, {motion: 'back'});
  const addSnack = async () => {
    try {
      await body.setMealSlot('snack', {on: true});
    } catch (error) {
      notice(app, userMessage(error, "Couldn't save that. Try again."));
      return;
    }
    app.render();
    openMealEditor(app, body, 'snack', {back});
    notice(app, 'Snack time added', {undo: true});
  };
  const addRoutine = () => openRoutineEditor(app, body, null, {back});
  const addButton = button('Add habit', () => {
    if (body.mealTimes().some(m => m.slot === 'snack')) return addRoutine();
    openMenu(addButton, [{label: 'Routine', icon: 'checklist', onClick: addRoutine},
      {label: 'Snack time', icon: MEAL_ICON, onClick: addSnack}], 'Add a habit');
  }, 'habit-open');
  add.append(icon('add', {cls: 'habit-icon'}), addButton);

  const paint = () => {
    if (!content.isConnected) return;
    const now = body.now(), day = localDay(now);
    // Water runs all day, so it leads; routines and meals follow by time. `due` marks what is still to do today.
    const items = [];
    const water = body.water();
    const settings = {...WATER_DEFAULTS, ...water.settings};
    const status = waterStatus({...water, settings, now});
    const waterSummary = el('span', 'habit-summary tnum', `${status.count} of ${status.goal} glasses${waterNext(status, settings)}`);
    items.push({order: -1, due: status.pending ? +now : null, nowWords: 'due now', summary: waterSummary,
      row: action => habitRow(progressMark('water', status.count, status.goal), 'Water', waterSummary,
        () => openWaterEditor(app, body, {back}), {action}),
      act: () => doButton('water', 'water_full', 'Log a glass', () => drink(app, body))});
    for (const routine of body.routines()) {
      const run = body.runFor(routine.id, day);
      const today = routineOn(routine, day) ? routineRowParts(routine, run, now) : undefined;
      const words = today === undefined ? `${rangeText(routine.start, routine.end)} · ${daysText(routine.days)}`
        : today ? joinParts(today.state === 'partly' ? today.parts.slice(1) : today.parts) : 'Skipped today';
      const summary = el('span', 'habit-summary tnum', words);
      const state = routineState(routine, run, now);
      const progress = today ? state.progress : {done: 0, total: 0};
      const due = today?.state === 'upcoming' ? +state.start : today?.state === 'running' ? +now : null;
      items.push({order: minutesOf(routine.start), due, summary,
        row: action => habitRow(progressMark('routine', progress.done, progress.total), routine.name, summary,
          () => openRoutineEditor(app, body, routine.id, {back}), {action}),
        act: () => doButton('routine', 'play_arrow', `Start ${routine.name}`, () => openRunSheet(app, body, routine.id))});
    }
    const logged = body.meals().filter(m => localDay(m.at) === day && m.state !== 'skipped' && String(m.name ?? '').trim())
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const plan = body.mealTimes();
    for (const meal of plan) {
      const eaten = logged.filter(m => m.slot === meal.slot).at(-1);
      const summary = mealLine(meal, eaten);
      const at = atMinutes(day, minutesOf(meal.at));
      items.push({order: minutesOf(meal.at), due: !eaten && meal.on && at > now ? +at : null, summary,
        row: action => habitRow(progressMark('meal', eaten ? 1 : 0, 1, {off: !meal.on}), meal.name, summary,
          () => openMealEditor(app, body, meal.slot, {back}), {off: !meal.on, action}),
        act: () => doButton('meal', MEAL_ICON, `Log ${meal.name.toLowerCase()}`, () => logMealNow(app, body, meal.slot, meal.name))});
    }
    const next = items.filter(item => item.due !== null).sort((a, b) => a.due - b.due)[0];
    if (next) addSoon(next, now);
    list.replaceChildren(...items.sort((a, b) => a.order - b.order).map(item => item.row(item === next ? item.act() : null)));
    addButton.textContent = plan.some(m => m.slot === 'snack') ? 'Add routine' : 'Add habit';
  };
  paint();
  app.sheetRefresh = paint;
}

/** Open one habit's editor: 'water', 'meal:<slot>', or a routine's id. Unknown ids open the list. */
export function openHabit(app, id, {body = bodyApi(app), back = null} = {}) {
  if (id === 'water') return openWaterEditor(app, body, {back});
  if (String(id).startsWith(MEAL_PREFIX)) {
    const slot = String(id).slice(MEAL_PREFIX.length);
    if (body.mealTimes().some(s => s.slot === slot)) return openMealEditor(app, body, slot, {back});
  } else if (body.routine(id)) return openRoutineEditor(app, body, id, {back});
  return openHabits(app, body);
}

/** Holding a Today row (water, a meal, a routine) opens its editor. */
export function holdToEdit(app, node, id, sides = {}) {
  attachSwipe(node, {...sides, hold: () => openHabit(app, id), haptic: () => app.api.native('haptic').catch(() => {})});
}

