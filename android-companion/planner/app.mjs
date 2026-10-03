/** Planner state, navigation and the save path shared by every screen module. */
import {animateRerender, settleRerender, sharedAxis, fadeThrough, ghost, reducedMotion, snapshotRows, landRows,
  releaseTail, MOTION} from '../surface-motion.mjs';
import {planner, localDay, editPlan} from '../planner-state.mjs';
import {taskContext, areaTone} from '../planner-ux.mjs';
import {clarityPreferences, applyClarityPreferences} from '../planner-clarity.mjs';
import {notice} from './snackbar.mjs';
import {closeSheet, discardDraft, isSheetOpen} from './sheet.mjs';
import {closeMenu} from './menu.mjs';
import {carryFocus} from './inline-edit.mjs';

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

  // Ops typed faster than the bridge saves (the Plan's add row): the screen shows them at once, on a copy of the
  // saved data, and each leaves this list the moment its save lands (or fails).
  app.pending = [];
  const preview = {base: null, ops: null, data: null};
  app.data = () => {
    const base = api.getData();
    if (!app.pending.length) return base;
    if (preview.base !== base || preview.ops?.length !== app.pending.length || preview.ops.some((p, i) => p !== app.pending[i])) {
      const copy = structuredClone(base);
      for (const p of app.pending) { try { editPlan(copy, p.op); } catch {} }
      Object.assign(preview, {base, ops: [...app.pending], data: copy});
    }
    return preview.data;
  };
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
  // While a sheet is open the page behind it re-renders at once (nothing moves under the scrim); when the sheet
  // closes, the rows changed meanwhile slide from where the user last saw them to their new places.
  app.backdrop = null;
  app.onSheetClose = () => {
    const snapshot = app.backdrop;
    app.backdrop = null;
    if (snapshot) landRows(app.dom.work, app.dom.scroll, snapshot, {delay: MOTION.fadeOut});
  };
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

/** How the screen changes between two routes: shared axis X for sibling and parent/child moves, shared axis Y into
 * and out of the weekly review (a step down in hierarchy), fade through otherwise. */
function transitionFor(previousKey, key, direction) {
  const review = [previousKey, key].some(k => k?.startsWith('review:'));
  if (direction === 'right') return {kind: 'axis', back: false, axis: review ? 'y' : 'x'};
  if (direction === 'left') return {kind: 'axis', back: true, axis: review ? 'y' : 'x'};
  const days = [previousKey, key].map(k => /^today:(\d{4}-\d{2}-\d{2}):/.exec(k)?.[1]);
  if (days[0] && days[1] && days[0] !== days[1]) return {kind: 'axis', back: days[1] < days[0]};
  return {kind: 'fade'};
}

function buildScreen(app, kind, top) {
  releaseTail(app.dom.work);
  app.dom.work.replaceChildren();
  app.dom.work.className = 'screen screen-' + kind;
  app.renderers.screen(app, kind, top);
}

/** Build the screen off-document, for animateRerender to reconcile into the live one (unchanged rows stay put). */
function stageScreen(app, kind, top) {
  const live = app.dom.work;
  const stage = document.createElement('section');
  stage.className = 'screen screen-' + kind;
  app.dom.work = stage;
  try {
    app.renderers.screen(app, kind, top);
  } finally {
    app.dom.work = live;
  }
  return stage;
}

/** The FAB and the navigation bar leave and arrive with the page instead of snapping. */
function shellBefore(app) {
  const {fab, nav, planner} = app.dom;
  const button = !fab.hidden && fab.firstElementChild;
  return {fab: button ? {node: button.cloneNode(true), rect: button.getBoundingClientRect(),
    label: button.getAttribute('aria-label')} : null,
  nav: nav.hidden ? null : {rect: nav.getBoundingClientRect(), node: nav.cloneNode(true)}, host: planner};
}

function shellAfter(app, before, motion, outgoing, incoming) {
  const {fab, nav} = app.dom;
  const button = !fab.hidden && fab.firstElementChild;
  if (!motion) return;
  // The FAB belongs to its page: it rides the page's own transition (the same layers, the same motion), leaving with
  // the outgoing page and arriving with the incoming one, with no motion of its own on top.
  if (before.fab && !button) outgoing.push(ghost([before.fab.node], before.fab.rect, before.host, {cls: 'motion-ghost-fab'}));
  else if (button && !before.fab) incoming.push(button);
  if (before.nav && nav.hidden) outgoing.push(ghost([before.nav.node], before.nav.rect, before.host, {cls: 'motion-ghost-nav'}));
  else if (!before.nav && !nav.hidden) incoming.push(nav);
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
    app.renderers.shell(app, {keep: !!previousKey && !changed});
    if (app.mounted && app.mounted.key === key) return;
    if (!previousKey) {
      buildScreen(app, kind, top);
      scroll.scrollTop = app.positions.get(key) ?? app.renderers.defaultScroll(app, kind);
    } else {
      const covered = isSheetOpen(app);
      if (covered && !app.backdrop && !reducedMotion()) app.backdrop = snapshotRows(work, scroll);
      animateRerender(work, scroll, () => stageScreen(app, kind, top), {enabled: !covered});
      // A field the user was in that had to be rebuilt hands its focus, caret and unsaved words to its twin.
      carryFocus(work);
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
  const shell = shellBefore(app);
  app.backdrop = null;
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
  shellAfter(app, shell, motion, outgoing, incoming);
  const plan = transitionFor(previousKey, key, direction);
  if (plan.kind === 'axis') sharedAxis(outgoing, incoming, {back: plan.back, axis: plan.axis});
  else fadeThrough(outgoing, incoming);
}

/**
 * Apply a planner op (or a review mutator function) through the native save path. `render: false` leaves the screen
 * to the caller (a completed row re-renders the page once its tick has been seen). A sheet that closes after the save
 * leaves first; the snackbar follows once it is gone, never over the leaving sheet.
 */
export async function commit(app, op, {keepSheet = false, label = 'Saved', undo = true, render: redraw = true,
  pending = null} = {}) {
  if (app.saving) return undefined;
  app.saving = true;
  try {
    if (isSheetOpen(app) && app.sheet.version !== app.data().version) {
      throw new Error('Saved data changed while editing. Close this sheet and reopen it to review.');
    }
    let id;
    try { id = await app.api.commit(op); } finally { if (pending) app.pending = app.pending.filter(p => p !== pending); }
    app.sheet.version = app.data().version;
    const closing = !keepSheet && !app.dom.sheet.hidden;
    if (!keepSheet) {
      discardDraft(app);
      // Close after the caller's follow-up: a caller that opens the next sheet right away replaces this one in
      // place (one motion), instead of the sheet sliding away and rising again.
      const epoch = app.sheet.epoch;
      setTimeout(() => {
        if (epoch === app.sheet.epoch) closeSheet(app);
        if (closing && label) notice(app, label, {undo});
      }, 0);
    }
    if (redraw) render(app);
    // Raised after the caller's follow-up, so a caller that closes the sheet right after saving (Add) gets the
    // snackbar once the sheet is gone rather than over it.
    if (label && !closing) setTimeout(() => notice(app, label, {undo}), 0);
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
