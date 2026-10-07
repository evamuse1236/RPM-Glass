// Weekly review: last week's Results → capture → sort the Inbox into Results → this week's Results.
// Renders into the container the planner gives it and talks to the app only through `ctx`
// (getData, commit, close, openBlock, openCapture, now, day; optional sortInbox, readCalendar, openTask, archiveTask, deleteTask, scheduleTask).
// Plan changes go through ctx.commit with a label, so they save, re-render and offer Undo.
// Review progress (step, draft choice of Results) is saved with ctx.commit(mutator, null):
// a null label means "save quietly"; it changes no plan data and keeps the last Undo intact.
import {
  REVIEW_STEPS, reviewWeek, reviewSummary, markAchieved, decideLeftover, leftoverChoice, inboxTasks,
  groupTasks, addInboxTask, taskDate, setMust, focusCandidates, weekFocus, reviewProgress, saveReviewProgress, finishReview,
  weekCapacity, placedMusts, mustPlacements, placeMusts, rankResults, clashTask, decideClash, clashKey, clashDecision,
} from './review-state.mjs';
import {planner, blockTasks, shiftDay, localDay} from './planner-state.mjs';
import {areaTone} from './planner-ux.mjs';
import {calendarRows} from './planner-calendar.mjs';
import {dueInfo, clock, duration, plural, timeRange} from './planner/format.mjs';
import {areaDot} from './planner/dom.mjs';
import {attachTaskSwipe} from './task-swipe.mjs';
import {animateRerender, sharedAxis, ghost, reducedMotion, releaseTail, waitMotion, MOTION, DURATION, EASE} from './surface-motion.mjs';
import {userMessage} from './user-message.mjs';

const STEPS = [
  {name: "Last week's Results", next: 'Next: empty your head'},
  {name: 'Empty your head', next: 'Next: sort the Inbox'},
  {name: 'Sort the Inbox', next: 'Next: pick Results'},
  {name: "This week's Results"},
];
const VERDICTS = [['achieved', 'Achieved'], ['partly', 'Partly'], ['notyet', 'Not yet']];
const VERDICT_RECEIPTS = {achieved: 'Result achieved', partly: 'Marked partly achieved', notyet: 'Marked not achieved yet'};
const CHOICES = [['carry', 'Carry'], ['defer', 'Defer'], ['drop', 'Drop']];
const MAX_FOCUS = 5;
/** Calendar states that come with events; any other state means free time can't be counted. */
const READABLE = new Set(['ready', 'stale', 'incomplete']);

/* ---------- small DOM helpers (same conventions as planner.mjs) ---------- */
function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}
function icon(name, fill = false) {
  const node = el('span', fill ? 'ms fill' : 'ms', name);
  node.setAttribute('aria-hidden', 'true');
  return node;
}
function button(label, onClick, cls = '', iconName = '') {
  const node = el('button', cls);
  node.type = 'button';
  if (iconName) node.append(icon(iconName));
  if (label) node.append(el('span', 'wr-label', label));
  if (onClick) node.addEventListener('click', onClick);
  return node;
}
function iconButton(name, label, onClick, cls = 'wr-icon-btn') {
  const node = button('', onClick, cls, name);
  node.setAttribute('aria-label', label);
  return node;
}
/** A strip cell's hours: "12h", "1.5h", "45m". Exact durations are in its accessible label. */
const hours = minutes => (minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 30) / 2}h`);
function weekLabel(day) {
  const date = new Date(day + 'T12:00:00');
  return 'Week of ' + date.toLocaleDateString(undefined, {day: 'numeric', month: 'long'});
}
const dayName = day => new Date(day + 'T12:00').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'});
const weekday = day => new Date(day + 'T12:00').toLocaleDateString(undefined, {weekday: 'short'});
const capital = text => text[0].toUpperCase() + text.slice(1);

/** A Result's deadline as a chip: "Due tomorrow 11:00 PM", stronger when close, in error colour when past. */
function dueChip(value, now) {
  const info = dueInfo(value, now);
  if (!info) return null;
  const chip = el('span', 'wr-due' + (info.overdue ? ' overdue' : info.soon ? ' soon' : ''));
  chip.append(icon(info.overdue ? 'error' : 'event'), el('span', '', info.label));
  return chip;
}
/** A task's own date ("Tomorrow 9:00 PM", "Overdue"): it is scheduled, not a deadline. */
function whenText(task, now) {
  const value = taskDate(task);
  const info = value && dueInfo(value, now);
  if (!info) return null;
  return {text: capital(info.overdue ? 'Overdue' : info.label.replace(/^Due /, '')), overdue: info.overdue, soon: info.soon};
}

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

function heading(title, sub) {
  const h = el('h2', 'wr-title', title);
  h.tabIndex = -1;
  return [h, el('p', 'wr-sub', sub)];
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

function emptyState(iconName, title, body) {
  const box = el('div', 'wr-empty');
  const badge = el('div', 'wr-empty-icon');
  badge.append(icon(iconName));
  box.append(badge, el('h3', 'wr-empty-title', title), el('p', 'wr-empty-body', body));
  return box;
}

/** Section label with a count, and an optional trailing action. */
function sectionHead(title, count, action = null) {
  const row = el('div', 'wr-section-row');
  const h = el('h3', 'wr-section', title);
  if (count != null) h.append(el('span', 'wr-count tnum', String(count)));
  row.append(h);
  if (action) row.append(action);
  return row;
}

/* ---------- step 1: last week's Results ---------- */
function stepOne(api) {
  const summary = reviewSummary(api.data(), api.week, api.now());
  const judged = summary.results.filter(r => !r.running);
  const running = summary.results.filter(r => r.running);
  const parts = heading("How did last week's Results go?", `${weekLabel(summary.lastWeek)}. Ticked tasks don't decide it; you do.`);
  if (!summary.results.length) {
    const body = "Once you choose this week's Results in step 4, next week's review starts here.";
    parts.push(emptyState('history', 'Nothing to look back on yet', body));
    return parts;
  }
  if (judged.length) {
    const decided = judged.filter(r => r.verdict).length;
    const wins = judged.filter(r => r.verdict === 'achieved');
    const tally = el('p', 'wr-tally tnum');
    tally.setAttribute('aria-live', 'polite');
    tally.append(el('span', '', decided === judged.length ? `All ${judged.length} decided` : `${decided} of ${judged.length} decided`));
    parts.push(tally);
    for (const result of judged) parts.push(resultCard(api, summary, result));
    if (wins.length) parts.push(winsCard(wins));
  }
  if (running.length) parts.push(...runningList(api, running));
  return parts;
}

