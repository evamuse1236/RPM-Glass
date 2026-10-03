/** Planner entry: wires the per-screen modules in ./planner/ and the native hooks. */
import {animateLayout} from './surface-motion.mjs';
import {createApp, TABS} from './planner/app.mjs';
import {renderShell} from './planner/shell.mjs';
import {renderScreen, defaultScroll, installSwipe} from './planner/screens.mjs';
import {stableKey} from './planner/format.mjs';
import {dismissSheet, installSheetKeys} from './planner/sheet.mjs';
import {closeMenu} from './planner/menu.mjs';
import {setDayLayout} from './planner/today.mjs';
import {openTask, taskEditor, movePicker, planOrder, archiveTask, deleteTask, showTrash, showInbox}
  from './planner/task-sheets.mjs';
import {entityEditor, contextEditor, detailMenu} from './planner/entities.mjs';
import {refreshCalendar, calendarDetails, calendarEditor, datePicker} from './planner/calendar-ui.mjs';
import {aiAction, examples} from './planner/jev.mjs';
import {searchBar} from './planner/search.mjs';
import {componentGallery} from './planner/gallery.mjs';

/** A Goal drafted by Capture: keeps the exact source words; entity fields stay within limits. */
export function capturedGoalDraft(target) {
  if (target?.view !== 'life' || !target.draft || typeof target.draft !== 'object') return null;
  const draft = target.draft;
  const sourceRaw = typeof draft.sourceRaw === 'string' ? draft.sourceRaw : '';
  const title = typeof draft.title === 'string' ? draft.title : '';
  const year = Number(draft.year);
  if (!sourceRaw || !title.trim() || !Number.isInteger(year) || year < 2000 || year > 2200) return null;
  const horizon = ['yearly', 'quarterly', 'monthly'].includes(draft.horizon) ? draft.horizon : 'yearly';
  return {
    key: 'goal-capture:' + stableKey(`${title}\n${year}\n${sourceRaw}`),
    sourceRaw,
    values: {
      title: title.slice(0, 200),
      purpose: typeof draft.purpose === 'string' ? draft.purpose.slice(0, 8000) : '',
      notes: typeof draft.notes === 'string' ? draft.notes.slice(0, 8000) : '',
      areaId: draft.areaId ?? null,
      year,
      horizon,
      period: draft.period ?? null,
    },
  };
}

/** UUID entities dispatch by collection; tasks need numeric ids. */
export function savedPlannerTarget(target) {
  if (target?.id == null) return null;
  const collection = target.collection ?? ({rpm: 'blocks', projects: 'projects', life: 'goals'}[target.view]);
  if (['blocks', 'projects', 'goals', 'areas'].includes(collection)) return {collection, id: target.id};
  if ((collection == null || collection === 'tasks') && typeof target.id === 'number') return {collection: 'tasks', id: target.id};
  return null;
}

const SETTINGS_VIEWS = ['settings', 'alarm_sound', 'reminder_sound', 'ai_connection', 'notifications', 'exact_alarms',
  'import_export'];
const VIEW_TABS = {day: 'today', rpm: 'blocks', projects: 'projects', life: 'life'};

