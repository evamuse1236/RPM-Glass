// Weekly review: last week's Results → capture → sort the Inbox into Results → this week's Results.
// Renders into the container the planner gives it and talks to the app only through `ctx`
// (getData, commit, close, openBlock, openCapture, now, day; optional sortInbox, readCalendar, openTask, archiveTask, deleteTask, scheduleTask).
// Plan changes go through ctx.commit with a label, so they save, re-render and offer Undo.
// Review progress (step, draft choice of Results) is saved with ctx.commit(mutator, null):
// a null label means "save quietly"; it changes no plan data and keeps the last Undo intact.
import {REVIEW_STEPS, reviewWeek, inboxTasks, focusCandidates, weekFocus, reviewProgress, saveReviewProgress, finishReview, weekCapacity, clashTask, clashKey} from './review-state.mjs';
import {calendarRows} from './planner-calendar.mjs';
import {plural} from './planner/format.mjs';
import {animateRerender, sharedAxis, ghost, reducedMotion, releaseTail, waitMotion, MOTION, DURATION, EASE} from './surface-motion.mjs';
import {userMessage} from './user-message.mjs';
import {STEPS, READABLE, el, icon, button, iconButton} from './review-ui.mjs';
import {stepOne} from './review-step-one.mjs';
import {stepTwo} from './review-step-two.mjs';
import {stepThree, sheetLayer} from './review-step-three.mjs';
import {stepFour} from './review-step-four.mjs';

/* ---------- mount ---------- */
export function mountWeeklyReview(container, ctx) {
  const week = reviewWeek(ctx.day());
  const saved = reviewProgress(ctx.getData(), week);
  const ui = {
    step: saved.step,
    focus: saved.focusDraft ?? weekFocus(ctx.getData(), week),
    focusBase: null,
    focusHint: '',
    inboxIds: saved.inboxIds,
    kept: saved.keptIds, // step 3: Inbox tasks left there on purpose
    clashes: saved.clashes, // step 4: {clashKey: 'a'|'b'|'later'}
    day: null, // step 4: the strip day whose deadlines, Musts and clashes are shown
    sheet: null, // step 3: {kind: 'add' (choose a Result) or 'new' (new Result with its Purpose), taskId}
    newBlock: {title: '', purpose: ''},
    draft: '',
    lens: null,
    expanded: null, // step 4: the Result opened to its Purpose and tasks
    weekOpen: false, // step 4: the week summary expanded to one row per picked Result
    showIdle: false,
    calendar: undefined, // undefined while reading; then the read-only calendar copy as native returns it
    hint: '',
    busy: false,
    seen: ctx.getData(),
    stepChanged: true,
    destroyed: false,
  };
  const root = el('section', 'wr');
  root.setAttribute('aria-label', 'Weekly review');
  container.replaceChildren(root);
  const api = createActions(ctx, week, ui, () => render());
  const render = () => renderReview(root, api, ctx);

  // Data can change outside the review (Undo in the snackbar, Capture, phone refresh).
  const refreshIfChanged = () => {
    const typing = container.contains(document.activeElement) && document.activeElement.matches('input, textarea');
    if (api.data() !== ui.seen && !ui.busy && !typing) render();
  };
  const timer = setInterval(refreshIfChanged, 600);
  window.addEventListener('rpm-data-refresh', refreshIfChanged);
  render();
  // The calendar copy spans 3 days back and 22 ahead of the anchor, so a midweek anchor covers today and the whole week.
  Promise.resolve(ctx.readCalendar?.(+new Date(week + 'T12:00')) ?? {status: 'unavailable'})
    .catch(() => ({status: 'unavailable'}))
    .then(value => {
      ui.calendar = value ?? {status: 'unavailable'};
      if (!ui.destroyed) render();
    });

  return {
    refresh: render,
    /** Android Back: closes an open sheet; returns true when it handled the press. */
    back() {
      if (!ui.sheet) return false;
      ui.sheet = null;
      render();
      return true;
    },
    destroy() {
      ui.destroyed = true;
      clearInterval(timer);
      window.removeEventListener('rpm-data-refresh', refreshIfChanged);
      root.remove();
    },
  };
}