/** One card per Result to judge. Only the chosen segment carries colour; the Wins card below is the one celebration. */
function resultCard(api, summary, result) {
  const win = result.verdict === 'achieved';
  const card = el('article', 'wr-card wr-result');
  card.append(el('h3', 'wr-card-title', result.title));
  if (result.purpose) card.append(el('p', 'wr-card-purpose', result.purpose));
  card.append(progressMeta(result, win ? null : result.due, api.now()));
  // A neutral question, not a hint towards Achieved: ticked tasks are activity, the Result is the user's call.
  if (!result.verdict && result.total && result.done === result.total) card.append(el('p', 'wr-ask', 'Every task is ticked. Did the Result itself happen?'));
  card.append(verdictControl(api, summary, result));
  if (win) card.append(evidenceField(api, summary, result));
  if (result.verdict === 'partly' || result.verdict === 'notyet') card.append(carryRow(api, result), leftoverList(api, result));
  else if (win && result.leftovers.length) {
    card.append(el('p', 'wr-card-note', `${plural(result.leftovers.length, 'open task')} stay with this Result.`));
  }
  return card;
}

/** "2 of 7 tasks done" with a thin bar, so 5 of 5 reads differently from 1 of 3, and the deadline if it has one. */
function progressMeta(result, due, now) {
  const row = el('div', 'wr-progress-row');
  if (result.total) {
    const bar = el('span', 'wr-mini-bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('span');
    fill.style.setProperty('--value', String(result.done / result.total));
    bar.append(fill);
    row.append(bar);
  }
  row.append(el('span', 'wr-progress-text tnum', result.total ? `${result.done} of ${plural(result.total, 'task')} done` : 'No tasks'));
  const chip = due && dueChip(due, now);
  if (chip) row.append(chip);
  return row;
}

/** One segmented button per Result: a single decision, not three loose chips. The chosen verdict carries colour and a word. */
function verdictControl(api, summary, result) {
  const group = el('div', 'wr-seg wr-verdicts');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', `Did "${result.title}" happen?`);
  for (const [value, label] of VERDICTS) {
    const selected = result.verdict === value;
    const option = button('', () => {
      if (selected) return;
      const achieved = value === 'achieved';
      api.run(d => markAchieved(d, result.blockId, {achieved, week: summary.lastWeek, verdict: value}), VERDICT_RECEIPTS[value]);
    }, 'wr-seg-btn' + (selected ? ' sel' : ''));
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(selected));
    option.dataset.key = `verdict:${result.blockId}:${value}`;
    if (selected) option.append(icon('check'));
    option.append(el('span', 'wr-label', label));
    group.append(option);
  }
  return group;
}

function evidenceField(api, summary, result) {
  const wrap = el('label', 'wr-field');
  wrap.append(el('span', 'wr-field-label', 'What made it work? (optional)'));
  const input = el('input', 'wr-input');
  input.type = 'text';
  input.maxLength = 300;
  input.value = result.evidence;
  input.placeholder = 'One line to remember next time';
  input.enterKeyHint = 'done';
  input.dataset.key = 'evidence:' + result.blockId;
  const save = () => {
    const evidence = input.value.trim();
    if (evidence === result.evidence) return;
    api.run(d => markAchieved(d, result.blockId, {achieved: true, evidence, week: summary.lastWeek}), 'Saved with the win');
  };
  input.addEventListener('change', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  wrap.append(input);
  return wrap;
}

/** A checkbox row that puts a Result in this week's Results (a draft, saved quietly): Carry in step 1, Pick in step 4. */
function focusCheck(api, blockId, title, cls = 'wr-check') {
  const on = api.ui.focus.includes(blockId);
  const box = button('', () => toggleFocus(api, blockId), cls + (on ? ' on' : ''));
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', String(on));
  box.dataset.key = 'focus:' + blockId;
  box.append(icon(on ? 'check_box' : 'check_box_outline_blank', on));
  return box;
}
function carryRow(api, result) {
  const row = focusCheck(api, result.blockId, result.title, 'wr-check-row');
  row.setAttribute('aria-label', `Carry "${result.title}" into this week`);
  row.append(el('span', 'wr-label', 'Carry into this week'));
  return row;
}

/** Results whose deadline is still ahead: nothing to judge yet, only whether to carry them (one tap for all). */
function runningList(api, running) {
  const now = api.now();
  const list = el('ul', 'wr-list wr-running');
  list.setAttribute('aria-label', 'Still running');
  for (const r of running) {
    const item = el('li');
    const row = focusCheck(api, r.blockId, r.title, 'wr-check-row wr-run');
    row.setAttribute('aria-label', `Carry "${r.title}" into this week`);
    const text = el('span', 'wr-run-text');
    text.append(el('span', 'wr-run-title', r.title));
    const meta = el('span', 'wr-facts tnum');
    meta.append(...factsLine([dueFact(r.due, now), mustFact(r.mustMinutes, 'No Must set')]));
    text.append(meta);
    row.append(text);
    item.append(row);
    list.append(item);
  }
  const left = running.filter(r => !api.ui.focus.includes(r.blockId));
  const all = running.length > 1 && left.length
    ? button(running.length === 2 ? 'Carry both' : `Carry all ${running.length}`, () => setFocus(api, [...api.ui.focus, ...left.map(r => r.blockId)]), 'wr-btn-tonal', 'redo')
    : null;
  return [sectionHead('Still running', running.length, all),
    el('p', 'wr-section-note', "Their deadlines haven't come yet, so there's nothing to judge. Checked ones join this week's Results."), list];
}

/** One facts line, as the Blocks list writes it: parts joined by " · ", each kept whole, a line only breaking after a dot. */
function factsLine(parts) {
  const nodes = parts.filter(Boolean).map(part => (typeof part === 'string' ? el('span', '', part) : part));
  return nodes.flatMap((node, i) => (i < nodes.length - 1 ? [node, '\u00a0· '] : [node]));
}
/** The deadline in the words every card uses ("Due tomorrow 11:00 PM"), in medium weight; error colour once past. */
function dueFact(value, now) {
  const info = value && dueInfo(value, now);
  return info ? el('b', 'wr-due-text' + (info.overdue ? ' overdue' : ''), info.label) : null;
}
/** "★ 3 h 50 min": the open Must time with the star as its legend; `none` words it when there is no Must. */
function mustFact(minutes, none = '') {
  if (!minutes) return none ? el('span', '', none) : null;
  const node = el('span', 'wr-must-fact');
  node.append(Object.assign(icon('star', true), {className: 'ms fill must'}), duration(minutes));
  node.setAttribute('aria-label', `${duration(minutes)} of Must`);
  return node;
}

function leftoverList(api, result) {
  const box = el('div', 'wr-left');
  if (!result.leftovers.length) {
    box.append(el('p', 'wr-card-note', 'No open tasks left.'));
    return box;
  }
  box.append(el('p', 'wr-left-head', 'Unfinished tasks'));
  for (const id of result.leftovers) {
    const task = api.data().entries.find(t => t.id === id);
    if (task) box.append(leftoverRow(api, task));
  }
  return box;
}

function leftoverRow(api, task) {
  const row = el('div', 'wr-left-row');
  const current = leftoverChoice(task, api.week);
  row.append(el('span', 'wr-left-title' + (current === 'drop' ? ' dropped' : ''), task.title ?? task.raw ?? 'Task'));
  const seg = el('div', 'wr-seg sm');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', `What to do with "${task.title}"`);
  for (const [value, label] of CHOICES) {
    const selected = current === value;
    const option = button(label, () => {
      if (!selected) api.run(d => decideLeftover(d, task.id, value, api.week), decisionLabel(value));
    }, 'wr-seg-btn' + (selected ? ' sel' : ''));
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(selected));
    option.dataset.key = `left:${task.id}:${value}`;
    seg.append(option);
  }
  row.append(seg);
  return row;
}
const decisionLabel = value => ({carry: 'Carried into this week', defer: 'Deferred', drop: 'Dropped. It stays in Archive'})[value];