function installActions(app) {
  const fabs = {
    blocks: {label: 'New Block', onClick: () => entityEditor(app, 'blocks')},
    projects: {label: 'New Project', onClick: () => entityEditor(app, 'projects')},
  };
  app.actions = {
    openTask: (id, occurrence) => openTask(app, id, occurrence),
    addTask: overrides => taskEditor(app, null, overrides),
    planOrder: task => planOrder(app, task),
    movePicker: task => movePicker(app, task),
    archiveTask: task => archiveTask(app, task),
    deleteTask: task => deleteTask(app, task),
    trash: archive => showTrash(app, archive),
    inbox: () => showInbox(app),
    newEntity: (collection, defaults = {}) => entityEditor(app, collection, null, defaults),
    editEntity: (collection, id) => entityEditor(app, collection, id),
    contextEditor: () => contextEditor(app),
    detailMenu: top => detailMenu(app, top),
    calendar: () => calendarEditor(app),
    calendarDetails: event => calendarDetails(app, event),
    datePicker: () => datePicker(app),
    setDayLayout: value => setDayLayout(app, value),
    jevSort: () => aiAction(app, 'sort'),
    purposeIdea: blockId => aiAction(app, 'purpose', blockId),
    examples: () => examples(app),
    gallery: () => componentGallery(app),
    fabFor: tab => {
      if (tab !== 'life') return fabs[tab] ?? null;
      if (app.state.horizon === 'values') return null;
      if (app.state.horizon === 'yearly') return {label: 'Add Area', onClick: () => entityEditor(app, 'areas')};
      return {label: 'Add Goal', onClick: () => entityEditor(app, 'goals')};
    },
  };
}

function installBack(app) {
  window.rpmOpenSettings = section => app.openSettings(section);
  window.rpmHandleBack = () => {
    if (closeMenu()) return true;
    if (!app.dom.sheet.hidden) {
      dismissSheet(app);
      return true;
    }
    if (app.mounted?.controller?.handleBack?.()) return true;
    if (app.back()) return true;
    if (app.state.tab !== 'today') {
      app.goTab('today');
      return true;
    }
    return false;
  };
}

function installNativeHooks(app) {
  const root = document.documentElement;
  const syncPhone = () => {
    const large = String(app.largeText());
    const changed = root.dataset.largeText !== large;
    root.dataset.largeText = large;
    return changed;
  };
  window.addEventListener('rpm-data-refresh', () => {
    if (app.dom.sheet.hidden) app.render();
    else app.notice('Saved data changed. Review before saving.');
  });
  window.addEventListener('rpm-phone-status', () => {
    if (syncPhone() && app.dom.sheet.hidden) app.render();
    refreshCalendar(app);
  });
  window.rpmSurfaceInsets = ({bottom, width, animate}) => {
    if (!Number.isFinite(bottom) || !Number.isFinite(width) || width <= 0) return;
    const inset = Math.max(0, bottom * innerWidth / width) + 'px';
    if (root.style.getPropertyValue('--keyboard-inset') === inset) return;
    const sheet = app.dom.sheet;
    const regions = [
      {node: sheet, scale: false},
      ...['.sheet-handle', '.sheet-header', '.sheet-actions'].map(selector => ({node: sheet.querySelector(selector)})),
      {node: sheet.querySelector('.sheet-body'), clip: true},
      {node: app.dom.nav}, {node: app.dom.fab}, {node: app.dom.snackbar},
    ];
    animateLayout(document.body, regions, () => {
      root.dataset.nativeInsets = 'true';
      root.style.setProperty('--keyboard-inset', inset);
    }, {duration: 240, enabled: animate});
  };
  if (window.rpmSurfaceInsetsValue) window.rpmSurfaceInsets(window.rpmSurfaceInsetsValue);
  if (window.visualViewport) {
    const sync = () => root.style.setProperty('--visual-height', window.visualViewport.height + 'px');
    window.visualViewport.addEventListener('resize', sync);
    sync();
  }
  let lastTop = 0;
  app.dom.scroll.addEventListener('scroll', () => {
    const top = app.dom.scroll.scrollTop;
    // The FAB steps aside while reading down and returns on the way back up, so it never sits on what is read.
    if (Math.abs(top - lastTop) > 8 || top < 8) {
      const hide = String(top > lastTop && top > 64);
      if (app.dom.planner.dataset.fabAside !== hide) app.dom.planner.dataset.fabAside = hide;
      lastTop = top;
    }
    const scrolled = String(top > 4);
    if (app.dom.planner.dataset.scrolled !== scrolled) app.dom.planner.dataset.scrolled = scrolled;
    // A detail page's large title hands over to the bar only once its text has scrolled fully out of view.
    const big = app.dom.work.querySelector('.detail-title-text');
    const out = String(big ? big.getBoundingClientRect().bottom - parseFloat(getComputedStyle(big).paddingBottom)
      <= app.dom.scroll.getBoundingClientRect().top : scrolled === 'true');
    if (app.dom.planner.dataset.titleOut !== out) app.dom.planner.dataset.titleOut = out;
  }, {passive: true});
  new ResizeObserver(() => {
    if (!app.dom.nav.hidden) root.style.setProperty('--nav-measured', app.dom.nav.getBoundingClientRect().height + 'px');
  }).observe(app.dom.nav);
  syncPhone();
}

