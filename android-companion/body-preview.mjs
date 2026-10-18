import {localDay, atMinutes, minutesOf} from './body-state.mjs';
import {el, icon, button, iconButton, sectionHeader} from './planner/dom.mjs';
import {installSheetKeys, isSheetOpen, dismissSheet} from './planner/sheet.mjs';
import {openMenu, closeMenu} from './planner/menu.mjs';
import {listRow, phrase, sep} from './planner/today-row.mjs';
import {longDate} from './planner/format.mjs';
import {todaysRoutines, routineBlock, routineRow} from './planner/routines.mjs';
import {openRoutineEditor} from './planner/routine-editor.mjs';
import {waterRow} from './planner/water.mjs';
import {mealRow} from './planner/meals.mjs';
import {renderHistory} from './planner/history.mjs';
import {renderDay} from './body-day.mjs';

const root = document.documentElement;
const today = localDay(new Date());
const dayBefore = n => localDay(new Date(Date.now() - n * 864e5));
const iso = (time, day = today) => atMinutes(day, minutesOf(time)).toISOString();

const SAMPLES = {
  clock: [['06:30', '6:30 AM'], ['07:10', '7:10 AM'], ['13:10', '1:10 PM'], ['21:30', '9:30 PM']],
  routine: [['some', '3 done, 1 skipped'], ['none', 'Nothing ticked'], ['all', 'All done'], ['skipped', '4 done, 1 skipped'],
    ['empty', 'No steps'], ['off', 'No routine today']],
  water: [['five', '5 glasses'], ['none', 'No glasses'], ['goal', '8 glasses'], ['paused', 'In Dentist']],
  meal: [['open', 'Not logged'], ['lunch', 'Lunch logged'], ['dinner', 'Dinner logged']],
  history: [['sample', 'History: sample'], ['empty', 'History: empty']],
  estimate: [['ready', 'Estimate works'], ['failed', 'Estimate fails'], ['pending', 'Estimate stays pending']],
  day: [['plan', 'Day: sample'], ['packed', 'Day: packed'], ['empty', 'Day: empty'], ['done', 'Day: all done']],
};
const settings = {layout: 'day', large: false, dark: false, clock: '13:10', routine: 'some', water: 'five', meal: 'open',
  history: 'sample', estimate: 'ready', day: 'plan', failSaves: false, screen: 'today', samplesOpen: false};

const STEPS = ['Glass of water', 'Stretch for 10 minutes', 'Shower', 'Journal one page', 'Plan the day'];
const ESTIMATES = {'dal rice': [550, 18], 'rajma chawal': [610, 20], 'paneer wrap': [480, 22], 'curd rice': [420, 11],
  'poha': [320, 7], 'idli sambar': [360, 12], 'roti sabzi': [450, 14], 'khichdi': [400, 15]};

const now = () => atMinutes(today, minutesOf(settings.clock));
const marksFor = states => Object.fromEntries(states.map((state, i) => [state && 's' + i, {state, at: iso('07:05')}]).filter(([id]) => id));

