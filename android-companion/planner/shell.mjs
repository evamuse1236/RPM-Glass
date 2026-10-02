/** App shell: Google-style top app bar, navigation bar with pill indicator, one FAB. */
import {el, icon, iconButton, button} from './dom.mjs';
import {openMenu} from './menu.mjs';
import {FULL_SCREENS} from './app.mjs';

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
  if (state.tab === 'today') items.push({label: 'Calendars', icon: 'calendar_month', onClick: actions.calendar});
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
  tools.append(iconButton('search', 'Search', () => app.openSearch()));
  tools.append(iconButton('mic', 'Capture', () => app.capture()));
  if (state.tab === 'today' && !app.largeText()) {
    const timeline = state.dayLayout === 'timeline';
    const toggle = iconButton(timeline ? 'view_agenda' : 'schedule',
      timeline ? 'Show agenda' : 'Show timeline', () => app.actions.setDayLayout(timeline ? 'agenda' : 'timeline'));
    tools.append(toggle);
  }
  const more = iconButton('more_vert', 'More options', () => rootMenu(app, more));
  tools.append(more);
  bar.append(tools);
}

function detailBar(app, bar, top) {
  bar.className = 'top-bar detail-bar';
  bar.append(iconButton('arrow_back', 'Back', () => app.back()));
  const record = DETAIL_NAMES[top.kind] ? app.p()[top.kind]?.find(item => item.id === top.id) : null;
  const title = el('h1', 'top-title small', top.kind === 'settings' ? 'Settings' : record?.title ?? '');
  if (DETAIL_NAMES[top.kind]) title.setAttribute('aria-label', `${DETAIL_NAMES[top.kind]}: ${record?.title ?? ''}`);
  bar.append(title);
  if (!DETAIL_NAMES[top.kind]) return;
  const tools = el('div', 'top-actions');
  tools.append(iconButton('edit', 'Edit ' + DETAIL_NAMES[top.kind], () => app.actions.editEntity(top.kind, top.id)));
  const more = iconButton('more_vert', 'More options', () => openMenu(more, app.actions.detailMenu(top)));
  tools.append(more);
  bar.append(tools);
}

function navigationBar(app) {
  const nav = app.dom.nav;
  if (!nav.children.length) {
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
  for (const item of nav.children) {
    const on = item.dataset.tab === app.state.tab;
    item.setAttribute('aria-current', on ? 'page' : 'false');
    item.querySelector('.ms').classList.toggle('fill', on);
  }
}

function fab(app) {
  const host = app.dom.fab;
  host.replaceChildren();
  const spec = app.current() ? null : app.actions.fabFor(app.state.tab);
  host.hidden = !spec;
  app.dom.planner.dataset.fab = String(!!spec);
  if (!spec) return;
  const node = iconButton('add', spec.label, spec.onClick, {cls: 'fab'});
  host.append(node);
}

export function renderShell(app) {
  const top = app.current();
  const full = top && FULL_SCREENS.has(top.kind);
  const root = app.dom.planner;
  root.dataset.view = top?.kind ?? app.state.tab;
  root.dataset.detail = String(!!top);
  app.dom.nav.hidden = !!full;
  navigationBar(app);
  fab(app);
  const bar = app.dom.topBar;
  bar.replaceChildren();
  bar.hidden = top?.kind === 'review';
  if (top?.kind === 'search') app.renderers.searchBar(app, bar);
  else if (top) detailBar(app, bar, top);
  else rootBar(app, bar);
}