/** Everything the steps can do. Commits run one after another so a quick tap never races a save. */
function createActions(ctx, week, ui, render) {
  const data = () => ctx.getData();
  let queue = Promise.resolve();
  function run(mutator, label) {
    const job = queue.then(async () => {
      ui.busy = true;
      try {
        await ctx.commit(mutator, label);
      } catch (error) {
        ui.hint = userMessage(error, 'That change could not be saved.');
      } finally {
        ui.busy = false;
      }
    });
    queue = job.then(() => { if (!ui.destroyed) render(); });
    return queue;
  }
  const saveProgress = (patch = {}) => {
    const progress = {step: ui.step, focusDraft: ui.focus, inboxIds: ui.inboxIds, keptIds: ui.kept, clashes: ui.clashes, ...patch};
    return run(d => saveReviewProgress(d, week, progress, ctx.now()), null);
  };
  const groupList = () => {
    const ids = new Set([...ui.inboxIds, ...inboxTasks(data()).map(t => t.id)]);
    return data().entries.filter(t => ids.has(t.id) && !t.archived && !t.done && (t.kind ?? 'plan') === 'plan');
  };
  function goTo(step) {
    if (step < 1 || step > REVIEW_STEPS || step === ui.step) return;
    Object.assign(ui, {inboxIds: groupList().map(t => t.id), stepBack: step < ui.step, step, sheet: null,
      focusBase: null, hint: '', focusHint: '', stepChanged: true});
    render();
    saveProgress({finishedAt: null});
  }
  async function close() {
    await saveProgress();
    ctx.close();
  }
  async function finish() {
    ui.hint = '';
    const ids = ui.focus.filter(id => focusCandidates(data(), week, ui.focus).some(c => c.blockId === id));
    await run(d => finishReview(d, week, ids, ctx.now()), ids.length ? `${plural(ids.length, 'Result')} for this week` : 'Weekly review finished');
    if (!ui.hint) ctx.close();
  }
  async function openBlock(blockId) {
    await saveProgress();
    ctx.openBlock(blockId);
  }
  /** The calendar's events once it is readable, else null (not connected, unavailable, or still reading). */
  const events = () => (ui.calendar && READABLE.has(ui.calendar.status) ? calendarRows(ui.calendar) : null);
  /** This week's calendar clashes (none until the calendar is read), each with the task that deals with it. */
  const clashes = () => {
    const rows = events();
    return rows ? weekCapacity([], rows, week, ctx.now()).clashes.slice(0, 2).map(c => ({...c, key: clashKey(c), task: clashTask(data(), c)})) : [];
  };
  return {data, week, ui, run, goTo, close, finish, render, groupList, openBlock, events, clashes, saveProgress, now: () => ctx.now()};
}

/**
 * The body and its content column live across renders. A step change moves old and new content on the shared X axis
 * (reversed going back); a change inside a step rebuilds the content in place, so rows slide or collapse instead of
 * the step replaying its entrance, and the scroll position holds.
 */
function renderReview(root, api, ctx) {
  const {ui} = api;
  ui.seen = api.data();
  let body = root.querySelector(':scope > .wr-body');
  let content = body?.querySelector(':scope > .wr-content');
  const first = !body;
  if (first) {
    body = el('div', 'wr-body');
    content = el('div', 'wr-content');
    body.append(content);
  }
  const active = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  const stepChange = ui.stepChanged && !first;
  const bodyRect = stepChange ? body.getBoundingClientRect() : null;
  const oldScroll = body.scrollTop;
  const oldContent = stepChange && !reducedMotion() ? [...content.childNodes] : [];
  // On a step change the frame's words (step count, progress, footer label and Back) switch at the 90ms crossover,
  // when the old body has faded out and the new one starts to fade in, not ahead of the body.
  // (A save during those 90ms waits for the same switch.)
  const deferFrame = (stepChange || ui.framePending) && !reducedMotion() && !!root.querySelector(':scope > .wr-foot');
  const foot = deferFrame ? root.querySelector(':scope > .wr-foot') : footer(api, root.querySelector(':scope > .wr-foot'));
  const sheetKey = ui.step === 3 && ui.sheet ? `${ui.sheet.kind}:${ui.sheet.taskId}` : null;
  const sheetWasOpen = sheetKey && root.querySelector(':scope > .wr-layer')?.dataset.sheet === sheetKey;
  root.querySelector(':scope > .wr-layer')?.remove();
  // The frame (bar, progress, footer) stays the same nodes from step to step; only the step body moves.
  const bar = deferFrame ? root.querySelector(':scope > .wr-bar') : topBar(api, root.querySelector(':scope > .wr-bar'));
  const progress = deferFrame ? root.querySelector(':scope > .wr-steps')
    : progressBar(ui.step, api.goTo, root.querySelector(':scope > .wr-steps'));
  if (deferFrame && stepChange) {
    const token = ui.frameToken = (ui.frameToken ?? 0) + 1;
    ui.framePending = true;
    waitMotion(MOTION.fadeOut).then(() => {
      if (ui.frameToken !== token) return;
      ui.framePending = false;
      if (!root.isConnected) return;
      topBar(api, bar);
      progressBar(api.ui.step, api.goTo, progress);
      const hadBack = !!foot.querySelector(':scope > .wr-back');
      footer(api, foot);
      const back = foot.querySelector(':scope > .wr-back');
      if (back && !hadBack) back.animate([{opacity: 0}, {opacity: 1}], {duration: DURATION.short3, easing: EASE.standardDecelerate});
      document.documentElement.style.setProperty('--wr-foot', foot.offsetHeight + 'px');
    });
  } else if (!deferFrame) {
    ui.frameToken = (ui.frameToken ?? 0) + 1;
    ui.framePending = false;
  }
  if (first) root.replaceChildren(bar, progress, body, foot);
  if (first || ui.stepChanged) {
    releaseTail(content);
    content.replaceChildren(...stepContent(api, ctx));
    body.scrollTop = 0;
  } else {
    // Built off-document and reconciled in: unchanged rows stay the same nodes, changed ones slide or resize.
    animateRerender(content, body, () => {
      const stage = document.createElement('div');
      stage.append(...stepContent(api, ctx));
      return stage;
    });
  }
  if (sheetKey) {
    const layer = sheetLayer(api);
    layer.dataset.sheet = sheetKey;
    layer.classList.toggle('static', !!sheetWasOpen);
    root.append(layer);
  }
  if (stepChange && oldContent.length) {
    const column = el('div', 'wr-content');
    column.append(...oldContent);
    const outgoing = ghost([column], bodyRect, root, {cls: 'wr-ghost-body', scrollTop: oldScroll});
    sharedAxis([outgoing], [content], {back: !!ui.stepBack});
  }
  // A hairline over the footer only while content continues underneath it (no fade over the last card).
  const edge = () => foot.classList.toggle('edge', body.scrollTop + body.clientHeight < body.scrollHeight - 2);
  body.onscroll = edge;
  edge();
  document.documentElement.style.setProperty('--wr-foot', foot.offsetHeight + 'px');
  if (ui.stepChanged) {
    ui.stepChanged = false;
    root.querySelector('.wr-body .wr-title')?.focus({preventScroll: true});
  } else if (active && !root.contains(document.activeElement)) {
    root.querySelector(`.wr-body [data-key="${CSS.escape(active)}"], .wr-foot [data-key="${CSS.escape(active)}"]`)
      ?.focus({preventScroll: true});
  }
}