/** The moment to notice what went right, before planning more. */
function winsCard(wins) {
  const box = el('section', 'wr-wins');
  box.setAttribute('role', 'status');
  const head = el('div', 'wr-wins-head');
  head.append(icon('celebration'), el('h3', '', wins.length === 1 ? 'A win last week' : `${wins.length} wins last week`));
  box.append(head);
  const list = el('ul', 'wr-wins-list');
  for (const win of wins) {
    const item = el('li');
    item.append(icon('check'), el('span', '', win.title));
    list.append(item);
  }
  box.append(list, el('p', 'wr-wins-note', 'Take a moment to enjoy that before planning more.'));
  return box;
}

/* ---------- step 2: capture ---------- */
function stepTwo(api, ctx) {
  const inbox = inboxTasks(api.data());
  const now = api.now();
  const clashIds = new Set(api.clashes().map(c => c.task?.id).filter(Boolean));
  const parts = heading('Empty your head', 'Every idea, want and to-do, in your own words. Sorting comes next.');
  parts.push(quickAdd(api), ...lenses(api));
  parts.push(sectionHead('Inbox', inbox.length, button('Open Capture', () => ctx.openCapture(), 'wr-btn-text', 'edit_note')));
  if (!inbox.length) {
    parts.push(el('p', 'wr-quiet', 'Nothing in the Inbox. Type anything still on your mind above.'));
    return parts;
  }
  const list = el('ul', 'wr-list');
  list.setAttribute('aria-label', 'Inbox');
  for (const task of inbox) {
    const item = el('li', 'wr-list-item');
    // Tap to edit (the planner's task sheet, with Delete in its menu); swipe as in every task list.
    const text = button('', ctx.openTask ? () => ctx.openTask(task.id) : null, 'wr-list-text');
    text.dataset.key = 'inbox:' + task.id;
    text.append(el('span', 'wr-list-title', task.title ?? task.raw));
    const when = whenText(task, now);
    const clash = clashIds.has(task.id);
    if (when || task.must || clash) {
      const meta = el('span', 'wr-list-meta');
      if (task.must) {
        const must = el('span', 'wr-must-tag');
        must.append(icon('star', true));
        must.setAttribute('role', 'img');
        must.setAttribute('aria-label', 'Must');
        meta.append(must);
      }
      if (when) meta.append(el('span', when.overdue ? 'overdue' : when.soon ? 'soon' : '', when.text));
      if (clash) meta.append(el('span', '', 'Calendar clash · you decide it in step 4'));
      text.append(meta);
    }
    item.append(text);
    if (ctx.deleteTask) {
      item.classList.add('swipe-task');
      attachTaskSwipe(item, {schedule: ctx.scheduleTask ? () => ctx.scheduleTask(task, item) : null, remove: () => ctx.deleteTask(task)});
    }
    list.append(item);
  }
  parts.push(list);
  if (ctx.openTask) parts.push(el('p', 'wr-section-note wr-hint', 'Tap a task to edit it. Swipe right to schedule it, left to delete it.'));
  return parts;
}

/** Type a thought and press Enter: it lands in the Inbox in your own words, with Undo, and you stay here. */
function quickAdd(api) {
  const {ui} = api;
  const form = el('form', 'wr-add');
  form.noValidate = true;
  const input = el('input', 'wr-add-input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = ui.lens ? `${ui.lens}: anything due, stuck or wanted?` : 'Ideas, wants, to-dos';
  input.value = ui.draft;
  input.enterKeyHint = 'enter';
  input.dataset.key = 'quick-add';
  input.setAttribute('aria-label', 'Add to the Inbox');
  const send = iconButton('arrow_upward', 'Add to Inbox', null, 'wr-icon-btn wr-add-send');
  send.type = 'submit';
  const sync = () => { send.disabled = !input.value.trim(); };
  input.addEventListener('input', () => { ui.draft = input.value; sync(); });
  sync();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const words = input.value.trim();
    if (!words) return;
    ui.draft = '';
    input.value = '';
    sync();
    api.run(d => addInboxTask(d, words, api.now()), 'Added to Inbox');
  });
  form.append(icon('add'), input, send);
  return form;
}

/** RPM's lenses: walking through each Area surfaces what a blank field doesn't. A prompt, not a filter: a tap asks
 * that Area's question in the field and nothing else changes. */
function lenses(api) {
  const {ui} = api;
  const areas = planner(api.data()).areas.filter(a => !a.archived);
  if (!areas.length) return [];
  const row = el('div', 'wr-lenses');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Prompts, one per Area');
  for (const area of areas) {
    const chip = button('', () => {
      ui.lens = area.title;
      api.render();
      document.querySelector('.wr-add-input')?.focus({preventScroll: true});
    }, 'wr-chip wr-lens');
    chip.setAttribute('aria-label', `Prompt: ${area.title}, anything due, stuck or wanted?`);
    chip.dataset.key = 'lens:' + area.id;
    chip.append(areaDot(areaTone(area, planner(api.data()).areas)), el('span', 'wr-label', area.title + '?'));
    row.append(chip);
  }
  return [el('p', 'wr-lens-head', 'Stuck? Ask yourself about each Area'), row];
}

