/** App shell: top app bar, a floating tab bar with a sliding pill, and beside it the dock: the tab's round Add and, on
 * Today, the habit circle above it. */
import {el, icon, iconButton, button, labelButton} from './dom.mjs';
import {openMenu} from './menu.mjs';
import {FULL_SCREENS} from './app.mjs';
import {blockSubtitle} from './blocks.mjs';
import {localDay} from '../planner-state.mjs';
import {jumpToNow} from './today-day.mjs';
import {bodyApi} from './body-api.mjs';
import {openHabits} from './habits.mjs';
import {navDrag} from '../nav-drag.mjs';
import {paintHabit, watchHabit} from './habit-circle.mjs';
import {attachSwipe, lockAxis, nearEdge} from '../task-swipe.mjs';

export const DESTINATIONS = [
  ['today', 'today', 'Today'],
  ['blocks', 'stacks', 'Blocks'],
  ['projects', 'folder', 'Projects'],
  ['life', 'spa', 'Life'],
];
const TITLES = {today: 'Today', blocks: 'Blocks', projects: 'Projects', life: 'Life'};
const DETAIL_NAMES = {blocks: 'Block', projects: 'Project', areas: 'Area', goals: 'Goal'};

function rootMenu(app, anchor) {
  const {actions, state} = app;
  const items = [
    {label: 'Weekly review', icon: 'event_repeat', onClick: () => app.openReview()},
    {label: 'Inbox', icon: 'inbox', onClick: actions.inbox},
  ];
  if (state.tab === 'today') {
    const list = state.dayLayout === 'list';
    items.push({label: list ? 'Show day' : 'Show list', icon: list ? 'view_day' : 'view_agenda',
      onClick: () => actions.setDayLayout(list ? 'day' : 'list')});
    items.push({label: 'Habits', icon: 'self_improvement', onClick: () => openHabits(app, bodyApi(app))});
    items.push({label: 'History', icon: 'history', onClick: () => app.openHistory()});
    items.push({label: 'Calendars', icon: 'calendar_month', onClick: actions.calendar});
  }
  if (state.tab === 'blocks') {
    items.push({label: 'Sort Inbox with Jev', icon: 'auto_awesome', onClick: actions.jevSort});
    items.push({label: 'Result, Purpose, Plan', icon: 'lightbulb', onClick: actions.examples});
  }
  items.push(
    {label: 'Archive', icon: 'archive', onClick: () => actions.trash(true)},
    {label: 'Trash', icon: 'delete', onClick: () => actions.trash(false)},
    ...(app.api.menuItems?.() ?? []),
    {divider: true},
    {label: 'Settings', icon: 'settings', onClick: () => app.openSettings()},
  );
  if (app.api.getPhone().debug) items.push({label: 'Component gallery', icon: 'widgets', onClick: actions.gallery});
  openMenu(anchor, items);
}

function rootBar(app, bar) {
  const {state} = app;
  bar.className = 'top-bar root-bar';
  bar.append(el('h1', state.tab === 'today' ? 'top-title visually-hidden' : 'top-title', TITLES[state.tab]));
  const tools = el('div', 'top-actions');
  tools.append(iconButton('search', 'Search', () => app.openSearch()), iconButton('mic', 'Capture', () => app.capture()));
  const more = iconButton('more_vert', 'More options', () => rootMenu(app, more));
  tools.append(more);
  bar.append(tools);
}

/** Today's spine on today: the Now pill on the tab bar's top edge shows while now is out of view (day.css). */
const dayAtNow = app => !app.current() && app.state.tab === 'today' && app.state.dayLayout !== 'list' && app.state.day === localDay();

function detailBar(app, bar, top) {
  bar.className = 'top-bar detail-bar';
  bar.append(iconButton('arrow_back', 'Back', () => app.back()));
  const record = DETAIL_NAMES[top.kind] ? app.p()[top.kind]?.find(item => item.id === top.id) : null;
  const title = el('h1', 'top-title small', top.kind === 'settings' ? 'Settings' : record?.title ?? '');
  if (DETAIL_NAMES[top.kind]) title.setAttribute('aria-label', `${DETAIL_NAMES[top.kind]}: ${record?.title ?? ''}`);
  // A Block keeps its deadline in view once its title has collapsed into the bar.
  const sub = top.kind === 'blocks' && record ? blockSubtitle(app, record) : '';
  if (sub) {
    title.replaceChildren(el('span', 'top-title-text', record.title), el('span', 'top-subtitle tnum', sub));
    title.classList.add('with-subtitle');
  }
  bar.append(title);
  if (!DETAIL_NAMES[top.kind]) return;
  // Everything on a detail page edits where it is, so the bar has no Edit pencil; More keeps Delete.
  const tools = el('div', 'top-actions');
  const more = iconButton('more_vert', 'More options', () => openMenu(more, app.actions.detailMenu(top)));
  tools.append(more);
  bar.append(tools);
}

function navigationBar(app) {
  const nav = app.dom.nav;
  if (!nav.children.length) {
    nav.append(el('span', 'nav-indicator'));
    for (const [tab, symbol, label] of DESTINATIONS) {
      const item = button('', () => app.goTab(tab), 'nav-item');
      item.dataset.tab = tab;
      item.setAttribute('aria-label', label);
      const pill = el('span', 'nav-pill');
      pill.append(icon(symbol));
      item.append(pill, el('span', 'nav-label', label));
      nav.append(item);
    }
    attachNavDrag(app, nav);
  }
  for (const item of nav.querySelectorAll('.nav-item')) {
    const on = item.dataset.tab === app.state.tab;
    item.setAttribute('aria-current', on ? 'page' : 'false');
    item.querySelector('.ms').classList.toggle('fill', on);
  }
  placeNavIndicator(nav);
}