function openSaved(app, saved) {
  const {state} = app;
  const p = app.p();
  const exists = collection => p[collection].some(item => item.id === saved.id);
  if (saved.collection === 'blocks') {
    if (exists('blocks')) app.openBlock(saved.id);
    else app.notice('This Block is no longer available.');
  } else if (saved.collection === 'projects') {
    if (exists('projects')) app.openProject(saved.id);
    else app.notice('This Project is no longer available.');
  } else if (saved.collection === 'goals') {
    const goal = p.goals.find(g => g.id === saved.id);
    if (!goal) return app.notice('This Goal is no longer available.');
    Object.assign(state, {year: goal.year, lifeFilter: goal.areaId ?? null, horizon: goal.horizon ?? 'yearly',
      tab: 'life', stack: []});
    if (goal.horizon === 'quarterly') state.period = (goal.period - 1) * 3 + 1;
    else if (goal.period) state.period = goal.period;
    app.openGoal(goal.id);
  } else if (saved.collection === 'areas') {
    if (!exists('areas')) return app.notice('This Area is no longer available.');
    Object.assign(state, {lifeFilter: saved.id, tab: 'life', stack: []});
    app.openArea(saved.id);
  } else {
    openTask(app, saved.id);
  }
  return undefined;
}

/** Deep links from Capture, notifications and native settings. */
function openView(app, target) {
  const {state} = app;
  const draft = capturedGoalDraft(target);
  if (draft) {
    Object.assign(state, {year: draft.values.year, horizon: draft.values.horizon, lifeFilter: draft.values.areaId ?? null,
      tab: 'life', stack: []});
    if (draft.values.horizon === 'quarterly') state.period = (Number(draft.values.period || 1) - 1) * 3 + 1;
    else if (draft.values.period) state.period = Number(draft.values.period);
    app.render({reset: true});
    entityEditor(app, 'goals', null, draft.values, draft);
    return;
  }
  if (SETTINGS_VIEWS.includes(target.view)) return app.openSettings(target.section ?? target.view);
  const saved = savedPlannerTarget(target);
  if (saved) return openSaved(app, saved);
  if (target.view === 'ideas') return aiAction(app, 'ideas');
  if (target.view === 'vision') return contextEditor(app);
  if (target.view === 'calendar') return calendarEditor(app);
  if (target.view === 'review') return app.openReview();
  if (target.view === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(target.date ?? '')) state.day = target.date;
  const tab = VIEW_TABS[target.view];
  if (tab) {
    state.tab = tab;
    state.stack = [];
    app.render({reset: true});
  }
  return undefined;
}

export function mountPlanner(api) {
  const app = createApp(api, {shell: renderShell, screen: renderScreen, defaultScroll, refreshCalendar, searchBar});
  installActions(app);
  installSheetKeys(app);
  installBack(app);
  installNativeHooks(app);
  installSwipe(app);
  app.render({reset: true});
  return {
    render: () => app.render(),
    taskEditor: (id, overrides) => taskEditor(app, id ?? null, overrides),
    goalIdeas: () => aiAction(app, 'ideas'),
    contextEditor: () => contextEditor(app),
    openView: target => openView(app, target),
    tabs: TABS,
  };
}
