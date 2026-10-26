/** Life: Vision / Quarter / Month / Values, the Wheel of Life with its Area chips (life-wheel.mjs), Areas and Goals. */
import {el, icon, button, iconButton, labelButton, emptyState, listItem, sectionHeader} from './dom.mjs';
import {plural} from './format.mjs';
import {openSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {breadcrumbs, parentMenu} from './projects.mjs';
import {purposePanel, notesPanel, titleField, finishDetail} from './blocks.mjs';
import {persist, saveEntity, NO_ICON} from './inline-edit.mjs';
import {wheelCard} from './life-wheel.mjs';

const HORIZONS = [['yearly', 'Vision'], ['quarterly', 'Quarter'], ['monthly', 'Month'], ['values', 'Values']];
export function shiftLifePeriod(app, delta) {
  const {state} = app;
  if (state.horizon === 'monthly' || state.horizon === 'quarterly') {
    state.period += delta * (state.horizon === 'monthly' ? 1 : 3);
    if (state.period > 12) { state.year++; state.period -= 12; }
    if (state.period < 1) { state.year--; state.period += 12; }
  } else {
    state.year += delta;
  }
  app.render({reset: true, direction: delta > 0 ? 'right' : 'left'});
}

function tabs(app) {
  const bar = el('div', 'tabs');
  bar.setAttribute('role', 'tablist');
  for (const [key, label] of HORIZONS) {
    const tab = button(label, () => { app.state.horizon = key; app.render({reset: true}); }, 'tab');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(app.state.horizon === key));
    bar.append(tab);
  }
  return bar;
}

function periodSwitch(app) {
  const {state} = app;
  const label = state.horizon === 'quarterly' ? `Quarter ${Math.ceil(state.period / 3)} · ${state.year}`
    : state.horizon === 'monthly'
      ? new Date(state.year, state.period - 1, 1).toLocaleDateString([], {month: 'long', year: 'numeric'})
      : String(state.year);
  const row = el('div', 'period-switch');
  row.append(iconButton('chevron_left', 'Previous period', () => shiftLifePeriod(app, -1)),
    el('h2', 'tnum', label), iconButton('chevron_right', 'Next period', () => shiftLifePeriod(app, 1)));
  return row;
}

function initialAvatar(app, area) {
  const avatar = el('span', 'avatar', (area.title.trim()[0] ?? '?').toUpperCase());
  avatar.dataset.tone = app.tone(area);
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}

/** Wide only: each Area with its rating and this year's Goals, beside the wheel. */
function areaGoals(app, areas, loose) {
  const list = el('section', 'life-areas');
  for (const area of areas) {
    const goals = app.p().goals.filter(g => g.areaId === area.id && g.year === app.state.year);
    const row = el('div', 'life-area-row');
    row.dataset.tone = app.tone(area);
    const value = el('span', 'life-rating tnum', area.rating == null ? '–' : `${area.rating}`);
    row.append(listItem({leading: initialAvatar(app, area), headline: area.title, cls: 'life-area',
      onClick: () => app.openArea(area.id)}), ratingInput(app, area, rating => { value.textContent = rating; }), value);
    list.append(row);
    for (const goal of goals) list.append(goalRow(app, goal, 'nested'));
  }
  if (loose.length) list.append(sectionHeader('Goals with no Area'), ...loose.map(goal => goalRow(app, goal)));
  return list;
}

function goalRow(app, goal, cls = '') {
  const projects = app.p().projects.filter(pr => pr.goalId === goal.id);
  return listItem({leading: 'flag', headline: goal.title, supporting: plural(projects.length, 'Project'),
    trailing: 'chevron_right', onClick: () => app.openGoal(goal.id), cls});
}

function periodGoals(app, page) {
  const {state} = app;
  page.append(periodSwitch(app));
  const target = state.horizon === 'monthly' ? state.period : Math.ceil(state.period / 3);
  const goals = app.p().goals.filter(g => g.year === state.year && g.horizon === state.horizon && g.period === target);
  const list = el('div', 'list');
  for (const goal of goals) list.append(goalRow(app, goal));
  page.append(list);
  if (!goals.length) {
    page.append(emptyState({symbol: 'flag', title: 'No Goals for this period yet',
      body: 'A Goal names an outcome for this stretch of time.', action: () => app.actions.newEntity('goals'),
      label: 'Add Goal'}));
  }
}

