/** Planner entry: wires the per-screen modules in ./planner/ and the native hooks. */
import {animateLayout, reducedMotion, slideScroll, EASE, DURATION} from './surface-motion.mjs';
import {createApp, TABS} from './planner/app.mjs';
import {renderShell} from './planner/shell.mjs';
import {renderScreen, defaultScroll, installSwipe} from './planner/screens.mjs';
import {stableKey} from './planner/format.mjs';
import {dismissSheet, installSheetKeys} from './planner/sheet.mjs';
import {closeMenu} from './planner/menu.mjs';
import {setDayLayout} from './planner/today.mjs';
import {openTask, taskEditor, movePicker, planOrder, archiveTask, deleteTask, showTrash, showInbox, scheduleMenu,
  closeSchedule} from './planner/task-sheets.mjs';
import {entityEditor, contextEditor, detailMenu} from './planner/entities.mjs';
import {refreshCalendar, calendarDetails, calendarEditor, datePicker, resolveClash} from './planner/calendar-ui.mjs';
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
    scheduleTask: (task, anchor) => scheduleMenu(app, task, anchor, {occurrence: task.occurrence}),
    trash: archive => showTrash(app, archive),
    inbox: () => showInbox(app),
    newEntity: (collection, defaults = {}) => entityEditor(app, collection, null, defaults),
    editEntity: (collection, id) => entityEditor(app, collection, id),
    contextEditor: () => contextEditor(app),
    detailMenu: top => detailMenu(app, top),
    calendar: () => calendarEditor(app),
    calendarDetails: event => calendarDetails(app, event),
    resolveClash: items => resolveClash(app, items),
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
  // Escape is Back inside the sheet too: it reaches here before the sheet's own handler.
  app.dom.sheet.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !app.sheet.onBack?.()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  // With focus lost to the page (a chosen row folded away), Escape still acts as Back for the open sheet.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || app.dom.sheet.hidden) return;
    if (app.dom.sheet.contains(event.target) || event.target.closest?.('.menu')) return;
    event.preventDefault();
    window.rpmHandleBack();
  });
  window.rpmOpenSettings = section => app.openSettings(section);
  window.rpmHandleBack = () => {
    if (closeSchedule()) return true;
    if (closeMenu()) return true;
    if (!app.dom.sheet.hidden) {
      // An open inline chooser is the topmost layer: Back closes it before the sheet.
      if (!app.sheet.onBack?.()) dismissSheet(app);
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

/**
 * Focus rings are for keyboard navigation. Focus handed back by the app (Back to the Inbox, a closed sheet returning
 * to its row) after a touch, or after Android Back (Escape in the harness), would otherwise draw a hard ring on a
 * touch screen; Tab and the arrow keys turn rings on, a touch turns them off (planner.css).
 */
function installFocusModality() {
  const root = document.documentElement;
  document.addEventListener('keydown', event => {
    if (/^(Tab|Arrow|Home|End|PageUp|PageDown)/.test(event.key) && root.dataset.keyboardNav !== 'true') root.dataset.keyboardNav = 'true';
  }, true);
  document.addEventListener('pointerdown', () => {
    if (root.dataset.keyboardNav !== 'false') root.dataset.keyboardNav = 'false';
  }, true);
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
    if (app.dom.sheet.hidden || app.sheet.live?.()) app.render();
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

/* ---------- The snackbar docked over an open sheet ----------
 * The bar sits just above the sheet's action bar and the body's bottom margin grows to make room (planner.css). The
 * task sheet reserves that room when it opens, so the bar usually arrives without anything moving. Only when the row
 * the user just tapped (or is typing in) would end up under the bar does the sheet make room: first by growing
 * taller (its height animates on the bar's timing), and only if it is already as tall as it may be by scrolling,
 * animated (250ms standard) and never so far that the task's title leaves the top. Everything is measured where it
 * will be once the choices folding away or opening (and a Part of card growing) have finished. */
const DOCK_GAP = 20; // the bar's 8dp above the action bar plus the content's 12dp above the bar (planner.css)
const DOCK_FADE = 16; // the faded edge of the content (planner.css)
const DOCK_ROWS = '.detail-title-row, .field-row, .date-quick, .must-row, .block-face, .detail-field, .original-capture, '
  + '.task-row, .quick-title, .quick-row, .field-fold.open, .choice-row';
/** The room a docked one-line snackbar takes from a sheet's body (its 48dp plus the gaps). */
export const DOCK_ROOM = 48 + DOCK_GAP;

/** The row a tapped or focused node belongs to inside the sheet body. */
export function dockRow(node, body) {
  const row = node?.closest?.(DOCK_ROWS);
  return row && body.contains(row) && row !== body ? row : null;
}

/** Where `node` will be once the boxes in `changing` ([{node, delta}]) reach their final heights. */
export function settledBox(node, changing) {
  const rect = node.getBoundingClientRect();
  let {top, bottom} = rect;
  for (const {node: box, delta} of changing) {
    if (box === node || node.contains(box)) bottom += delta;
    else if (box.contains(node)) continue;
    else if (box.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) {
      top += delta;
      bottom += delta;
    }
  }
  return {top, bottom};
}

/** How far the rows must rise to fit above `visibleBottom`, never moving `first` past `visibleTop`, within `room`. */
export function dockScroll({rows, first, visibleTop, visibleBottom, room}) {
  const want = Math.max(...rows.map(r => r.bottom));
  const delta = Math.min(want - visibleBottom, first.top - visibleTop, room);
  return delta >= 1 ? Math.ceil(delta) : 0;
}

/** Split the rise a docked bar needs between growing the sheet (up to `spare`) and scrolling the rest, which may not
 * take the title (whose top is `titleTop` above the body's visible top) out of view. */
export function dockRoom({need, spare, titleTop = Infinity}) {
  const grow = Math.max(0, Math.min(need, Math.floor(spare)));
  const scroll = Math.max(0, Math.min(need - grow, titleTop));
  return {grow, scroll: scroll >= 1 ? Math.ceil(scroll) : 0};
}

/** The tallest a sheet may grow (planner.css: 92% of the screen, or of the space above the keyboard). */
function sheetCap(sheet) {
  const visual = parseFloat(document.documentElement.style.getPropertyValue('--visual-height')) || innerHeight;
  return Math.min(sheet.parentElement.getBoundingClientRect().height * 0.92 || innerHeight * 0.92, visual);
}

function changingBoxes(body) {
  const out = [];
  for (const box of body.querySelectorAll('.field-fold, [data-to-height]')) {
    if (!box.getClientRects().length && !box.classList.contains('open')) continue;
    const height = box.getBoundingClientRect().height;
    const to = box.dataset.toHeight ? Number(box.dataset.toHeight)
      : box.classList.contains('open') ? box.firstElementChild?.scrollHeight ?? height : 0;
    if (Math.abs(to - height) > 0.5) out.push({node: box, delta: to - height});
  }
  return out;
}

function revealAboveSnackbar(app, from) {
  const {sheet, snackbar} = app.dom;
  const body = sheet.querySelector(':scope > .sheet-body');
  if (!body || !from?.isConnected || !body.contains(from)) return;
  const changing = changingBoxes(body);
  const margin = parseFloat(getComputedStyle(body).marginBottom) || 0;
  const finalMargin = snackbar.getBoundingClientRect().height + DOCK_GAP;
  const frame = body.getBoundingClientRect();
  const grow = changing.reduce((sum, c) => sum + c.delta, 0);
  const finalClient = body.clientHeight + margin - finalMargin;
  // The content's own height (scrollHeight never reads less than the box, so it cannot tell how much is missing).
  let end = frame.top;
  for (const child of body.children) {
    if (child.getClientRects().length) end = Math.max(end, child.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(child).marginBottom) || 0));
  }
  const content = end - frame.top + body.scrollTop + (parseFloat(getComputedStyle(body).paddingBottom) || 0);
  const first = settledBox(from, changing);
  const need = dockScroll({
    rows: [first], first,
    visibleTop: frame.top + 8,
    visibleBottom: frame.bottom + margin - finalMargin - DOCK_FADE,
    room: content + grow - finalClient - body.scrollTop,
  });
  if (!need) return;
  // A pinned sheet (the task sheet keeps its height) grows instead, as far as it may; an unpinned one already grows
  // with its margin until it reaches its cap.
  const pinned = parseFloat(sheet.style.getPropertyValue('--sheet-pin')) || 0;
  const height = sheet.getBoundingClientRect().height;
  const title = body.querySelector('.detail-title-row, .quick-title');
  const titleTop = title ? Math.max(0, title.getBoundingClientRect().top - frame.top) : Infinity;
  const plan = dockRoom({need, spare: pinned ? sheetCap(sheet) - height : 0, titleTop});
  if (plan.grow) {
    sheet.style.setProperty('--sheet-pin', height + plan.grow + 'px');
    if (!reducedMotion()) {
      sheet.animate([{height: height + 'px'}, {height: height + plan.grow + 'px'}],
        {duration: DURATION.short3, easing: EASE.standardDecelerate});
    }
  }
  if (!plan.scroll) return;
  const delta = plan.scroll;
  // While the margin is still growing the body cannot yet scroll that far; a little extra room at its end lets the
  // scroll reach its target at once, and goes again once there.
  const room = content - body.clientHeight - body.scrollTop;
  if (room < delta) {
    body.style.paddingBottom = `calc(var(--s4) + ${Math.ceil(delta - room)}px)`;
    setTimeout(() => body.style.removeProperty('padding-bottom'), 600);
  }
  slideScroll(body, delta);
}

/**
 * Keeps the two heights the docking needs current as sheets, their actions and the snackbar's words change; reveals
 * the row just used when the bar arrives; and freezes a leaving sheet's layout, so nothing in it grows or reflows on
 * its way out (a save's snackbar arriving as Add closes the sheet used to lift it 25px first).
 */
function installSnackbarDock(app) {
  const root = document.documentElement;
  const {sheet, snackbar, planner} = app.dom;
  let watched = null;
  let lastTap = null;
  const measure = () => {
    const actions = sheet.hidden ? null : sheet.querySelector(':scope > .sheet-actions');
    const height = actions?.getClientRects().length ? actions.getBoundingClientRect().height : 0;
    if (!sheet.inert) root.style.setProperty('--sheet-actions-h', height + 'px');
    if (!snackbar.hidden) root.style.setProperty('--snackbar-h', snackbar.getBoundingClientRect().height + 'px');
  };
  const freeze = () => {
    const body = sheet.querySelector(':scope > .sheet-body');
    if (sheet.inert && !sheet.hidden) {
      if (sheet.style.height) return;
      sheet.style.height = sheet.getBoundingClientRect().height + 'px';
      if (body) {
        body.style.marginBottom = getComputedStyle(body).marginBottom;
        body.style.transition = 'none';
      }
    } else sheet.style.removeProperty('height');
  };
  const sizes = new ResizeObserver(measure);
  sizes.observe(snackbar);
  new MutationObserver(records => {
    const actions = sheet.querySelector(':scope > .sheet-actions');
    if (actions !== watched) {
      if (watched) sizes.unobserve(watched);
      watched = actions;
      if (actions) sizes.observe(actions);
    }
    if (records.some(r => r.attributeName === 'inert' || r.attributeName === 'hidden')) freeze();
    measure();
  }).observe(sheet, {childList: true, attributes: true, attributeFilter: ['hidden', 'inert']});
  sheet.addEventListener('pointerdown', event => {
    const body = sheet.querySelector(':scope > .sheet-body');
    const row = body && dockRow(event.target, body);
    lastTap = row ? {row, at: performance.now()} : null;
  }, true);
  const arrived = records => {
    measure();
    // Only a new message counts (not its words' cross-fade copy coming and going).
    if (!records.some(r => r.type === 'attributes' || [...r.addedNodes].some(n => n.classList?.contains('snackbar-text')))) return;
    if (snackbar.hidden || sheet.hidden || sheet.inert || planner.dataset.snackbar !== 'true') return;
    const body = sheet.querySelector(':scope > .sheet-body');
    if (!body) return;
    const recent = lastTap && performance.now() - lastTap.at < 1500 && lastTap.row.isConnected ? lastTap.row : null;
    const from = recent ?? (body.contains(document.activeElement) ? dockRow(document.activeElement, body) : null);
    if (from) revealAboveSnackbar(app, from);
  };
  new MutationObserver(arrived).observe(snackbar, {childList: true, attributes: true, attributeFilter: ['hidden']});
}

/**
 * After a save the open sheet updates its rows in place. That refresh runs inside the save, after the data is already
 * written, so it must never fail the save: a sheet whose body was just swapped (Back to the Inbox while a field's
 * blur-save is still on its way) could otherwise throw into the snackbar in place of Undo. A failed refresh is logged
 * and the sheet keeps what it shows; the next change or reopening draws it again.
 */
export function syncSheet(app) {
  try {
    return app.sheet.sync?.() ?? false;
  } catch (error) {
    console.error('Sheet refresh skipped:', error);
    return false;
  }
}

export function mountPlanner(api) {
  // After every save, Undo or outside change the shell re-renders; an open task sheet then updates its rows in place.
  const shell = app => {
    renderShell(app);
    syncSheet(app);
  };
  const app = createApp(api, {shell, screen: renderScreen, defaultScroll, refreshCalendar, searchBar});
  installActions(app);
  installSheetKeys(app);
  installBack(app);
  installNativeHooks(app);
  installSwipe(app);
  installSnackbarDock(app);
  installFocusModality();
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