/* ---------- step 3: sort the Inbox into Results ---------- */
function stepThree(api, ctx) {
  const {ui} = api;
  const rows = api.groupList();
  const clashIds = new Set(api.clashes().map(c => c.task?.id).filter(Boolean));
  const loose = rows.filter(t => (t.blockId ?? null) === null && !clashIds.has(t.id));
  const toSort = loose.filter(t => !ui.kept.includes(t.id));
  const kept = loose.filter(t => ui.kept.includes(t.id));
  if (ui.sheet && !loose.some(t => t.id === ui.sheet.taskId)) ui.sheet = null;
  const parts = heading('Sort the Inbox', 'Give each task the Result it serves, or leave errands in the Inbox.');
  if (!rows.length) {
    parts.push(emptyState('done_all', 'Nothing to sort', 'Your Inbox is empty, so every task already has a Result.'));
    return parts;
  }
  const jev = ctx.sortInbox && toSort.length ? button('Ask Jev', () => ctx.sortInbox(), 'wr-btn-text', 'auto_awesome') : null;
  parts.push(sectionHead('To sort', toSort.length, jev));
  if (jev) parts.push(el('p', 'wr-section-note', 'Jev proposes; nothing moves until you confirm.'));
  if (toSort.length) {
    const candidates = focusCandidates(api.data(), api.week, []);
    const list = el('ul', 'wr-list wr-sort-list');
    list.setAttribute('aria-label', 'Inbox tasks to sort');
    for (const task of toSort) list.append(sortRow(api, task, rankResults(api.data(), task, candidates).suggested));
    parts.push(list);
  } else parts.push(el('p', 'wr-quiet', 'All sorted. Every task has a Result or stays in the Inbox on purpose.'));
  if (clashIds.size) parts.push(el('p', 'wr-section-note', clashIds.size === 1 ? 'The calendar clash in your Inbox is decided in step 4.' : 'The calendar clashes in your Inbox are decided in step 4.'));

  // What this step sorted: each Result that received tasks, with them, and a way back to the Inbox.
  const grouped = rows.filter(t => t.blockId);
  if (grouped.length) {
    parts.push(sectionHead('Sorted', grouped.length));
    const list = el('ul', 'wr-list wr-formed');
    list.setAttribute('aria-label', 'Sorted into Results');
    for (const c of focusCandidates(api.data(), api.week).filter(c => grouped.some(t => t.blockId === c.blockId))) {
      const head = el('li', 'wr-formed-head');
      head.append(el('span', 'wr-target-title', c.title));
      if (c.purpose) head.append(el('span', 'wr-target-purpose', c.purpose));
      list.append(head);
      for (const task of grouped.filter(t => t.blockId === c.blockId)) list.append(groupedRow(api, task));
    }
    parts.push(list);
  }
  if (kept.length) {
    parts.push(sectionHead('Staying in the Inbox', kept.length));
    const list = el('ul', 'wr-list wr-formed');
    list.setAttribute('aria-label', 'Staying in the Inbox');
    for (const task of kept) list.append(groupedRow(api, task, true));
    parts.push(list);
  }
  return parts;
}

/** Errands stay in the Inbox on purpose: remembered with the review's progress, no plan change. */
function keep(api, taskId, on) {
  const {ui} = api;
  ui.kept = on ? [...new Set([...ui.kept, taskId])] : ui.kept.filter(id => id !== taskId);
  ui.sheet = null;
  api.render();
  api.saveProgress();
}

/** One Inbox task: its words, then one tap: the suggested Result when the words clearly point to one, else Leave in Inbox. */
function sortRow(api, task, suggested) {
  const {ui} = api;
  const name = task.title ?? task.raw;
  const item = el('li', 'wr-sort');
  item.append(el('span', 'wr-row-title', name));
  let chip;
  if (suggested) {
    chip = button(suggested.title, () => api.run(d => groupTasks(d, [task.id], suggested.blockId), 'Added to ' + suggested.title),
      'wr-chip wr-suggest', 'add');
    chip.setAttribute('aria-label', `Add "${name}" to ${suggested.title}`);
  } else {
    chip = button('Leave in Inbox', () => keep(api, task.id, true), 'wr-chip wr-suggest wr-leave', 'inbox');
    chip.setAttribute('aria-label', `Leave "${name}" in the Inbox`);
  }
  chip.dataset.key = 'suggest:' + task.id;
  const choose = button('Choose', () => {
    Object.assign(ui, {sheet: {kind: 'add', taskId: task.id}});
    api.render();
    document.querySelector('.wr-sheet .wr-sheet-title')?.focus({preventScroll: true});
  }, 'wr-btn-text wr-choose');
  choose.setAttribute('aria-label', `Choose a Result for "${name}"`);
  choose.dataset.key = 'choose:' + task.id;
  item.append(choose, chip);
  return item;
}

function groupedRow(api, task, kept = false) {
  const item = el('li', 'wr-row sub');
  const name = task.title ?? task.raw;
  item.append(icon(kept ? 'inbox' : 'subdirectory_arrow_right'), el('span', 'wr-row-title', name));
  const back = kept
    ? iconButton('undo', `Sort "${name}" after all`, () => keep(api, task.id, false), 'wr-icon-btn wr-unmove')
    : iconButton('close', `Move "${name}" back to the Inbox`, () => api.run(d => groupTasks(d, [task.id], null), 'Moved to Inbox'), 'wr-icon-btn wr-unmove');
  back.dataset.key = 'unmove:' + task.id;
  item.append(back);
  return item;
}

