/** Planner state, navigation and the save path shared by every screen module. */
import {enterSurface} from '../surface-motion.mjs';
import {planner, localDay} from '../planner-state.mjs';
import {taskContext, areaTone} from '../planner-ux.mjs';
import {clarityPreferences, applyClarityPreferences} from '../planner-clarity.mjs';
import {notice} from './snackbar.mjs';
import {closeSheet, discardDraft, isSheetOpen} from './sheet.mjs';
import {closeMenu} from './menu.mjs';

export const TABS = ['today', 'blocks', 'projects', 'life'];
/** Names Capture uses for the planning focus (see planner-tools planningFocus). */
export const CAPTURE_VIEWS = {today: 'day', blocks: 'rpm', projects: 'projects', life: 'life'};
/** Pushed screens that cover the whole window (no navigation bar). */
export const FULL_SCREENS = new Set(['settings', 'search', 'review']);

export function createApp(api, renderers) {
  const preferences = applyClarityPreferences(clarityPreferences());
  const dom = {
    planner: document.getElementById('planner'),
    topBar: document.getElementById('top-bar'),
    scroll: document.getElementById('planner-scroll'),
    work: document.getElementById('workspace'),
    fab: document.getElementById('fab-host'),
    nav: document.getElementById('nav-bar'),
    sheet: document.getElementById('sheet'),
    snackbar: document.getElementById('snackbar'),
  };
  const now = new Date();
  const app = {
    api,
    dom,
    renderers,
    state: {
      tab: 'today',
      stack: [],
      day: localDay(),
      year: now.getFullYear(),
      horizon: 'yearly',
      period: now.getMonth() + 1,
      dayLayout: preferences.dayLayout,
      projectFilter: null,
      blockFilter: null,
      blockStatus: 'active',
      lifeFilter: null,
      completedOpen: false,
      wheel: 'bars',
      focusedTaskId: null,
      focusedBlockId: null,
      calendar: [],
      calendarState: 'Checking…',
      settingsSection: 'settings',
    },
    sheet: {epoch: 0, version: null, draftKey: null, draftValues: {}, returnFocus: null},
    positions: new Map(),
    recentlyCompleted: new Map(),
    mounted: null,
    lastKey: null,
    saving: false,
  };

  app.data = () => api.getData();
  app.p = () => planner(app.data());
  app.context = task => taskContext(app.data(), task);
  app.tone = area => areaTone(area, app.p().areas);
  app.activeBlocks = () => app.p().blocks.filter(block => !block.archived);
  app.projectArea = project => {
    const goal = app.p().goals.find(g => g.id === project?.goalId);
    return app.p().areas.find(area => area.id === goal?.areaId);
  };
  app.blockArea = block => app.projectArea(app.p().projects.find(pr => pr.id === block?.projectId));
  app.current = () => app.state.stack.at(-1) ?? null;
  app.largeText = () => (api.getPhone().effectiveFontScale ?? api.getPhone().fontScale ?? 1) >= 1.5;
  app.notice = (message, options) => notice(app, message, options);
  app.render = options => render(app, options);
  app.commit = (op, options) => commit(app, op, options);
  app.closeSheet = () => closeSheet(app);
  installNavigation(app);
  return app;
}