export function renderLife(app, page) {
  const {state} = app;
  page.append(tabs(app));
  if (state.horizon === 'values') {
    const card = el('section', 'values-card');
    card.append(el('span', 'overline', 'Core values'),
      el('p', '', app.p().context.coreValues || 'What do you want your plans to reflect?'),
      labelButton('edit', 'Edit values', () => app.actions.contextEditor(), 'tonal-btn'));
    page.append(card);
    return;
  }
  if (state.horizon !== 'yearly') {
    periodGoals(app, page);
    return;
  }
  page.append(periodSwitch(app));
  const areas = app.p().areas;
  if (areas.length) page.append(wheelCard(app, areas, rateAreas));
  else {
    page.append(emptyState({symbol: 'spa', title: 'What matters to you?', body: 'Add an Area, then choose a Goal.',
      action: () => app.actions.newEntity('areas'), label: 'Add Area'}));
  }
  const loose = app.p().goals.filter(g => !g.areaId && g.year === state.year);
  if (areas.length && app.api.wide?.()) {
    page.append(areaGoals(app, areas, loose));
    return;
  }
  if (loose.length) {
    page.append(sectionHeader('Goals with no Area'));
    const goals = el('div', 'list');
    for (const goal of loose) goals.append(goalRow(app, goal));
    page.append(goals);
  }
}

/**
 * The Area's rating as a slider on the page: drag or arrow keys, saved when let go, with Undo. It moves in whole
 * points (a half point saved earlier shows as it is until touched). Unrated, the track shows its eleven points as faint
 * ticks and a hollow handle waits at its start, so it reads as something to drag but never as a value ("Not rated"
 * says so); the first touch puts the handle where the finger is, filled.
 */
/** A 0–10 slider in the Area's colour that saves on release with Undo; `show` writes the value it is set to. */
function ratingInput(app, area, show) {
  const input = el('input', 'rating-slider');
  input.type = 'range';
  input.min = 0;
  input.max = 10;
  input.step = area.rating == null || Number.isInteger(area.rating) ? 1 : 0.5;
  input.value = area.rating ?? 0;
  input.classList.toggle('unrated', area.rating == null);
  input.setAttribute('aria-label', `${area.title} rating, 0 to 10`);
  input.setAttribute('aria-valuetext', area.rating == null ? 'Not rated' : `${area.rating} of 10`);
  const paint = () => input.style.setProperty('--value', String(Number(input.value) / 10));
  paint();
  input.addEventListener('input', () => {
    if (input.step !== '1') {
      input.step = 1;
      input.value = Math.round(Number(input.value));
    }
    input.classList.remove('unrated');
    show(input.value);
    input.setAttribute('aria-valuetext', `${input.value} of 10`);
    paint();
  });
  // Touching the hollow handle where it waits (0) changes no value, so it would send no input: rate it 0 then.
  input.addEventListener('pointerup', () => {
    if (!input.classList.contains('unrated')) return;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
  });
  input.addEventListener('change', () => {
    const rating = Number(input.value);
    if (rating === area.rating) return;
    persist(app, {type: 'rateAreas', ratings: [{id: area.id, rating}]}, {label: `${area.title} rated ${rating}`})
      .catch(() => {});
  });
  return input;
}

function ratingSlider(app, area) {
  const row = el('div', 'rating-row');
  row.dataset.tone = app.tone(area);
  const output = el('strong', 'tnum', area.rating == null ? 'Not rated' : `${area.rating} / 10`);
  const input = ratingInput(app, area, value => { output.textContent = `${value} / 10`; });
  const ticks = el('span', 'rating-ticks');
  ticks.setAttribute('aria-hidden', 'true');
  for (let i = 0; i <= 10; i++) ticks.append(el('i'));
  row.append(el('span', 'overline', 'Your rating'), output, input, ticks,
    el('span', 'rating-note', 'How it feels right now, not how many tasks are done'));
  return row;
}

export function renderAreaDetail(app, page, area) {
  const head = el('div', 'area-head');
  head.append(initialAvatar(app, area), titleField(app, 'areas', area, 'Area'));
  page.append(head);
  const facts = el('div', 'block-facts');
  facts.append(purposePanel(app, 'areas', area));
  const notes = notesPanel(app, 'areas', area);
  if (notes) facts.append(notes);
  page.append(facts);
  page.append(ratingSlider(app, area));
  page.append(sectionHeader(`Goals · ${app.state.year}`));
  const goals = app.p().goals.filter(g => g.areaId === area.id && g.year === app.state.year);
  const list = el('div', 'list');
  for (const goal of goals) {
    list.append(goalRow(app, goal));
    for (const project of app.p().projects.filter(pr => pr.goalId === goal.id)) {
      list.append(listItem({leading: 'folder', headline: project.title, cls: 'nested',
        trailing: 'chevron_right', onClick: () => app.openProject(project.id)}));
    }
  }
  page.append(list);
  if (!goals.length) page.append(el('p', 'quiet', `No Goals for ${app.state.year} yet.`));
  page.append(labelButton('add', 'Add Goal', () => app.actions.newEntity('goals', {areaId: area.id}), 'outlined-btn wide'));
  finishDetail(app, page);
}

const monthName = period => new Date(2000, (period ?? 1) - 1, 1).toLocaleDateString([], {month: 'long'});
export const horizonLabel = goal => ({quarterly: `Quarter ${goal.period}`, monthly: monthName(goal.period)}[goal.horizon]
  ?? 'Yearly goal');

