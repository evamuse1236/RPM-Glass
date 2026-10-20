/** App shell: Google-style top app bar, navigation bar with pill indicator, one FAB. */
import {el, icon, iconButton, button, labelButton} from './dom.mjs';
import {openMenu} from './menu.mjs';
import {FULL_SCREENS} from './app.mjs';
import {blockSubtitle} from './blocks.mjs';
import {localDay} from '../planner-state.mjs';
import {jumpToNow} from './today-day.mjs';
import {bodyApi} from './body-api.mjs';
import {openHabits} from './habits.mjs';

const DESTINATIONS = [
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
    {divider: true},
    {label: 'Settings', icon: 'settings', onClick: () => app.openSettings()},
  );
  if (app.api.getPhone().debug) items.push({label: 'Component gallery', icon: 'widgets', onClick: actions.gallery});
  openMenu(anchor, items);
}

function rootBar(app, bar) {
  const {state} = app;
  bar.className = 'top-bar root-bar';
  bar.append(el('h1', 'top-title', TITLES[state.tab]));
  const tools = el('div', 'top-actions');
  // Search and Add live in the thumb's reach, bottom right (fab below); the bar keeps Capture and More.
  tools.append(iconButton('mic', 'Capture', () => app.capture()));
  const more = iconButton('more_vert', 'More options', () => rootMenu(app, more));
  tools.append(more);
  bar.append(tools);
}

/** Today's spine on today: the one floating action is Now, shown while now is out of view (day.css). */
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
  }
  for (const item of nav.querySelectorAll('.nav-item')) {
    const on = item.dataset.tab === app.state.tab;
    item.setAttribute('aria-current', on ? 'page' : 'false');
    item.querySelector('.ms').classList.toggle('fill', on);
  }
  placeNavIndicator(nav);
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

/** Root tabs: a right-hand column (Search above the tab's Add), and on today's spine the centred Now pill. Detail pages have none. */
function fab(app) {
  const host = app.dom.fab;
  host.replaceChildren();
  const top = app.current();
  const spec = top ? null : app.state.tab === 'today'
    ? {label: 'Add task', onClick: () => app.actions.addTask({plannedDate: app.state.day})}
    : app.actions.fabFor(app.state.tab);
  host.hidden = !!top;
  app.dom.planner.dataset.fab = String(!top);
  if (top) return;
  if (dayAtNow(app)) {
    const now = labelButton('my_location', 'Now', () => jumpToNow(app), 'now-fab');
    now.setAttribute('aria-label', 'Go to now');
    host.append(now);
  }
  const stack = el('div', 'fab-stack');
  stack.append(iconButton('search', 'Search', () => app.openSearch(), {cls: 'fab fab-small'}));
  if (spec) stack.append(iconButton('add', spec.label, spec.onClick, {cls: 'fab'}));
  host.append(stack);
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
  fab(app);
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