/** A bottom sheet over the step: choose the task's Result, or name a new one with its Purpose. */
function sheetLayer(api) {
  const {ui} = api;
  const layer = el('div', 'wr-layer');
  const scrim = el('div', 'wr-scrim');
  scrim.addEventListener('click', () => { ui.sheet = null; api.render(); });
  const sheet = el('section', 'wr-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const task = api.groupList().find(t => t.id === ui.sheet.taskId);
  sheet.append(el('div', 'wr-handle'), ...(ui.sheet.kind === 'new' ? newResultForm(api, task) : resultChooser(api, task)));
  sheet.setAttribute('aria-label', sheet.querySelector('.wr-sheet-title').textContent);
  layer.append(scrim, sheet);
  return layer;
}

function sheetTitle(text) {
  const h = el('h2', 'wr-sheet-title', text);
  h.tabIndex = -1;
  return h;
}

/** New Result and Leave in Inbox, then every Result, likeliest first (then by deadline), with its deadline and Area. */
function resultChooser(api, task) {
  const {ui} = api;
  const name = task.title ?? task.raw;
  const now = api.now();
  const p = planner(api.data());
  const areaOf = blockId => {
    const project = p.projects.find(pr => pr.id === p.blocks.find(b => b.id === blockId)?.projectId);
    const goal = p.goals.find(g => g.id === project?.goalId);
    return p.areas.find(a => a.id === goal?.areaId)?.title ?? '';
  };
  const list = el('div', 'wr-picker');
  const fresh = button('New Result', () => {
    Object.assign(ui, {sheet: {kind: 'new', taskId: task.id}, newBlock: {title: '', purpose: ''}});
    api.render();
    document.querySelector('.wr-sheet input')?.focus({preventScroll: true});
  }, 'wr-option wr-option-action', 'add');
  fresh.dataset.key = 'sheet:new';
  const leave = button('Leave in Inbox', () => keep(api, task.id, true), 'wr-option wr-option-action', 'inbox');
  leave.dataset.key = 'sheet:keep';
  list.append(fresh, leave);
  for (const c of rankResults(api.data(), task, focusCandidates(api.data(), api.week, [])).ranked) {
    const option = el('button', 'wr-option');
    option.type = 'button';
    option.dataset.key = 'sheet:' + c.blockId;
    const text = el('span', 'wr-option-text');
    const info = c.due && dueInfo(c.due, now);
    const detail = [info?.label ?? 'No deadline', areaOf(c.blockId)].filter(Boolean).join(' · ');
    text.append(el('span', 'wr-option-label', c.title), el('span', 'wr-option-detail' + (info?.overdue ? ' overdue' : ''), detail));
    option.append(icon('stacks'), text);
    option.addEventListener('click', () => {
      ui.sheet = null;
      api.run(d => groupTasks(d, [task.id], c.blockId), 'Added to ' + c.title);
    });
    list.append(option);
  }
  return [sheetTitle('Choose a Result'), el('p', 'wr-sheet-sub', name), list];
}

/** RPM chunking: the task starts a new Block with its Result and its Purpose, in one undoable change. */
function newResultForm(api, task) {
  const {ui} = api;
  const form = el('form', 'wr-new');
  form.noValidate = true;
  const result = textField("What's the Result?", 'What will be true when it is done', ui.newBlock.title, 'chunk:title', v => { ui.newBlock.title = v; sync(); });
  const purpose = textField('Why does it matter?', 'The Purpose that keeps you going', ui.newBlock.purpose, 'chunk:purpose', v => { ui.newBlock.purpose = v; sync(); });
  const actions = el('div', 'wr-new-actions');
  const cancel = button('Back', () => { ui.sheet = {kind: 'add', taskId: task.id}; api.render(); }, 'wr-btn-text');
  const create = el('button', 'wr-btn-filled');
  create.type = 'submit';
  create.textContent = 'Create Result';
  const sync = () => { create.disabled = !ui.newBlock.title.trim() || !ui.newBlock.purpose.trim(); };
  sync();
  actions.append(cancel, create);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fields = {title: ui.newBlock.title.trim(), purpose: ui.newBlock.purpose.trim()};
    if (!fields.title || !fields.purpose) return;
    ui.sheet = null;
    api.run(d => groupTasks(d, [task.id], fields), 'New Result: ' + fields.title);
  });
  form.append(result, purpose, actions);
  return [sheetTitle('New Result'), el('p', 'wr-sheet-sub', task.title ?? task.raw), form];
}

function textField(label, placeholder, value, key, onInput) {
  const wrap = el('label', 'wr-field');
  wrap.append(el('span', 'wr-field-label', label));
  const input = el('input', 'wr-input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = placeholder;
  input.value = value;
  input.dataset.key = key;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input);
  return wrap;
}

/* ---------- step 4: this week's Results ---------- */
function stepFour(api) {
  const {ui} = api;
  const now = api.now();
  ui.focusBase ??= [...ui.focus];
  const candidates = focusCandidates(api.data(), api.week, ui.focusBase);
  ui.focus = ui.focus.filter(id => candidates.some(c => c.blockId === id));
  const chosen = candidates.filter(c => ui.focus.includes(c.blockId));
  const clashes = api.clashes();
  const missed = unpickedDue(api, candidates, now);
  // Nothing blocks Finish; the counts say what is still open.
  const open = clashes.filter(c => clashState(api, c).state === 'open').length;
  const todo = [open && `${plural(open, 'clash', 'clashes')} to decide`, missed.size && `${plural(missed.size, 'Result')} due this week not picked`].filter(Boolean);
  const [title] = heading("Pick this week's Results", '');
  const sub = el('p', 'wr-sub tnum', `${chosen.length} picked · aim for 3 to 5.` + (todo.length ? ` ${capital(todo.join(' · '))}.` : ''));
  sub.setAttribute('aria-live', 'polite');
  const parts = [title, sub];
  if (!candidates.length) {
    parts.push(emptyState('flag', 'No Results yet', 'Go back a step and give a task a new Result, then pick it here.'));
    return parts;
  }
  // The choice first: one quiet list, nearest deadline first. Results with nothing left to do wait behind one row.
  const idle = candidates.filter(c => c.total === c.done && !ui.focusBase.includes(c.blockId));
  parts.push(resultList(api, candidates.filter(c => !idle.includes(c)), now, missed, "This week's Results"));
  if (idle.length) {
    const toggle = button('', () => { ui.showIdle = !ui.showIdle; api.render(); }, 'wr-idle-toggle');
    toggle.setAttribute('aria-expanded', String(ui.showIdle));
    toggle.dataset.key = 'idle';
    toggle.append(el('span', 'wr-label', `${plural(idle.length, 'Result')} with no open tasks`), icon(ui.showIdle ? 'expand_less' : 'expand_more'));
    parts.push(toggle);
    if (ui.showIdle) parts.push(resultList(api, idle, now, missed, 'Results with no open tasks'));
  }
  // Then what the week holds: a clash to decide, and whether the picked Results' Must time fits.
  if (clashes.length) {
    const list = el('ul', 'wr-risks');
    list.setAttribute('aria-label', 'Calendar clashes');
    list.append(...clashes.map(c => clashRow(api, c)));
    parts.push(list);
  }
  parts.push(weekCard(api, chosen, candidates, now));
  return parts;
}