/* ---------- frame: top bar, progress, footer ----------
 * Built once and updated in place, so they never flash or replay while the step body changes under them. */
function topBar(api, existing = null) {
  if (existing) {
    const count = existing.querySelector('.wr-bar-count');
    const text = `${api.ui.step} of ${REVIEW_STEPS}`;
    if (count && count.textContent !== text) count.textContent = text;
    return existing;
  }
  const bar = el('header', 'wr-bar');
  bar.append(iconButton('close', 'Close review', api.close), el('h1', 'wr-bar-title', 'Weekly review'));
  const count = el('span', 'wr-bar-count tnum', `${api.ui.step} of ${REVIEW_STEPS}`);
  count.setAttribute('aria-hidden', 'true');
  bar.append(count);
  return bar;
}

/** The same segments stay on screen from step to step, so the newly reached one fills in rather than reappearing. */
function progressBar(step, goTo, existing = null) {
  if (existing?.children.length === STEPS.length) {
    [...existing.children].forEach((seg, i) => {
      seg.classList.toggle('on', i + 1 <= step);
      if (i + 1 === step) seg.setAttribute('aria-current', 'step');
      else seg.removeAttribute('aria-current');
    });
    return existing;
  }
  const nav = el('nav', 'wr-steps');
  nav.setAttribute('aria-label', 'Review steps');
  STEPS.forEach((s, i) => {
    const n = i + 1;
    const seg = button('', () => goTo(n), 'wr-step' + (n <= step ? ' on' : ''));
    seg.setAttribute('aria-label', `Step ${n} of ${REVIEW_STEPS}: ${s.name}`);
    if (n === step) seg.setAttribute('aria-current', 'step');
    seg.append(el('i'));
    nav.append(seg);
  });
  return nav;
}

/** Every step can be skipped, so Next and Finish are always the one filled button; the step's own counts guide. */
function footer(api, existing = null) {
  const {ui} = api;
  const foot = existing ?? el('footer', 'wr-foot');
  // The handlers read the step when tapped, so the same buttons serve every step.
  let back = foot.querySelector(':scope > .wr-back');
  if (ui.step > 1 && !back) {
    back = button('Back', () => api.goTo(api.ui.step - 1), 'wr-btn-text wr-back', 'arrow_back');
    foot.prepend(back);
  } else if (ui.step <= 1 && back) back.remove();
  const last = ui.step === REVIEW_STEPS;
  const label = last ? (ui.focus.length ? `Finish with ${plural(ui.focus.length, 'Result')}` : 'Finish review') : STEPS[ui.step - 1].next;
  let next = foot.querySelector(':scope > .wr-next');
  if (!next) {
    next = button('', () => (api.ui.step === REVIEW_STEPS ? api.finish() : api.goTo(api.ui.step + 1)), 'wr-btn-filled wr-next');
    next.append(el('span', 'wr-label wr-long'), el('span', 'wr-label wr-short'), icon('arrow_forward'));
    foot.append(next);
  }
  const [long, short, mark] = next.children;
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  set(long, label);
  set(short, last ? 'Finish' : 'Next');
  set(mark, last ? 'check' : 'arrow_forward');
  next.setAttribute('aria-label', label);
  return foot;
}

function stepContent(api, ctx) {
  const parts = [stepOne, stepTwo, stepThree, stepFour][api.ui.step - 1](api, ctx);
  if (api.ui.hint) {
    const hint = el('p', 'wr-error', api.ui.hint);
    hint.setAttribute('role', 'alert');
    parts.push(hint);
  }
  return parts;
}