function seed() {
  if (settings.history === 'empty') {
    return {routines: [], runs: [], glasses: [], meals: [], busy: [], snoozedUntil: null,
      settings: {goal: 8, intervalMinutes: 90, from: '08:00', until: '22:00', glassMl: 250, snoozeMinutes: 15}};
  }
  const weekday = new Date(today + 'T12:00').getDay();
  const routine = {id: 'morning', name: 'Morning routine', start: '07:00', end: '07:30',
    days: settings.routine === 'off' ? [0, 1, 2, 3, 4, 5, 6].filter(d => d !== weekday) : [0, 1, 2, 3, 4, 5, 6],
    steps: settings.routine === 'empty' ? [] : STEPS.map((title, i) => ({id: 's' + i, title}))};
  const todayMarks = {some: ['done', 'done', 'done', 'skipped'], none: [], all: ['done', 'done', 'done', 'done', 'done'],
    skipped: ['done', 'done', 'skipped', 'done', 'done'], empty: [], off: []}[settings.routine];
  const runs = [
    {routineId: 'morning', day: dayBefore(1), marks: marksFor(['done', 'done', 'done', 'skipped'])},
    {routineId: 'morning', day: dayBefore(2), marks: {}},
    {routineId: 'morning', day: dayBefore(3), marks: marksFor(['done', 'done', 'done', 'done', 'done'])},
  ];
  if (todayMarks.length) runs.push({routineId: 'morning', day: today, marks: marksFor(todayMarks)});
  const todayGlasses = {five: ['08:40', '10:15', '11:00', '12:00', '13:00'], none: [],
    goal: ['08:00', '08:40', '09:20', '10:00', '10:40', '11:20', '12:00', '12:40'], paused: ['08:40', '10:15', '11:00', '12:00', '12:20']}[settings.water];
  const glasses = [
    ...['08:20', '09:50', '11:30', '13:05', '15:00', '17:10', '19:40'].map(t => iso(t, dayBefore(1))),
    ...['08:10', '09:30', '11:00', '12:40', '14:10', '15:50', '17:30', '20:00'].map(t => iso(t, dayBefore(2))),
    ...todayGlasses.map(t => iso(t)),
  ];
  const meal = (name, slot, time, day, ready = true) => ({id: `${slot}-${day}-${name}`, name, slot, at: iso(time, day),
    estimate: ready ? estimateFor(name) : {status: 'failed'}});
  const meals = [];
  const lunches = ['Dal rice', 'Rajma chawal', 'Dal rice', 'Paneer wrap', 'Curd rice', 'Dal rice', 'Rajma chawal', 'Veg thali',
    'Paneer wrap', 'Chole kulche', 'Dal rice', 'Curd rice', 'Rajma chawal'];
  lunches.forEach((name, i) => meals.push(meal(name, 'lunch', '13:15', dayBefore(i + 1), i !== 2)));
  ['Poha', 'Idli sambar', 'Poha', 'Oats with banana', 'Poha', 'Idli sambar'].forEach((name, i) => meals.push(meal(name, 'breakfast', '08:30', dayBefore(i + 1))));
  ['Roti sabzi', 'Khichdi', 'Roti sabzi', 'Roti sabzi', 'Khichdi'].forEach((name, i) => meals.push(meal(name, 'dinner', '20:30', dayBefore(i + 1))));
  meals.push(meal('Masala chai and biscuits', 'snack', '17:00', dayBefore(1)));
  if (settings.meal === 'lunch') meals.push(meal('Dal rice', 'lunch', '13:10', today));
  if (settings.meal === 'dinner') meals.push(meal('Dal rice', 'lunch', '13:10', today), meal('Roti sabzi', 'dinner', '20:10', today));
  return {
    routines: [routine], runs, glasses, meals,
    busy: settings.water === 'paused' ? [{title: 'Dentist', start: iso('12:30'), end: iso('15:00')}] : [],
    snoozedUntil: null,
    settings: {goal: 8, intervalMinutes: 90, from: '08:00', until: '22:00', glassMl: 250, snoozeMinutes: 15},
  };
}

function estimateFor(name) {
  const [kcal, protein] = ESTIMATES[name.trim().toLowerCase()] ?? [400, 12];
  return {status: 'ready', kcal, protein};
}

let data = seed();
let undoStack = [];
const upToNow = list => list.filter(item => new Date(typeof item === 'string' ? item : item.at) <= now());