/** Once picking has started, Results due by Sunday (or overdue) with open tasks that aren't picked: flagged on their row. */
function unpickedDue(api, candidates, now) {
  const end = new Date(shiftDay(api.week, 7) + 'T00:00');
  if (!api.ui.focus.length) return new Set();
  return new Set(candidates.filter(c => !api.ui.focus.includes(c.blockId) && c.due && c.done < c.total && dueInfo(c.due, now).at < end)
    .map(c => c.blockId));
}

/** A Result's deadline in the words its card uses ("Due tomorrow 11:00 PM", "Overdue since …"). */
const dueWords = (value, now) => dueInfo(value, now).label;

/**
 * The week at a glance: a day strip (Must time already on each day, deadline days and clash days, in words; a tap
 * shows that day), then one line on whether the picked Results' Must time fits, which opens to one row per Result
 * checked against its own deadline, and a proposal for Musts that have no day yet.
 */
function weekCard(api, chosen, candidates, now) {
  const {ui} = api;
  const events = api.events();
  const ids = chosen.map(c => c.blockId);
  const placed = placedMusts(api.data(), ids);
  const cap = weekCapacity(chosen, events, api.week, now, placed);
  const due = candidates.filter(c => c.due && c.done < c.total);
  const box = el('section', 'wr-summary');
  box.setAttribute('aria-label', 'This week at a glance');
  box.append(dayStrip(api, cap.days, due));
  const day = cap.days.find(d => d.day === ui.day);
  if (day) box.append(dayDetail(api, day, due, placed, cap.clashes, now));
  else {
    const legend = el('p', 'wr-strip-note legend');
    legend.append(Object.assign(icon('star', true), {className: 'ms fill must'}), ' Must time with a day · tap a day to see it');
    box.append(legend);
  }
  if (!events) box.append(el('p', 'wr-strip-note', calendarNote(ui.calendar)));
  if (!chosen.length) {
    box.append(el('p', 'wr-summary-line', 'Pick a Result to see whether its Must time fits before its deadline.'));
    return box;
  }
  const placements = mustPlacements(api.data(), ids, events, api.week, now);
  const unplaced = placements.reduce((sum, p) => sum + (p.minutes ?? 0), 0);
  const worst = cap.rows.find(r => r.over) ?? cap.rows.find(r => r.tight) ?? null;
  // Free time alone isn't a plan: while Musts have no day, say that first instead of "fits".
  const undated = !worst && placements.length > 0;
  const state = worst?.over ? 'over' : worst ? 'tight' : undated ? '' : events ? 'fits' : '';
  const toggle = button('', () => { ui.weekOpen = !ui.weekOpen; api.render(); }, 'wr-week-toggle ' + state);
  toggle.setAttribute('aria-expanded', String(ui.weekOpen));
  toggle.dataset.key = 'week';
  const text = el('span', 'wr-week-text');
  const by = r => (r.value ? weekday(r.value.slice(0, 10)) : 'Sunday');
  const verdict = !worst ? (events ? 'fits before every deadline' : '')
    : worst.overdue ? `${worst.title} is overdue`
      : worst.over ? `short ${duration(worst.need - worst.free)} by ${by(worst)}` : `tight by ${by(worst)}`;
  const undatedText = `${unplaced ? duration(unplaced) + ' of Must' : plural(placements.length, 'Must')} with no day yet`;
  text.append(el('span', 'wr-week-head tnum', undated ? undatedText
    : `${duration(cap.must)} of Must` + (verdict ? ` · ${verdict}` : '')));
  const detail = undated ? `${duration(cap.must)} of Must in all${events ? ', with free time before every deadline' : ''}`
    : placements.length ? undatedText
      : worst && !worst.overdue ? worst.title : `${plural(chosen.length, 'Result')}, each against its own deadline`;
  text.append(el('span', 'wr-week-sub', detail));
  toggle.append(text, icon(ui.weekOpen ? 'expand_less' : 'expand_more'));
  box.append(toggle);
  if (ui.weekOpen) {
    box.append(capacityRows(cap.rows, now));
    if (events) box.append(el('p', 'wr-summary-note', 'Free time counts 8 AM–10 PM minus your calendar. Each Result counts the Musts due before it too, since that work comes first.'));
  }
  // Undated Musts and their suggested days stay in view: they are what the plan still lacks.
  if (placements.length && (ui.weekOpen || undated)) box.append(placementBox(api, placements));
  if (ui.focusHint) box.append(el('p', 'wr-summary-note wr-summary-warn', ui.focusHint));
  return box;
}

/** One row per picked Result, in deadline order, with the words and numbers its card uses. */
function capacityRows(rows, now) {
  const list = el('ul', 'wr-ladder');
  for (const r of rows) {
    const state = r.over ? 'over' : r.tight ? 'tight' : r.free != null ? 'fits' : '';
    const item = el('li', state);
    const text = el('span', 'wr-ladder-text');
    const facts = [r.value ? dueWords(r.value, now) : 'No deadline this week', `${duration(r.must)} of Must`];
    if (r.free != null && !r.overdue) facts.push(`${duration(r.free)} free`);
    if (state !== 'fits' && r.need > r.must) facts.push(`${duration(r.need)} with earlier deadlines`);
    // Each fact stays whole; a line only breaks between them.
    const line = el('span', 'wr-ladder-must tnum');
    facts.forEach((fact, i) => line.append(...(i ? [' · '] : []), el('span', 'wr-nowrap', fact)));
    text.append(el('span', 'wr-ladder-when', r.title), line);
    item.append(text);
    const word = r.overdue ? 'Overdue' : r.over ? `Short ${duration(r.need - r.free)}` : r.tight ? 'Tight' : state ? 'Fits' : '';
    if (word) item.append(el('span', 'wr-ladder-state', word));
    list.append(item);
  }
  return list;
}

/** Undated Musts with the freest day before their deadline: shown first, written only on the tap, with Undo. */
function placementBox(api, placements) {
  const box = el('div', 'wr-place');
  box.append(el('p', 'wr-place-head', 'Suggested days, from free time before each deadline'));
  const list = el('ul', 'wr-place-list');
  for (const p of placements) {
    const row = el('li');
    row.append(Object.assign(icon('star', true), {className: 'ms fill must'}), el('span', 'wr-place-title', p.title),
      el('span', 'wr-place-day', p.day === localDay(api.now()) ? 'Today' : weekday(p.day)));
    list.append(row);
  }
  const go = button(placements.length === 1 ? 'Give it this day' : 'Give them these days',
    () => api.run(d => placeMusts(d, placements), placements.length === 1 ? 'Must given a day' : `${placements.length} Musts given a day`), 'wr-btn-tonal');
  go.dataset.key = 'place';
  box.append(list, go);
  return box;
}