/** When a Goal is for: its stretch (year, quarter or month) and its year, each an anchored menu that saves in one tap. */
function goalWhen(app, goal) {
  const line = el('div', 'goal-when');
  const save = (patch, label) => saveEntity(app, 'goals', goal, patch, label).catch(() => {});
  const chip = (text, name, items) => {
    const node = button('', null, 'assist-chip goal-when-chip');
    node.append(el('span', '', text), icon('arrow_drop_down', {cls: 'crumb-drop'}));
    node.setAttribute('aria-haspopup', 'menu');
    node.setAttribute('aria-label', `${name}: ${text}. Change`);
    node.addEventListener('click', () => openMenu(node, items(), name));
    return node;
  };
  const is = (horizon, period = null) => (goal.horizon ?? 'yearly') === horizon && (horizon === 'yearly' || goal.period === period);
  const option = (label, horizon, period = null) => ({label, icon: is(horizon, period) ? 'check' : NO_ICON,
    onClick: () => { if (!is(horizon, period)) save({horizon, period}, `Goal moved to ${label}`); }});
  line.append(chip(horizonLabel(goal), 'Goal for', () => [
    option('The whole year', 'yearly'),
    {divider: true},
    ...[1, 2, 3, 4].map(q => option(`Quarter ${q}`, 'quarterly', q)),
    {divider: true},
    ...Array.from({length: 12}, (_, i) => option(monthName(i + 1), 'monthly', i + 1)),
  ]));
  line.append(chip(String(goal.year), 'Year', () => [-1, 0, 1, 2].map(delta => goal.year + delta).map(year => ({
    label: String(year), icon: year === goal.year ? 'check' : NO_ICON,
    onClick: () => { if (year !== goal.year) save({year}, `Goal moved to ${year}`); }}))));
  return line;
}

export function renderGoalDetail(app, page, goal) {
  const area = app.p().areas.find(a => a.id === goal.areaId);
  const areaMenu = () => parentMenu({current: area?.id ?? null, currentLabel: area?.title, none: 'No area',
    options: app.p().areas.map(a => [a.id, a.title]), open: () => app.openArea(area.id),
    choose: (areaId, label) => saveEntity(app, 'goals', goal, {areaId},
      areaId ? `Moved to ${label}` : 'Moved out of its Area').catch(() => {})});
  const crumbs = breadcrumbs(app, [{label: area?.title ?? 'Choose an Area', icon: 'spa', menu: areaMenu}]);
  crumbs.append(...goalWhen(app, goal).children);
  page.append(crumbs);
  page.append(titleField(app, 'goals', goal, 'Goal'));
  const facts = el('div', 'block-facts');
  facts.append(purposePanel(app, 'goals', goal));
  const notes = notesPanel(app, 'goals', goal);
  if (notes) facts.append(notes);
  page.append(facts);
  page.append(sectionHeader('Projects'));
  const list = el('div', 'list');
  for (const project of app.p().projects.filter(pr => pr.goalId === goal.id)) {
    list.append(listItem({leading: 'folder', headline: project.title, supporting: project.purpose ?? '',
      trailing: 'chevron_right', onClick: () => app.openProject(project.id)}));
  }
  page.append(list);
  page.append(labelButton('add', 'Add Project', () => app.actions.newEntity('projects', {goalId: goal.id}),
    'outlined-btn wide'));
  finishDetail(app, page);
}

/** Reflective 0–10 ratings in half steps; untouched sliders are not saved. */
export function rateAreas(app, id = null) {
  const {body, actions} = openSheet(app, id ? 'Rate this Area' : 'Rate your Areas', {draftKey: 'area-ratings'});
  body.append(el('p', 'sheet-note', 'How does each Area feel right now? This is your reflection, not task completion.'));
  const readers = [];
  for (const area of app.p().areas.filter(a => !id || a.id === id)) {
    const wrap = el('label', 'rating-field');
    wrap.dataset.tone = app.tone(area);
    const head = el('span', 'rating-head');
    const output = el('output', 'tnum', area.rating == null ? 'Not rated' : String(area.rating));
    head.append(el('span', '', area.title), output);
    const input = el('input');
    input.type = 'range';
    input.min = 0;
    input.max = 10;
    input.step = 0.5;
    input.value = area.rating ?? 5;
    input.setAttribute('aria-label', area.title + ' rating');
    let touched = false;
    input.addEventListener('input', () => { touched = true; output.textContent = input.value; });
    wrap.append(head, input);
    body.append(wrap);
    readers.push(() => (touched ? {id: area.id, rating: Number(input.value)} : null));
  }
  if (!readers.length) body.append(el('p', 'sheet-note', 'Add an Area first.'));
  const save = button('Save ratings', () => app.commit({type: 'rateAreas', ratings: readers.map(r => r()).filter(Boolean)},
    {label: 'Ratings saved'}).catch(() => {}), 'filled-btn');
  save.disabled = !readers.length;
  actions.append(button('Cancel', () => app.closeSheet(), 'text-btn'), save);
}