/** The in-memory store the body modules use. Every save can fail on request and pushes one Undo step. */
const body = {
  now,
  routines: () => data.routines,
  routine: id => data.routines.find(r => r.id === id) ?? null,
  runs: () => data.runs,
  runFor: id => data.runs.find(r => r.routineId === id && r.day === localDay(now())) ?? null,
  saveRun: run => mutate(d => { d.runs = [...d.runs.filter(r => !(r.routineId === run.routineId && r.day === run.day)), run]; }),
  skipDay: id => mutate(d => {
    const run = d.runs.find(r => r.routineId === id && r.day === today);
    d.runs = [...d.runs.filter(r => r !== run), {...(run ?? {routineId: id, day: today, marks: {}}), skippedDay: true}];
  }),
  saveRoutine: routine => mutate(d => {
    const id = routine.id ?? 'routine-' + Date.now().toString(36);
    d.routines = [...d.routines.filter(r => r.id !== id), {...routine, id}];
  }),
  deleteRoutine: id => mutate(d => { d.routines = d.routines.filter(r => r.id !== id); }),
  water: () => ({glasses: upToNow(data.glasses), settings: data.settings, busy: data.busy, snoozedUntil: data.snoozedUntil}),
  drink: () => mutate(d => { d.glasses = [...d.glasses, now().toISOString()]; d.snoozedUntil = null; }),
  snooze: () => mutate(d => { d.snoozedUntil = new Date(+now() + d.settings.snoozeMinutes * 60000).toISOString(); }),
  setWater: (key, value) => mutate(d => { d.settings = {...d.settings, [key]: value}; }),
  meals: () => upToNow(data.meals),
  meal: id => data.meals.find(m => m.id === id) ?? null,
  async saveMeal(meal) {
    const before = meal.id ? body.meal(meal.id) : null;
    const id = meal.id ?? 'meal-' + Date.now().toString(36);
    const renamed = !before || before.name !== meal.name;
    const saved = {...meal, id, estimate: renamed ? {status: 'pending'} : before.estimate};
    await mutate(d => { d.meals = [...d.meals.filter(m => m.id !== id), saved]; });
    return saved;
  },
  deleteMeal: id => mutate(d => { d.meals = d.meals.filter(m => m.id !== id); }),
  estimate: id => new Promise(resolve => {
    if (settings.estimate === 'pending') return;
    setTimeout(() => {
      const meal = body.meal(id);
      if (meal) meal.estimate = settings.estimate === 'failed' ? {status: 'failed'} : estimateFor(meal.name);
      resolve();
    }, 1400);
  }),
  undo() {
    const previous = undoStack.pop();
    if (previous) data = previous;
  },
};

async function mutate(change) {
  await Promise.resolve();
  if (settings.failSaves) throw new Error('Preview save failed');
  undoStack.push(structuredClone(data));
  change(data);
}

const dom = {
  planner: document.getElementById('planner'),
  sheet: document.getElementById('sheet'),
  snackbar: document.getElementById('snackbar'),
  scroll: document.getElementById('planner-scroll'),
  work: document.getElementById('workspace'),
  bar: document.getElementById('top-bar'),
  nav: document.getElementById('nav-bar'),
};

const app = {
  dom,
  sheet: {epoch: 0, draftKey: null, draftValues: {}},
  data: () => ({version: 0}),
  api: {commit: async op => { if (op.type === 'undo') body.undo(); }, native: async () => {}, getPhone: () => ({})},
  recentlyCompleted: new Set(),
  sheetRefresh: null,
  render: () => {
    renderScreen();
    app.sheetRefresh?.();
  },
  onSheetClose: () => { app.sheetRefresh = null; },
  openHistory: () => { settings.screen = 'history'; renderScreen(); },
};
installSheetKeys(app);

function sampleTask(title, supporting, result) {
  const row = el('div', 'task-row');
  const check = button('', null, 'task-check');
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', 'false');
  check.setAttribute('aria-label', `Mark ${title} complete`);
  check.append(el('span', 'check-ring'));
  const main = el('div', 'task-main');
  main.append(el('span', 'task-title', title), el('span', 'task-supporting tnum', supporting));
  if (result) main.append(el('span', 'task-result', result));
  row.append(check, main);
  return row;
}

function sampleEvent(title, time) {
  const node = button('', null, 'agenda-event');
  const block = el('span', 'event-block');
  block.append(el('span', 'event-title', title), el('span', 'event-time tnum', time));
  node.append(icon('event', {cls: 'leading'}), block);
  return node;
}

function leadCard() {
  const card = el('section', 'result-group next-card');
  card.dataset.tone = 'area-2';
  const label = el('div', 'next-label');
  label.append(el('span', 'now-pin'), el('span', '', 'Do next · in 50 min'));
  const head = button('', null, 'result-head');
  const copy = el('span', 'result-copy');
  const meta = el('span', 'result-meta tnum');
  meta.append(phrase('Due tomorrow 11:59 PM'), el('span', 'meta-extra', ' · 3 tasks left'));
  copy.append(el('span', 'result-title', 'Physics lab report submitted'),
    el('span', 'result-purpose', 'So the practical marks count toward the term'), meta);
  head.append(copy);
  card.append(label, head, sampleTask('Draft the method section', '2:00 PM · 45 min'));
  return card;
}