function calendarNote(calendar) {
  if (calendar === undefined) return 'Reading your calendar…';
  const status = calendar?.status;
  if (status === 'ready') return 'Free time counts 8 AM–10 PM, minus your calendar.';
  if (READABLE.has(status)) return 'Free time counts 8 AM–10 PM, minus your calendar. The calendar copy may be incomplete.';
  if (status === 'not_selected' || status === 'permission_needed') return "Calendar not connected, so free time isn't counted. Connect it from Today's menu.";
  return "Calendar unavailable, so free time isn't counted.";
}

/**
 * Today to Sunday as Calendar-style day buttons. Each says its marks in words: the Must time already on it (★),
 * "Due" when a Result's deadline falls on it, "Clash" when calendar events overlap. A tap shows that day below.
 */
function dayStrip(api, days, due) {
  const {ui} = api;
  const strip = el('div', 'wr-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Days until the end of the week');
  const today = days[0]?.day;
  for (const d of days) {
    const date = new Date(d.day + 'T12:00');
    const on = ui.day === d.day;
    const cell = button('', () => { ui.day = on ? null : d.day; api.render(); },
      'wr-strip-day' + (d.day === today ? ' today' : '') + (on ? ' sel' : '') + (d.over ? ' over' : ''));
    cell.setAttribute('aria-pressed', String(on));
    cell.dataset.key = 'day:' + d.day;
    const said = [dayName(d.day)];
    cell.append(el('span', 'wr-strip-letter', date.toLocaleDateString(undefined, {weekday: 'narrow'})), el('span', 'wr-strip-num tnum', String(date.getDate())));
    const must = el('span', 'wr-strip-must tnum');
    if (d.must) {
      must.append(Object.assign(icon('star', true), {className: 'ms fill must'}), hours(d.must));
      said.push(`${duration(d.must)} of Must`);
    }
    const dueHere = due.some(c => c.due.slice(0, 10) === d.day);
    const deadline = el('span', 'wr-strip-mark', dueHere ? 'Due' : '');
    if (dueHere) said.push(d.over ? 'a deadline, Must time does not fit' : 'a deadline');
    const clash = el('span', 'wr-strip-mark clash');
    if (d.clash) { clash.append(el('i', 'wr-dot'), 'Clash'); said.push('calendar clash'); }
    cell.append(must, deadline, clash);
    cell.setAttribute('aria-label', said.join(', '));
    strip.append(cell);
  }
  return strip;
}