function installNavigation(app) {
  const {state} = app;
  app.push = (kind, id = null, {replace = false} = {}) => {
    if (replace) state.stack.pop();
    state.stack.push({kind, id});
    closeSheet(app);
    closeMenu();
    render(app, {reset: true, direction: 'right'});
  };
  app.back = () => {
    if (!state.stack.length) return false;
    state.stack.pop();
    render(app, {reset: true, direction: 'left'});
    return true;
  };
  app.goTab = tab => {
    const same = tab === state.tab && !state.stack.length;
    if (same) {
      dom(app).scroll.scrollTo({top: 0, behavior: 'smooth'});
      return;
    }
    const direction = TABS.indexOf(tab) >= TABS.indexOf(state.tab) ? 'up' : 'down';
    state.stack = [];
    state.tab = tab;
    state.focusedTaskId = null;
    state.focusedBlockId = null;
    render(app, {reset: true, direction});
  };
  app.openBlock = id => {
    state.focusedBlockId = id;
    state.focusedTaskId = null;
    app.push('blocks', id);
  };
  app.openProject = id => app.push('projects', id);
  app.openArea = id => app.push('areas', id);
  app.openGoal = id => app.push('goals', id);
  app.openSearch = () => app.push('search');
  app.openReview = () => app.push('review');
  app.openSettings = (section = 'settings') => {
    state.settingsSection = section;
    closeSheet(app);
    if (app.current()?.kind === 'settings') {
      app.mounted?.controller?.destroy?.();
      app.mounted = null;
      render(app, {reset: true});
      return;
    }
    app.push('settings');
  };
  app.capture = () => {
    const tab = state.tab;
    const focus = {
      view: CAPTURE_VIEWS[tab],
      day: state.day,
      taskId: state.focusedTaskId,
      blockId: state.focusedBlockId,
      projectId: app.current()?.kind === 'projects' ? app.current().id : null,
    };
    try { localStorage.setItem('rpm-capture-context', JSON.stringify(focus)); } catch {}
    app.api.native('capture').catch(error => app.notice(error.message));
  };
}

const dom = app => app.dom;

/** Identifies a screen for scroll restoration and for keeping mounted screens alive. */
export function screenKey(app) {
  const top = app.current();
  if (top) return `${top.kind}:${top.id ?? ''}`;
  const {state} = app;
  if (state.tab === 'today') return `today:${state.day}:${state.dayLayout}`;
  if (state.tab === 'life') return `life:${state.year}:${state.horizon}:${state.period}`;
  return state.tab;
}

function unmount(app) {
  app.mounted?.controller?.destroy?.();
  app.mounted = null;
}

/**
 * Re-render the shell and the current screen. Ordinary rerenders keep scroll;
 * `reset` restores the position last seen on that screen.
 */
export function render(app, {reset = false, direction = ''} = {}) {
  const key = screenKey(app);
  const changed = app.lastKey !== key;
  const scroll = app.dom.scroll.scrollTop;
  if (app.lastKey) app.positions.set(app.lastKey, scroll);
  app.lastKey = key;
  if (changed) unmount(app);
  app.renderers.shell(app);

  const top = app.current();
  const kind = top?.kind ?? app.state.tab;
  const keepMounted = app.mounted && app.mounted.key === key;
  if (!keepMounted) {
    app.dom.work.replaceChildren();
    app.dom.work.className = 'screen screen-' + kind;
    app.renderers.screen(app, kind, top);
  }
  app.dom.scroll.scrollTop = reset || changed
    ? (app.positions.get(key) ?? app.renderers.defaultScroll(app, kind))
    : scroll;
  if (reset || direction || changed) enterSurface(app.dom.work, direction || 'fade');
  if (changed && kind === 'today') app.renderers.refreshCalendar(app);
}

/** Apply a planner op (or a review mutator function) through the native save path. */
export async function commit(app, op, {keepSheet = false, label = 'Saved', undo = true} = {}) {
  if (app.saving) return undefined;
  app.saving = true;
  try {
    if (isSheetOpen(app) && app.sheet.version !== app.data().version) {
      throw new Error('Saved data changed while editing. Close this sheet and reopen it to review.');
    }
    const id = await app.api.commit(op);
    app.sheet.version = app.data().version;
    if (!keepSheet) {
      discardDraft(app);
      closeSheet(app);
    }
    render(app);
    if (label) notice(app, label, {undo});
    return id;
  } catch (error) {
    const slot = app.dom.sheet.hidden ? null : app.dom.sheet.querySelector('.sheet-error');
    if (slot) slot.textContent = error.message;
    else notice(app, error.message);
    throw error;
  } finally {
    app.saving = false;
  }
}