function bodyRows() {
  const routines = todaysRoutines(body);
  return {routines, water: waterRow(app, body), meal: mealRow(app, body)};
}

function renderToday(page) {
  if (settings.layout === 'timeline') return renderDay(app, body, page, settings);
  const {routines, water, meal} = bodyRows();
  const header = el('div', 'day-header');
  const line = el('div', 'date-line');
  const date = button('', null, 'date-button');
  date.append(el('span', '', longDate(today)), icon('arrow_drop_down'));
  line.append(date);
  header.append(line);
  page.append(header, leadCard());

  if (settings.layout === 'strip') {
    const strip = el('section', 'body-strip');
    strip.append(sectionHeader('Body'), ...routines.map(item => routineRow(app, body, item)), water, ...(meal ? [meal] : []));
    page.append(strip);
  }

  const upcoming = el('section', 'upcoming');
  upcoming.append(sectionHeader('Coming up · Next 3 days'), listRow({symbol: 'hourglass_bottom', headline: 'Chemistry quiz revised',
    lines: [[phrase('Due Tue 9:00 AM'), sep(), phrase('in 2 days')], [phrase('2 tasks left')]]}));
  page.append(upcoming);

  const agenda = el('section', 'plain-section agenda');
  agenda.append(sectionHeader('Later today'));
  const items = [
    {start: 14 * 60, node: () => sampleTask('Draft the method section', '2:00 PM · 45 min', 'Physics lab report submitted')},
    {start: 15 * 60, node: () => sampleEvent('Physics lecture', '3:00 – 4:30 PM')},
    {start: 18 * 60, node: () => sampleEvent('Gym', '6:00 – 7:00 PM')},
    {start: 19 * 60 + 30, node: () => sampleTask('Revise chapter 4', '7:30 PM · 1 h', 'Chemistry quiz revised')},
  ];
  if (settings.layout === 'day') for (const item of routines) items.push({start: minutesOf(item.routine.start), node: () => routineBlock(app, body, item)});
  for (const item of items.sort((a, b) => a.start - b.start)) agenda.append(item.node());
  if (settings.layout === 'day') agenda.append(water, ...(meal ? [meal] : []));
  page.append(agenda);

  const inbox = button('', null, 'list-item inbox-row');
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'list-headline', 'Inbox'));
  inbox.append(icon('inbox', {cls: 'leading'}), copy, el('span', 'trailing-value tnum', '3'), icon('chevron_right', {cls: 'trailing'}));
  page.append(inbox);
}

function renderBar() {
  dom.bar.replaceChildren();
  if (settings.screen === 'history') {
    dom.bar.className = 'top-bar detail-bar';
    dom.bar.append(iconButton('arrow_back', 'Back', back));
    return;
  }
  dom.bar.className = 'top-bar root-bar';
  dom.bar.append(el('h1', 'top-title', 'Today'));
  const tools = el('div', 'top-actions');
  const more = iconButton('more_vert', 'More options', () => openMenu(more, [
    {label: 'History', icon: 'history', onClick: app.openHistory},
    {label: 'New routine', icon: 'checklist', onClick: () => openRoutineEditor(app, body)},
    {label: 'Edit routine', icon: 'edit', onClick: () => openRoutineEditor(app, body, data.routines[0]?.id ?? null)},
  ]));
  tools.append(iconButton('search', 'Search', null), iconButton('mic', 'Capture', null), iconButton('add_task', 'Add task', null), more);
  dom.bar.append(tools);
}

function renderNav() {
  if (dom.nav.children.length) return;
  for (const [symbol, label] of [['today', 'Today'], ['stacks', 'Blocks'], ['folder', 'Projects'], ['spa', 'Life']]) {
    const item = button('', null, 'nav-item');
    item.setAttribute('aria-label', label);
    item.setAttribute('aria-current', label === 'Today' ? 'page' : 'false');
    const pill = el('span', 'nav-pill');
    pill.append(icon(symbol, {fill: label === 'Today'}));
    item.append(pill, el('span', 'nav-label', label));
    dom.nav.append(item);
  }
}

