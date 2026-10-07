/** Chooses the screen for the current route and mounts the long-lived ones (Settings, Weekly review). */
import {localDay, shiftDay} from '../planner-state.mjs';
import {mountSettings} from '../settings.mjs';
import {mountClaritySettings} from '../planner-clarity.mjs';
import {mountWeeklyReview} from '../weekly-review.mjs';
import {el, emptyState} from './dom.mjs';
import {renderToday, todayScroll, selectDay} from './today.mjs';
import {renderBlocks, renderBlockDetail} from './blocks.mjs';
import {renderProjects, renderProjectDetail} from './projects.mjs';
import {renderLife, renderAreaDetail, renderGoalDetail, shiftLifePeriod} from './life.mjs';
import {renderSearch} from './search.mjs';
import {screenKey} from './app.mjs';
import {userMessage} from '../user-message.mjs';

const DETAILS = {blocks: renderBlockDetail, projects: renderProjectDetail, areas: renderAreaDetail, goals: renderGoalDetail};
const ROOTS = {today: renderToday, blocks: renderBlocks, projects: renderProjects, life: renderLife};

function mountSettingsScreen(app, host) {
  let settings = null;
  let clarity = null;
  try {
    settings = mountSettings((action, payload = {}) => app.api.native(action, payload), host,
      {onBack: () => app.back(), section: app.state.settingsSection});
    clarity = mountClaritySettings(host);
  } catch (error) {
    host.replaceChildren(emptyState({symbol: 'error', title: 'Settings unavailable',
      body: userMessage(error, 'Could not load settings.'), action: () => app.openSettings(), label: 'Try again'}));
  }
  app.mounted = {key: screenKey(app), controller: {
    handleBack: () => settings?.handleBack?.() ?? false,
    destroy() {
      clarity?.destroy?.();
      settings?.destroy?.();
    },
  }};
}

/**
 * The review flow owns its own bar, steps and scrolling; the planner supplies data, saving and navigation.
 * A null label saves step progress quietly: no snackbar, no Undo offer.
 */
function mountReview(app, host) {
  const ctx = {
    getData: () => app.data(),
    commit: (mutator, label) => app.commit(mutator, {label: label ?? null, undo: label != null, keepSheet: true}),
    close: () => {
      app.state.stack = [];
      app.state.tab = 'today';
      app.render({reset: true, direction: 'down'});
    },
    openBlock: id => app.openBlock(id),
    openCapture: () => app.capture(),
    openTask: id => app.actions.openTask(id),
    archiveTask: task => app.actions.archiveTask(task),
    deleteTask: task => app.actions.deleteTask(task),
    scheduleTask: (task, anchor) => app.actions.scheduleTask(task, anchor),
    sortInbox: () => app.actions.jevSort(),
    readCalendar: anchor => app.api.native('calendarRead', {anchor}),
    now: () => new Date(),
    day: () => localDay(),
  };
  const handle = mountWeeklyReview(host, ctx);
  app.mounted = {key: screenKey(app), controller: {
    handleBack: () => !!handle?.back?.(),
    refresh: () => handle?.refresh?.(),
    destroy: () => handle?.destroy?.(),
  }};
}

export function renderScreen(app, kind, top) {
  const page = el('div', 'page');
  app.dom.work.append(page);
  if (kind === 'settings') return mountSettingsScreen(app, page);
  if (kind === 'review') return mountReview(app, page);
  if (kind === 'search') return renderSearch(app, page);
  if (top) {
    const record = app.p()[kind]?.find(item => item.id === top.id);
    if (!record) {
      app.state.stack.pop();
      app.notice('That item is no longer available.');
      queueMicrotask(() => app.render({reset: true}));
      return undefined;
    }
    return DETAILS[kind](app, page, record);
  }
  return ROOTS[kind](app, page);
}

export function defaultScroll(app, kind) {
  return kind === 'today' ? todayScroll(app) : 0;
}

/** Horizontal swipes: change day on Today, period on Life, Project in Project detail. */
export function installSwipe(app) {
  const node = app.dom.work;
  let start = null;
  let suppress = false;
  const ignore = '.task-row,.chip-row,.week-strip,input,textarea,select,.wheel-card,.tabs';
  node.addEventListener('pointerdown', event => {
    start = event.target.closest(ignore) ? null : {x: event.clientX, y: event.clientY};
  });
  node.addEventListener('pointercancel', () => { start = null; });
  node.addEventListener('pointerup', event => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5 || !app.dom.sheet.hidden) return;
    const step = dx < 0 ? 1 : -1;
    const top = app.current();
    suppress = true;
    setTimeout(() => { suppress = false; }, 400);
    if (!top && app.state.tab === 'today') selectDay(app, shiftDay(app.state.day, step), step > 0 ? 'right' : 'left');
    else if (!top && app.state.tab === 'life' && app.state.horizon !== 'values') shiftLifePeriod(app, step);
    else if (top?.kind === 'projects' && app.p().projects.length > 1) {
      const ids = app.p().projects.map(pr => pr.id);
      const next = ids[(Math.max(0, ids.indexOf(top.id)) + step + ids.length) % ids.length];
      app.push('projects', next, {replace: true});
    } else suppress = false;
  });
  node.addEventListener('click', event => {
    if (!suppress) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppress = false;
  }, true);
}
