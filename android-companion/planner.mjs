/** Planner entry: wires the per-screen modules in ./planner/ and the native hooks. */
import {hideSnackbar} from './planner/snackbar.mjs';
import {animateLayout, slideScroll} from './surface-motion.mjs';
import {createApp, TABS} from './planner/app.mjs';
import {placeNavIndicator, renderShell} from './planner/shell.mjs';
import {renderScreen, defaultScroll, installSwipe} from './planner/screens.mjs';
import {dismissSheet, installSheetKeys} from './planner/sheet.mjs';
import {closeMenu} from './planner/menu.mjs';
import {setDayLayout} from './planner/today.mjs';
import {openTask, taskEditor, movePicker, archiveTask, deleteTask, showTrash, showInbox, scheduleMenu,
  closeSchedule} from './planner/task-sheets.mjs';
import {entityEditor, contextEditor, detailMenu} from './planner/entities.mjs';
import {refreshCalendar, calendarDetails, calendarEditor, datePicker, resolveClash} from './planner/calendar-ui.mjs';
import {aiAction, examples} from './planner/jev.mjs';
import {searchBar} from './planner/search.mjs';
import {openView} from './planner/deep-links.mjs';
export {capturedGoalDraft, savedPlannerTarget} from './planner/deep-links.mjs';
import {componentGallery} from './planner/gallery.mjs';

function installActions(app) {
  const adds = {
    blocks: {label: 'New Block', onClick: () => entityEditor(app, 'blocks')},
    projects: {label: 'New Project', onClick: () => entityEditor(app, 'projects')},
  };
  app.actions = {
    openTask: (id, occurrence) => openTask(app, id, occurrence),
    addTask: overrides => taskEditor(app, null, overrides),
    movePicker: task => movePicker(app, task),
    archiveTask: task => archiveTask(app, task),
    deleteTask: task => deleteTask(app, task),
    scheduleTask: (task, anchor, {moveToBlock = false} = {}) => scheduleMenu(app, task, anchor, {occurrence: task.occurrence, moveToBlock}),
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
    addFor: tab => {
      if (tab !== 'life') return adds[tab] ?? null;
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
    const phone = app.api.getPhone();
    root.style.setProperty('--text-scale', String(phone.effectiveFontScale ?? phone.fontScale ?? 1));
    const changed = root.dataset.largeText !== large;
    root.dataset.largeText = large;
    return changed;
  };
  window.addEventListener('rpm-data-refresh', () => {
    // Saved somewhere else (the notch, Capture): Undo would now take back that change, not this screen's.
    if (app.dom.snackbar.querySelector('.snackbar-action')) hideSnackbar(app, {instant: true});
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
      {node: app.dom.nav}, {node: app.dom.now}, {node: app.dom.snackbar},
    ];
    animateLayout(document.body, regions, () => {
      root.dataset.nativeInsets = 'true';
      root.dataset.keyboard = bottom > 0 ? 'open' : 'closed';
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
    // The Now pill steps aside while reading down and returns on the way back up, so it never sits on what is read.
    if (Math.abs(top - lastTop) > 8 || top < 8) {
      const hide = String(top > lastTop && top > 64);
      if (app.dom.planner.dataset.nowAside !== hide) app.dom.planner.dataset.nowAside = hide;
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
  // --nav-measured: the room the floating tab bar takes at the bottom (its height plus its gap to the edge); 0 while
  // the keyboard hides it.
  new ResizeObserver(() => {
    const nav = app.dom.nav;
    if (nav.hidden) return;
    const height = nav.getBoundingClientRect().height;
    root.style.setProperty('--nav-measured', (height ? height + parseFloat(getComputedStyle(nav).bottom) : 0) + 'px');
    placeNavIndicator(nav);
  }).observe(app.dom.nav);
  syncPhone();
}

/* ---------- The snackbar docked over an open sheet ----------
 * The bar sits just above the sheet's action bar and the body's bottom margin grows to make room (planner.css). Only
 * when the row the user just tapped (or is typing in) would end up under the bar does the body scroll, animated
 * (250ms standard) and never so far that Quick add's title leaves the top. Everything is measured where it will be
 * once the choices folding away or opening have finished. */
const DOCK_GAP = 20; // the bar's 8dp above the action bar plus the content's 12dp above the bar (planner.css)
const DOCK_FADE = 16; // the faded edge of the content (planner.css)
const DOCK_ROWS = '.edit-row, .block-row, .detail-field, .task-row, .quick-title, .quick-row, .field-fold.open, .choice-row';
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

/** How far the body scrolls for a docked bar: the rise it needs, but never taking the title (whose top is `titleTop`
 * above the body's visible top) out of view. */
export function dockRoom({need, titleTop = Infinity}) {
  const scroll = Math.max(0, Math.min(need, titleTop));
  return {scroll: scroll >= 1 ? Math.ceil(scroll) : 0};
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
  const title = body.querySelector('.quick-title');
  const titleTop = title ? Math.max(0, title.getBoundingClientRect().top - frame.top) : Infinity;
  const plan = dockRoom({need, titleTop});
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
  const shell = (app, options) => {
    renderShell(app, options);
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