function renderScreen() {
  const top = dom.scroll.scrollTop;
  const page = el('div', 'page');
  dom.planner.dataset.view = settings.screen;
  dom.nav.hidden = settings.screen === 'history';
  if (settings.screen === 'history') renderHistory(app, body, page);
  else renderToday(page);
  dom.work.replaceChildren(page);
  renderBar();
  renderNav();
  dom.scroll.scrollTop = top;
}

function back() {
  if (closeMenu()) return;
  if (isSheetOpen(app)) return dismissSheet(app);
  if (settings.screen === 'history') {
    settings.screen = 'today';
    dom.scroll.scrollTop = 0;
    renderScreen();
  }
}
window.rpmHandleBack = back;
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !isSheetOpen(app)) back();
  if (/^(Tab|Arrow)/.test(event.key)) root.dataset.keyboardNav = 'true';
});
document.addEventListener('pointerdown', () => { root.dataset.keyboardNav = 'false'; });

const TEXT_TOKENS = ['--body-large', '--body-medium', '--body-small', '--title-large', '--title-medium', '--title-small',
  '--label-large', '--label-medium', '--label-small'];
function setLargeText(on) {
  for (const token of TEXT_TOKENS) root.style.removeProperty(token);
  if (on) {
    const styles = getComputedStyle(root);
    for (const token of TEXT_TOKENS) {
      root.style.setProperty(token, styles.getPropertyValue(token).replace(/(\d+)px\/(\d+)px/, (_, size, line) => `${size * 2}px/${line * 2}px`));
    }
  }
  root.dataset.largeText = String(on);
}

new ResizeObserver(() => {
  root.style.setProperty('--sheet-actions-h', (dom.sheet.hidden ? 0 : dom.sheet.querySelector('.sheet-actions')?.offsetHeight ?? 0) + 'px');
}).observe(dom.sheet);

function toggle(label, key, apply) {
  const node = button(label, () => {
    settings[key] = !settings[key];
    node.setAttribute('aria-pressed', String(settings[key]));
    apply(settings[key]);
  });
  node.setAttribute('aria-pressed', String(settings[key]));
  return node;
}

function sampleSelect(key, label) {
  const wrap = el('label');
  const select = el('select');
  for (const [value, text] of SAMPLES[key]) {
    const option = el('option', '', text);
    option.value = value;
    select.append(option);
  }
  select.value = settings[key];
  select.addEventListener('change', () => {
    settings[key] = select.value;
    if (!['clock', 'estimate', 'day'].includes(key)) { data = seed(); undoStack = []; }
    app.render();
  });
  wrap.append(el('span', '', label), select);
  return wrap;
}

function previewBar() {
  const bar = document.getElementById('preview-bar');
  const layout = el('span', 'preview-group');
  layout.setAttribute('role', 'group');
  layout.setAttribute('aria-label', 'Today layout');
  const choices = [['day', 'In the day'], ['strip', 'Body strip'], ['timeline', 'Day']].map(([value, text]) => {
    const node = button(text, () => {
      settings.layout = value;
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === node)));
      app.render();
    });
    node.setAttribute('aria-pressed', String(settings.layout === value));
    return node;
  });
  layout.append(el('span', '', 'Today layout:'), ...choices);
  const samples = el('div', 'preview-samples');
  samples.hidden = true;
  const fail = el('label');
  const failBox = el('input');
  failBox.type = 'checkbox';
  failBox.addEventListener('change', () => { settings.failSaves = failBox.checked; });
  fail.append(failBox, el('span', '', 'Saves fail'));
  samples.append(sampleSelect('clock', 'Clock'), sampleSelect('routine', 'Routine'), sampleSelect('water', 'Water'),
    sampleSelect('meal', 'Meal'), sampleSelect('history', ''), sampleSelect('estimate', ''), sampleSelect('day', ''), fail);
  const more = toggle('Samples', 'samplesOpen', on => { samples.hidden = !on; });
  bar.append(layout, toggle('Text 200%', 'large', on => { setLargeText(on); app.render(); }),
    toggle('Dark', 'dark', on => { root.dataset.appearance = on ? 'dark' : 'light'; }), more, samples);
}

root.dataset.appearance = 'light';
root.dataset.largeText = 'false';
previewBar();
renderScreen();
Object.assign(window, {bodyPreview: {settings, body, app}});