/** One day from the strip: its free time, the deadlines on it (picked or not), the Musts already on it and any clash. */
function dayDetail(api, d, due, placed, clashes, now) {
  const box = el('div', 'wr-day');
  box.setAttribute('aria-live', 'polite');
  const head = el('p', 'wr-day-head');
  const today = d.day === localDay(now);
  head.append(el('b', '', today ? 'Today' : new Date(d.day + 'T12:00').toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'})));
  if (d.free != null) head.append(` · ${duration(d.free)} free ${today ? 'until 10\u00a0PM' : 'from 8\u00a0AM to 10\u00a0PM'}`);
  box.append(head);
  const list = el('ul', 'wr-day-list');
  const row = (lead, text, cls = '') => {
    const item = el('li', cls);
    item.append(lead, el('span', 'wr-day-text', text));
    list.append(item);
  };
  for (const c of due.filter(c => c.due.slice(0, 10) === d.day)) {
    const when = c.due.length > 10 ? clock(c.due) : 'end of day';
    row(el('b', 'wr-day-lead', 'Due ' + when), c.title + (api.ui.focus.includes(c.blockId) ? '' : ' · not picked'));
  }
  for (const p of placed.filter(p => p.day === d.day)) {
    const task = api.data().entries.find(t => t.id === p.taskId);
    const lead = el('span', 'wr-day-lead');
    lead.append(Object.assign(icon('star', true), {className: 'ms fill must'}), p.minutes ? duration(p.minutes) : '');
    row(lead, task?.title ?? 'Must');
  }
  for (const c of clashes.filter(c => c.day === d.day)) {
    const decided = api.clashes().find(x => x.key === clashKey(c));
    const done = decided && ['decided', 'planned'].includes(clashState(api, decided).state);
    row(el('b', 'wr-day-lead' + (done ? '' : ' overdue'), 'Clash ' + clock(c.b.start)), `${c.a.title} and ${c.b.title}${done ? ' · decided' : ''}`);
  }
  if (!list.childElementCount) list.append(el('li', 'wr-day-empty', 'Nothing due, no Musts and no clashes.'));
  box.append(list);
  return box;
}

/**
 * A clash is a decision, not a loose to-do: which event stays. Calendars are read-only, so the answer becomes a task
 * on Today (the user's own task naming the clash keeps its words and gains the decision in its notes). "Decide later"
 * says so explicitly; Finish never waits on it.
 */
function clashState(api, clash) {
  const choice = api.ui.clashes[clash.key];
  if (api.ui.clashOpen === clash.key) return {state: 'open', choice};
  if ((choice === 'a' || choice === 'b') && clash.task && String(clash.task.notes ?? '').includes(clashDecision(clash, choice))) return {state: 'decided', choice};
  if (clash.task && taskDate(clash.task)) return {state: 'planned'};
  return {state: choice === 'later' ? 'later' : 'open'};
}

function clashRow(api, clash) {
  const {ui} = api;
  const {state, choice} = clashState(api, clash);
  const item = el('li', 'wr-risk wr-clash' + (state === 'decided' || state === 'planned' ? ' done' : ''));
  const text = el('span', 'wr-risk-text');
  const lead = el('span', '');
  const when = `${dayName(clash.day)}, ${clock(clash.b.start)}`;
  const reopen = label => {
    const go = button(label, () => { ui.clashOpen = clash.key; api.render(); }, 'wr-btn-text');
    go.dataset.key = 'clash-open:' + clash.key;
    return go;
  };
  if (state === 'decided' || state === 'planned') {
    lead.append(el('b', 'wr-risk-lead', 'Clash decided'), ' · ' + when);
    const sub = el('span', 'wr-risk-sub');
    const [stays, other] = choice === 'b' ? [clash.b, clash.a] : [clash.a, clash.b];
    if (state === 'decided') sub.append('Keep ', el('span', 'wr-nowrap', stays.title), ', move or skip ', el('span', 'wr-nowrap', other.title));
    else sub.append(clash.task.title);
    sub.append(' · ', el('span', 'wr-nowrap', `a task for ${whenText(clash.task, api.now())?.text ?? 'Today'}`));
    text.append(lead, sub);
    item.append(icon('event_available'), text, reopen('Change'));
    return item;
  }
  lead.append(el('b', 'wr-risk-lead', 'Clash'), ' · ' + when);
  // Each event with its time stays whole, so a range never breaks across lines.
  const both = el('span', 'wr-risk-sub');
  both.append(el('span', 'wr-nowrap', `${clash.a.title} ${timeRange(clash.a.start, clash.a.end)}`), ' overlaps ',
    el('span', 'wr-nowrap', `${clash.b.title} ${timeRange(clash.b.start, clash.b.end)}`));
  if (state === 'later') {
    both.append('. Left for later.');
    text.append(lead, both);
    item.append(icon('event_busy'), text, reopen('Decide'));
    return item;
  }
  text.append(lead, both, el('span', 'wr-ask-small', 'Which one stays? Your answer goes on Today as a task.'));
  const choices = el('span', 'wr-choices');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Which event stays');
  const decide = keep => {
    ui.clashes = {...ui.clashes, [clash.key]: keep};
    ui.clashOpen = null;
    if (keep === 'later') { api.render(); api.saveProgress(); return; }
    api.saveProgress();
    api.run(d => decideClash(d, clash, keep, api.now()), 'Decision added to Today');
  };
  for (const [keep, label, said] of [['a', clash.a.title, 'Keep ' + clash.a.title], ['b', clash.b.title, 'Keep ' + clash.b.title], ['later', 'Later', 'Decide later']]) {
    const chip = button(label, () => decide(keep), 'wr-chip wr-choice' + (choice === keep ? ' sel' : ''));
    chip.setAttribute('aria-label', said);
    chip.dataset.key = `clash:${keep}:${clash.key}`;
    choices.append(chip);
  }
  text.append(choices);
  item.append(icon('event_busy'), text);
  return item;
}

/** Results as one list of rows: a checkbox picks, the row opens its Purpose and tasks. Only meaning carries colour. */
function resultList(api, rows, now, missed, label) {
  const list = el('ul', 'wr-list wr-results');
  list.setAttribute('aria-label', label);
  for (const c of rows) list.append(resultRow(api, c, now, missed.has(c.blockId)));
  return list;
}

function resultRow(api, c, now, flagged) {
  const {ui} = api;
  const open = ui.expanded === c.blockId;
  const item = el('li', 'wr-result' + (ui.focus.includes(c.blockId) ? ' picked' : ''));
  const check = focusCheck(api, c.blockId, c.title);
  check.setAttribute('aria-label', `Pick "${c.title}"`);
  const main = button('', () => { ui.expanded = open ? null : c.blockId; api.render(); }, 'wr-result-main');
  main.setAttribute('aria-expanded', String(open));
  main.dataset.key = 'open:' + c.blockId;
  const text = el('span', 'wr-result-text');
  text.append(el('span', 'wr-result-title', c.title));
  // One facts line, as on the Blocks list: the deadline, the Must time (or why there is none), Carried, Not picked.
  const left = c.total - c.done;
  const info = c.due ? dueInfo(c.due, now) : null;
  const must = !c.total ? 'No tasks yet' : !left ? 'All tasks done' : c.mustMinutes ? mustFact(c.mustMinutes)
    : info && (info.soon || info.overdue) ? el('span', 'wr-warn', 'No Must set') : null;
  const facts = el('span', 'wr-facts tnum');
  facts.append(...factsLine([dueFact(c.due, now), must, !c.due && left ? `${c.done} of ${c.total} done` : null,
    c.carried ? 'Carried from last week' : null]));
  text.append(facts);
  if (flagged) text.append(el('span', 'wr-flag', 'Due this week · not picked'));
  main.append(text, icon(open ? 'expand_less' : 'expand_more'));
  main.setAttribute('aria-label', `${c.title}. ${open ? 'Hide' : 'Show'} its Purpose and tasks`);
  const row = el('div', 'wr-result-row');
  row.append(check, main);
  item.append(row);
  if (open) {
    const more = el('div', 'wr-result-more');
    if (c.purpose) more.append(el('p', 'wr-result-purpose', c.purpose));
    more.append(mustList(api, c.blockId, now));
    item.append(more);
  }
  return item;
}

function toggleFocus(api, blockId) {
  const {focus} = api.ui;
  setFocus(api, focus.includes(blockId) ? focus.filter(id => id !== blockId) : [...focus, blockId]);
}
/** This week's draft choice, at most five; saved quietly (it is a draft until Finish). */
function setFocus(api, ids) {
  const {ui} = api;
  ui.focusHint = ids.length > MAX_FOCUS ? 'Five is the most for one week. Unpick one to swap it.' : '';
  ui.focus = [...new Set(ids)].slice(0, MAX_FOCUS);
  api.render();
  api.run(d => saveReviewProgress(d, api.week, {focusDraft: ui.focus}), null);
}

/** A Result's open tasks, each row toggling Must: the Must time above updates as they change, with Undo. */
function mustList(api, blockId, now) {
  const open = blockTasks(api.data(), blockId).filter(t => !t.done);
  const box = el('div', 'wr-musts');
  const head = el('div', 'wr-musts-head');
  const plan = button('Open Plan', () => api.openBlock(blockId), 'wr-btn-text wr-open-block');
  head.append(el('span', '', open.length ? 'Tap the tasks that must happen' : 'No open tasks. Add the next step to the Plan.'), plan);
  box.append(head);
  for (const task of open) {
    // The whole row toggles Must (like a checklist); only a Must shows its star, so nothing reads as "favourite".
    const label = task.must ? 'Must. Tap to unmark' : 'Mark as Must';
    const toggle = () => api.run(d => setMust(d, task.id, !task.must), task.must ? 'No longer a Must' : 'Marked Must');
    const row = button('', toggle, 'wr-must-row' + (task.must ? ' on' : ''));
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', String(!!task.must));
    row.setAttribute('aria-label', `${label}: ${task.title ?? task.raw}`);
    row.dataset.key = 'must:' + task.id;
    const star = el('span', 'wr-star');
    if (task.must) star.append(Object.assign(icon('star', true), {className: 'ms fill must'}));
    // The title, then its day on its own quiet line, so a time never wraps away from its day.
    const when = whenText(task, now);
    const text = el('span', 'wr-must-text');
    text.append(el('span', 'wr-must-title', task.title ?? task.raw));
    if (when) text.append(el('span', 'wr-must-when tnum' + (when.overdue ? ' overdue' : ''), when.text));
    row.append(star, text, el('span', 'wr-must-min tnum', task.minutes == null ? '–' : duration(task.minutes)));
    box.append(row);
  }
  return box;
}
