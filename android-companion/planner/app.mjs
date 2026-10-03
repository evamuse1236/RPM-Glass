/** Planner state, navigation and the save path shared by every screen module. */
import {animateRerender, settleRerender, sharedAxis, fadeThrough, ghost, reducedMotion} from '../surface-motion.mjs';
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

/** How the screen changes between two routes: shared axis X for sibling and parent/child moves, fade through otherwise. */
function transitionFor(previousKey, key, direction) {
  if (direction === 'right') return {kind: 'axis', back: false};
  if (direction === 'left') return {kind: 'axis', back: true};
  const days = [previousKey, key].map(k => /^today:(\d{4}-\d{2}-\d{2}):/.exec(k)?.[1]);
  if (days[0] && days[1] && days[0] !== days[1]) return {kind: 'axis', back: days[1] < days[0]};
  return {kind: 'fade'};
}

function buildScreen(app, kind, top) {
  app.dom.work.replaceChildren();
  app.dom.work.className = 'screen screen-' + kind;
  app.renderers.screen(app, kind, top);
}

/**
 * Re-render the shell and the current screen.
 * - A commit (no options) rebuilds in place: surviving rows slide, removed rows collapse, new rows open, scroll and
 *   focus stay (animateRerender).
 * - A route change runs one transition: shared axis X for push/pop and day to day (reversed on Back), fade through
 *   for tabs. Outgoing and incoming are both visible; the top bar moves with its page.
 * `reset` restores the position last seen on that screen.
 */
export function render(app, {reset = false, direction = ''} = {}) {
  const key = screenKey(app);
  const previousKey = app.lastKey;
  const changed = previousKey !== key;
  const {work, scroll, topBar, planner} = app.dom;
  const scrollTop = scroll.scrollTop;
  if (previousKey) app.positions.set(previousKey, scrollTop);
  app.lastKey = key;
  const top = app.current();
  const kind = top?.kind ?? app.state.tab;

  if (!previousKey || (!changed && !direction)) {
    app.renderers.shell(app);
    if (app.mounted && app.mounted.key === key) return;
    if (!previousKey) {
      buildScreen(app, kind, top);
      scroll.scrollTop = app.positions.get(key) ?? app.renderers.defaultScroll(app, kind);
    } else {
      animateRerender(work, scroll, () => buildScreen(app, kind, top));
    }
    if (changed && kind === 'today') app.renderers.refreshCalendar(app);
    return;
  }

  // Route change: freeze what is on screen, build the new screen, then move one into the other.
  settleRerender(work);
  const motion = !reducedMotion();
  const pageRect = scroll.getBoundingClientRect();
  const barRect = topBar.hidden ? null : topBar.getBoundingClientRect();
  const mountedBefore = !!app.mounted;
  const oldPage = motion ? [...work.childNodes].map(n => (mountedBefore ? n.cloneNode(true) : n)) : [];
  const oldBar = motion && barRect ? [...topBar.childNodes] : [];
  const oldWorkClass = work.className;
  const oldBarClass = topBar.className;
  if (changed) unmount(app);
  app.renderers.shell(app);
  const keepMounted = app.mounted && app.mounted.key === key;
  if (!keepMounted) buildScreen(app, kind, top);
  scroll.scrollTop = reset || changed ? (app.positions.get(key) ?? app.renderers.defaultScroll(app, kind)) : scrollTop;
  if (changed && kind === 'today') app.renderers.refreshCalendar(app);
  if (!motion) return;
  const outgoing = [ghost(oldPage, pageRect, planner, {cls: oldWorkClass + ' motion-ghost-page', scrollTop})];
  if (oldBar.length) outgoing.push(ghost(oldBar, barRect, planner, {cls: oldBarClass + ' motion-ghost-bar'}));
  const incoming = [work, topBar.hidden ? null : topBar];
  const plan = transitionFor(previousKey, key, direction);
  if (plan.kind === 'axis') sharedAxis(outgoing, incoming, {back: plan.back});
  else fadeThrough(outgoing, incoming);
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
      // Close after the caller's follow-up: a caller that opens the next sheet right away replaces this one in
      // place (one motion), instead of the sheet sliding away and rising again.
      const epoch = app.sheet.epoch;
      setTimeout(() => { if (epoch === app.sheet.epoch) closeSheet(app); }, 0);
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