/** The dock beside the tab bar: the habit circle (Today only) over the round Add. Tap adds; a 400ms hold opens Capture. */
function dock(app, full) {
  const host = app.dom.dock;
  if (!host.children.length) {
    const habit = el('div', 'habit-slot');
    const add = iconButton('add', 'Add', () => addSpec(app)?.onClick(), {cls: 'fab'});
    attachSwipe(add, {hold: () => app.capture(), haptic: () => app.api.native('haptic', {kind: 'hold'}).catch(() => {})});
    host.append(habit, add);
    watchHabit(app, habit);
  }
  const spec = full ? null : addSpec(app);
  const add = host.querySelector('.fab');
  add.hidden = !spec;
  if (spec) add.setAttribute('aria-label', spec.label);
  paintHabit(app, host.querySelector('.habit-slot'));
  host.hidden = !!full || (!spec && !host.querySelector('.habit-circle'));
}

/** What the tab bar's Add makes on this tab (Add task on Today); none on a detail page or Values. */
function addSpec(app) {
  if (app.current()) return null;
  return app.state.tab === 'today'
    ? {label: 'Add task', onClick: () => app.actions.addTask({plannedDate: app.state.day})}
    : app.actions.addFor(app.state.tab);
}

/**
 * Drag along the tab bar: the pill follows the finger with a tick at each tab, and letting go opens the tab under it.
 * A tap on a tab stays the tap twin; a drag that starts within 24dp of the screen edge is left to system Back.
 */
function attachNavDrag(app, nav) {
  let start = null, axis = null, index = -1;
  const items = () => [...nav.querySelectorAll('.nav-item')];
  const end = () => {
    start = null;
    delete nav.dataset.dragging;
  };
  nav.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || event.button > 0) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId, edge: nearEdge(event.clientX, innerWidth)};
    axis = null;
    index = items().findIndex(item => item.getAttribute('aria-current') === 'page');
  });
  nav.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    if (!axis) {
      axis = lockAxis(event.clientX - start.x, event.clientY - start.y);
      if (!axis) return;
      if (axis === 'y' || start.edge) return end();
      try { nav.setPointerCapture(event.pointerId); } catch {}
      nav.dataset.dragging = '';
    }
    const tabs = items();
    const width = parseFloat(nav.style.getPropertyValue('--pill-w')) || 64;
    const drag = navDrag(event.clientX - nav.getBoundingClientRect().left - nav.clientLeft,
      tabs.map(item => ({left: item.offsetLeft, width: item.offsetWidth})), width);
    nav.style.setProperty('--pill-x', drag.pillX + 'px');
    if (drag.index !== index) app.api.native('haptic', {kind: 'tick'}).catch(() => {});
    index = drag.index;
  });
  nav.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const dragged = axis === 'x';
    end();
    if (!dragged) return;
    const eat = click => { click.preventDefault(); click.stopImmediatePropagation(); };
    nav.addEventListener('click', eat, {capture: true, once: true});
    setTimeout(() => nav.removeEventListener('click', eat, {capture: true}));
    const tab = items()[index]?.dataset.tab;
    if (tab && tab !== app.state.tab) app.goTab(tab);
    else placeNavIndicator(nav);
  });
  nav.addEventListener('pointercancel', () => {
    if (axis === 'x') placeNavIndicator(nav);
    end();
  });
}

/** Puts the tab bar's one pill under `item` (the current tab by default): 64dp wide, centred, narrower if the column is. */
export function placeNavIndicator(nav, item = nav.querySelector('.nav-item[aria-current=page]')) {
  const pill = nav.querySelector('.nav-indicator');
  if (!pill || !item || nav.hidden || !nav.offsetWidth) return;
  const width = Math.min(64, item.offsetWidth);
  nav.style.setProperty('--pill-w', width + 'px');
  nav.style.setProperty('--pill-x', item.offsetLeft + (item.offsetWidth - width) / 2 + 'px');
  if (!nav.dataset.placed) requestAnimationFrame(() => { nav.dataset.placed = ''; });
}

/** On today's spine, the Now pill: centred on the tab bar's top edge, shown only while now is out of view. */
function nowPill(app) {
  const host = app.dom.now;
  host.replaceChildren();
  host.hidden = !dayAtNow(app);
  if (host.hidden) return;
  const now = labelButton('my_location', 'Now', () => jumpToNow(app), 'now-pill');
  now.setAttribute('aria-label', 'Go to now');
  host.append(now);
}

/** `keep` (a save re-rendering the same screen): a top bar that would come out the same keeps its nodes. */
export function renderShell(app, {keep = false} = {}) {
  const top = app.current();
  const full = top && FULL_SCREENS.has(top.kind);
  const root = app.dom.planner;
  root.dataset.view = top?.kind ?? app.state.tab;
  root.dataset.detail = String(!!top);
  app.dom.nav.hidden = !!full;
  navigationBar(app);
  dock(app, full);
  nowPill(app);
  const bar = app.dom.topBar;
  bar.hidden = top?.kind === 'review';
  if (top?.kind === 'search') {
    bar.replaceChildren();
    app.renderers.searchBar(app, bar);
    return;
  }
  // Its handlers read the app's state when tapped, so identical markup acts the same.
  const next = document.createElement('header');
  if (top) detailBar(app, next, top);
  else rootBar(app, next);
  bar.className = next.className;
  if (keep && bar.innerHTML === next.innerHTML) return;
  bar.replaceChildren(...next.childNodes);
}
