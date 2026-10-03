/** Life: Vision / Quarter / Month / Values, the Wheel of Life (labelled bars, radar optional), Areas and Goals. */
import {el, icon, button, iconButton, labelButton, emptyState, listItem, sectionHeader} from './dom.mjs';
import {plural} from './format.mjs';
import {openSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {breadcrumbs, parentMenu} from './projects.mjs';
import {purposePanel, notesPanel, titleField, finishDetail} from './blocks.mjs';
import {persist, saveEntity, NO_ICON} from './inline-edit.mjs';

const HORIZONS = [['yearly', 'Vision'], ['quarterly', 'Quarter'], ['monthly', 'Month'], ['values', 'Values']];
const svg = (tag, attrs) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

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

function wheelBars(app, areas) {
  const list = el('div', 'wheel-bars');
  for (const area of areas) {
    const row = el('div', 'wheel-bar');
    row.dataset.tone = app.tone(area);
    const head = el('div', 'wheel-bar-head');
    head.append(el('span', 'wheel-name', area.title),
      el('span', 'wheel-value tnum', area.rating == null ? 'Not rated' : `${area.rating} / 10`));
    const track = el('div', 'wheel-track');
    const fill = el('span');
    fill.style.setProperty('--value', String((area.rating ?? 0) / 10));
    track.append(fill);
    row.append(head, track);
    list.append(row);
  }
  return list;
}

function wheelRadar(app, areas) {
  const label = areas.map(a => `${a.title}: ${a.rating ?? 'not rated'}`).join(', ') || 'No areas yet';
  const chart = svg('svg', {viewBox: '0 0 400 290', class: 'wheel-radar', role: 'img', 'aria-label': label});
  const count = Math.max(3, areas.length);
  const point = (i, r) => [200 + Math.sin(i / count * Math.PI * 2) * r, 145 - Math.cos(i / count * Math.PI * 2) * r];
  const ring = r => Array.from({length: count}, (_, i) => point(i, r).join(',')).join(' ');
  for (const r of [22, 44, 66, 88]) chart.append(svg('polygon', {points: ring(r), class: 'radar-grid'}));
  areas.forEach((area, i) => {
    const [x, y] = point(i, 88);
    chart.append(svg('line', {x1: 200, y1: 145, x2: x, y2: y, class: 'radar-grid'}));
    const [tx, ty] = point(i, 104);
    const text = svg('text', {x: tx, y: ty, 'text-anchor': tx < 190 ? 'end' : tx > 210 ? 'start' : 'middle',
      'dominant-baseline': 'middle', class: 'radar-label'});
    text.textContent = area.title.length > 18 ? area.title.slice(0, 17) + '…' : area.title;
    chart.append(text);
  });
  if (areas.length >= 3) {
    const points = areas.map((area, i) => point(i, (area.rating ?? 0) / 10 * 88).join(',')).join(' ');
    chart.append(svg('polygon', {points, class: 'radar-value'}));
  }
  areas.forEach((area, i) => {
    if (area.rating == null) return;
    const [cx, cy] = point(i, area.rating / 10 * 88);
    chart.append(svg('circle', {cx, cy, r: 5, class: 'radar-node', 'data-tone': app.tone(area)}));
  });
  return chart;
}

function wheelCard(app, areas) {
  const {state} = app;
  const card = el('section', 'wheel-card');
  const head = el('div', 'wheel-head');
  const rated = areas.filter(area => area.rating != null);
  const average = rated.length ? (rated.reduce((sum, a) => sum + a.rating, 0) / rated.length).toFixed(1) : null;
  const copy = el('div', 'wheel-copy');
  copy.append(el('h2', '', 'Wheel of Life'), el('p', 'tnum', average ? `${average} average` : 'Rate each Area from 0 to 10'));
  head.append(copy);
  const radar = state.wheel === 'radar' && !app.largeText();
  if (!app.largeText() && areas.length >= 3) {
    head.append(iconButton(radar ? 'bar_chart' : 'radar', radar ? 'Show bars' : 'Show radar',
      () => { state.wheel = radar ? 'bars' : 'radar'; app.render(); }));
  }
  card.append(head, radar ? wheelRadar(app, areas) : wheelBars(app, areas));
  card.append(labelButton('tune', 'Rate your Areas', () => rateAreas(app), 'tonal-btn'));
  return card;
}

function areaRow(app, area) {
  const goals = app.p().goals.filter(g => g.areaId === area.id && g.year === app.state.year);
  const projects = app.p().projects.filter(pr => goals.some(g => g.id === pr.goalId));
  const trailing = el('span', 'trailing-value tnum', area.rating == null ? '–' : String(area.rating));
  const row = listItem({leading: initialAvatar(app, area), headline: area.title,
    supporting: `${plural(goals.length, 'Goal')} · ${plural(projects.length, 'Project')}`, trailing,
    onClick: () => app.openArea(area.id)});
  row.setAttribute('aria-label', `${area.title}, rating ${area.rating ?? 'not set'}. Open Area`);
  return row;
}

function goalRow(app, goal) {
  const projects = app.p().projects.filter(pr => pr.goalId === goal.id);
  return listItem({leading: 'flag', headline: goal.title, supporting: plural(projects.length, 'Project'),
    trailing: 'chevron_right', onClick: () => app.openGoal(goal.id)});
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
  if (areas.length) page.append(wheelCard(app, areas));
  if (areas.length) page.append(sectionHeader('Areas'));
  const list = el('div', 'list');
  for (const area of areas) list.append(areaRow(app, area));
  page.append(list);
  if (!areas.length) {
    page.append(emptyState({symbol: 'spa', title: 'What matters to you?', body: 'Add an Area, then choose a Goal.',
      action: () => app.actions.newEntity('areas'), label: 'Add Area'}));
  }
  const loose = app.p().goals.filter(g => !g.areaId && g.year === state.year);
  if (loose.length) {
    page.append(sectionHeader('Goals with no Area'));
    const goals = el('div', 'list');
    for (const goal of loose) goals.append(goalRow(app, goal));
    page.append(goals);
  }
}

/**
 * The Area's rating as a slider on the page: drag or arrow keys, saved when let go, with Undo. It moves in whole
 * points (a half point saved earlier shows as it is until touched). Unrated, it is an empty track with no thumb, so
 * nothing reads as a 5; the first touch puts the thumb where the finger is.
 */
function ratingSlider(app, area) {
  const row = el('div', 'rating-row');
  row.dataset.tone = app.tone(area);
  const label = el('span', 'overline', 'Your rating');
  const output = el('strong', 'tnum', area.rating == null ? 'Not rated' : `${area.rating} / 10`);
  const input = el('input', 'rating-slider');
  input.type = 'range';
  input.min = 0;
  input.max = 10;
  input.step = area.rating == null || Number.isInteger(area.rating) ? 1 : 0.5;
  input.value = area.rating ?? 5;
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
    output.textContent = `${input.value} / 10`;
    input.setAttribute('aria-valuetext', `${input.value} of 10`);
    paint();
  });
  input.addEventListener('change', () => {
    const rating = Number(input.value);
    if (rating === area.rating) return;
    persist(app, {type: 'rateAreas', ratings: [{id: area.id, rating}]}, {label: `${area.title} rated ${rating}`})
      .catch(() => {});
  });
  row.append(label, output, input, el('span', 'rating-note', 'How it feels right now, not how many tasks are done'));
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

