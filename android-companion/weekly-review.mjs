// Weekly review: last week's Results → capture → group into Blocks → this week's Results.
// Renders into the container the planner gives it and talks to the app only through `ctx`
// (getData, commit, close, openBlock, openCapture, now, day; optional sortInbox, readCalendar).
// Plan changes go through ctx.commit with a label, so they save, re-render and offer Undo.
// Review progress (step, draft choice of Results) is saved with ctx.commit(mutator, null):
// a null label means "save quietly"; it changes no plan data and keeps the last Undo intact.
import {
  REVIEW_STEPS, reviewWeek, reviewSummary, markAchieved, decideLeftover, leftoverChoice, inboxTasks,
  groupTasks, addInboxTask, taskDate, setMust, focusCandidates, weekFocus, reviewProgress, saveReviewProgress, finishReview,
  weekCapacity, calendarClashes,
} from './review-state.mjs';
import {planner, blockTasks, shiftDay} from './planner-state.mjs';
import {areaTone} from './planner-ux.mjs';
import {calendarRows} from './planner-calendar.mjs';
import {dueInfo, clock} from './planner/format.mjs';
import {areaDot} from './planner/dom.mjs';

const STEPS = [
  {name: "Last week's Results", next: 'Next: empty your head'},
  {name: 'Empty your head', next: 'Next: group into Blocks'},
  {name: 'Group into Blocks', next: "Next: this week's Results"},
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
export function formatMinutes(minutes) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function weekLabel(day) {
  const date = new Date(day + 'T12:00:00');
  return 'Week of ' + date.toLocaleDateString(undefined, {day: 'numeric', month: 'long'});
}
const dayName = day => new Date(day + 'T12:00').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'});
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
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
    selected: [],
    sheet: null, // step 3: 'add' (pick a Result) or 'new' (new Result with its Purpose)
    newBlock: {title: '', purpose: ''},
    draft: '',
    lens: null,
    expanded: null, // step 4: the picked Result whose tasks are listed with Must stars
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
    /** Android Back: closes an open sheet, then a selection; returns true when it handled the press. */
    back() {
      if (ui.sheet) ui.sheet = null;
      else if (ui.selected.length) ui.selected = [];
      else return false;
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
        ui.hint = error?.message ?? 'That change could not be saved.';
      } finally {
        ui.busy = false;
      }
    });
    queue = job.then(() => { if (!ui.destroyed) render(); });
    return queue;
  }
  const saveProgress = (patch = {}) => {
    const progress = {step: ui.step, focusDraft: ui.focus, inboxIds: ui.inboxIds, ...patch};
    return run(d => saveReviewProgress(d, week, progress, ctx.now()), null);
  };
  const groupList = () => {
    const ids = new Set([...ui.inboxIds, ...inboxTasks(data()).map(t => t.id)]);
    return data().entries.filter(t => ids.has(t.id) && !t.archived && !t.done && (t.kind ?? 'plan') === 'plan');
  };
  function goTo(step) {
    if (step < 1 || step > REVIEW_STEPS || step === ui.step) return;
    Object.assign(ui, {inboxIds: groupList().map(t => t.id), step, selected: [], sheet: null,
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
  return {data, week, ui, run, goTo, close, finish, render, groupList, openBlock, events, now: () => ctx.now()};
}

function renderReview(root, api, ctx) {
  const {ui} = api;
  ui.seen = api.data();
  const scroller = root.querySelector('.wr-body');
  const keepScroll = !ui.stepChanged && scroller ? scroller.scrollTop : 0;
  const body = el('div', 'wr-body');
  const content = el('div', 'wr-content' + (ui.stepChanged ? ' wr-enter' : ''));
  content.append(...stepContent(api, ctx));
  body.append(content);
  const active = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  const selecting = ui.step === 3 && ui.selected.length > 0;
  const foot = selecting ? selectionBar(api) : footer(api);
  root.replaceChildren(topBar(api), progressBar(ui.step, api.goTo), body, foot);
  if (selecting && ui.sheet) root.append(sheetLayer(api));
  body.scrollTop = keepScroll;
  // A hairline over the footer only while content continues underneath it (no fade over the last card).
  const edge = () => foot.classList.toggle('edge', body.scrollTop + body.clientHeight < body.scrollHeight - 2);
  body.addEventListener('scroll', edge, {passive: true});
  edge();
  document.documentElement.style.setProperty('--wr-foot', foot.offsetHeight + 'px');
  if (ui.stepChanged) {
    ui.stepChanged = false;
    root.querySelector('.wr-title')?.focus({preventScroll: true});
  } else if (active) {
    root.querySelector(`[data-key="${CSS.escape(active)}"]`)?.focus({preventScroll: true});
  }
}

/* ---------- frame: top bar, progress, footer ---------- */
function topBar(api) {
  const bar = el('header', 'wr-bar');
  bar.append(iconButton('close', 'Close review', api.close), el('h1', 'wr-bar-title', 'Weekly review'));
  const count = el('span', 'wr-bar-count tnum', `${api.ui.step} of ${REVIEW_STEPS}`);
  count.setAttribute('aria-hidden', 'true');
  bar.append(count);
  return bar;
}

function progressBar(step, goTo) {
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
function footer(api) {
  const {ui} = api;
  const foot = el('footer', 'wr-foot');
  if (ui.step > 1) foot.append(button('Back', () => api.goTo(ui.step - 1), 'wr-btn-text wr-back', 'arrow_back'));
  const last = ui.step === REVIEW_STEPS;
  const label = last ? (ui.focus.length ? `Finish with ${plural(ui.focus.length, 'Result')}` : 'Finish review') : STEPS[ui.step - 1].next;
  const next = button('', last ? api.finish : () => api.goTo(ui.step + 1), 'wr-btn-filled wr-next');
  next.append(el('span', 'wr-label wr-long', label), el('span', 'wr-label wr-short', last ? 'Finish' : 'Next'), icon(last ? 'check' : 'arrow_forward'));
  next.setAttribute('aria-label', label);
  foot.append(next);
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

/** Overlapping calendar events between now and the end of the planned week: the week's most consequential problem. */
function clashNotes(api) {
  const events = api.events();
  if (!events) return [];
  const end = new Date(shiftDay(api.week, 7) + 'T00:00');
  return calendarClashes(events, api.now(), end).slice(0, 2).map(({day, a, b}) => {
    const row = el('div', 'wr-clash');
    row.setAttribute('role', 'note');
    const text = el('div', 'wr-clash-text');
    text.append(el('p', 'wr-clash-title', `Calendar clash ${dayName(day)}`),
      el('p', 'wr-clash-detail tnum', `${a.title} (${clock(a.start)}–${clock(a.end)}) overlaps ${b.title} (${clock(b.start)}–${clock(b.end)}). Settle it in your calendar.`));
    row.append(icon('event_busy'), text);
    return row;
  });
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

function resultCard(api, summary, result) {
  const win = result.verdict === 'achieved';
  const card = el('article', 'wr-card wr-result' + (win ? ' win' : ''));
  if (win) {
    const badge = el('p', 'wr-win-badge');
    badge.append(icon('emoji_events', true), el('span', '', 'Win'));
    card.append(badge);
  }
  card.append(el('h3', 'wr-card-title', result.title));
  if (result.purpose) card.append(el('p', 'wr-card-purpose', result.purpose));
  card.append(progressMeta(result, win ? null : result.due, api.now()));
  if (!result.verdict && result.total && result.done === result.total) {
    const ask = el('p', 'wr-ask');
    ask.append(icon('task_alt'), el('span', '', 'All tasks done. Did the Result happen?'));
    card.append(ask);
  }
  card.append(verdictControl(api, summary, result));
  if (win) card.append(evidenceField(api, summary, result));
  if (result.verdict === 'partly' || result.verdict === 'notyet') card.append(carryRow(api, result), leftoverList(api, result));
  else if (win && result.leftovers.length) {
    card.append(el('p', 'wr-card-note', `${plural(result.leftovers.length, 'open task')} stay in this Block.`));
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
    }, `wr-seg-btn ${value}` + (selected ? ' sel' : ''));
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(selected));
    option.dataset.key = `verdict:${result.blockId}:${value}`;
    if (selected) option.append(icon(value === 'achieved' ? 'emoji_events' : 'check', true));
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

/** Carrying pre-picks the Result in step 4 (a draft, not plan data). */
function carryChip(api, result, short = false) {
  const on = api.ui.focus.includes(result.blockId);
  const label = on ? (short ? 'Carried' : "In this week's Results") : (short ? 'Carry' : 'Carry into this week');
  const chip = button(label, () => toggleFocus(api, result.blockId), 'wr-chip' + (on ? ' sel' : ''), on ? 'check' : 'redo');
  chip.setAttribute('aria-pressed', String(on));
  if (short) chip.setAttribute('aria-label', `Carry "${result.title}" into this week`);
  chip.dataset.key = 'carry:' + result.blockId;
  return chip;
}
function carryRow(api, result) {
  const row = el('div', 'wr-carry');
  row.append(carryChip(api, result));
  return row;
}

/** Results whose deadline is still ahead: nothing to judge yet, so the only question is whether to carry them. */
function runningList(api, running) {
  const now = api.now();
  const list = el('ul', 'wr-list wr-running');
  list.setAttribute('aria-label', 'Still running');
  for (const r of running) {
    const item = el('li', 'wr-run');
    const text = el('div', 'wr-run-text');
    text.append(el('span', 'wr-run-title', r.title));
    const meta = el('span', 'wr-run-meta tnum');
    const chip = dueChip(r.due, now);
    if (chip) meta.append(chip);
    meta.append(el('span', '', r.mustMinutes ? `${formatMinutes(r.mustMinutes)} of Must left` : 'No Must set'));
    text.append(meta);
    item.append(text, carryChip(api, r, true));
    list.append(item);
  }
  return [sectionHead('Still running', running.length),
    el('p', 'wr-section-note', "Their deadlines haven't come yet, so there's nothing to judge. Carry them into this week."), list];
}

function leftoverList(api, result) {
  const box = el('div', 'wr-left');
  if (!result.leftovers.length) {
    box.append(el('p', 'wr-card-note', 'No open tasks left in this Block.'));
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
    const text = el('span', 'wr-list-text');
    text.append(el('span', 'wr-list-title', task.title ?? task.raw));
    const when = whenText(task, now);
    if (when || task.must) {
      const meta = el('span', 'wr-list-meta');
      if (task.must) {
        const must = el('span', 'wr-must-tag');
        must.append(icon('star', true), el('span', '', 'Must'));
        meta.append(must);
      }
      if (when) meta.append(el('span', when.overdue ? 'overdue' : when.soon ? 'soon' : '', when.text));
      text.append(meta);
    }
    item.append(text);
    list.append(item);
  }
  parts.push(list);
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
  input.placeholder = ui.lens ? `Anything for ${ui.lens}?` : 'Ideas, wants, to-dos';
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

/** RPM's lenses: walking through each Area surfaces what a blank field doesn't. A tap only changes the prompt. */
function lenses(api) {
  const {ui} = api;
  const areas = planner(api.data()).areas.filter(a => !a.archived);
  if (!areas.length) return [];
  const row = el('div', 'wr-lenses');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Think through an Area');
  for (const area of areas) {
    const on = ui.lens === area.title;
    const chip = button('', () => {
      ui.lens = on ? null : area.title;
      api.render();
      document.querySelector('.wr-add-input')?.focus({preventScroll: true});
    }, 'wr-chip wr-lens' + (on ? ' sel' : ''));
    chip.setAttribute('aria-pressed', String(on));
    chip.dataset.key = 'lens:' + area.id;
    chip.append(areaDot(areaTone(area, planner(api.data()).areas)), el('span', 'wr-label', area.title));
    row.append(chip);
  }
  return [el('p', 'wr-lens-head', 'Stuck? Think through each Area'), row];
}

/* ---------- step 3: group into Blocks ---------- */
function stepThree(api, ctx) {
  const {ui} = api;
  const rows = api.groupList();
  const loose = rows.filter(t => (t.blockId ?? null) === null);
  ui.selected = ui.selected.filter(id => loose.some(t => t.id === id));
  if (!ui.selected.length) ui.sheet = null;
  const parts = heading('Group into Blocks', 'Select tasks that serve one Result, then add them to it or start a new one. Errands can stay in the Inbox.');
  parts.push(...clashNotes(api));
  if (!rows.length) {
    parts.push(emptyState('done_all', 'Nothing to group', 'Your Inbox is empty, so every task already has a home.'));
    return parts;
  }
  if (ctx.sortInbox && loose.length) {
    const jev = el('div', 'wr-jev');
    jev.append(button('Suggest Blocks with Jev', () => ctx.sortInbox(), 'wr-chip wr-assist', 'auto_awesome'),
      el('span', 'wr-jev-note', 'Jev proposes; nothing moves until you confirm.'));
    parts.push(jev);
  }
  parts.push(sectionHead('Inbox', loose.length));
  if (loose.length) {
    const list = el('ul', 'wr-list wr-group-list');
    list.setAttribute('aria-label', 'Inbox tasks to group');
    for (const task of loose) list.append(selectRow(api, task));
    parts.push(list);
  } else parts.push(el('p', 'wr-quiet', 'Inbox is clear. Every task here has a Result.'));

  // Blocks forming: the Results that received tasks during this step, each with what it received.
  const grouped = rows.filter(t => t.blockId);
  if (grouped.length) {
    const now = api.now();
    parts.push(sectionHead('Grouped', null));
    const list = el('ul', 'wr-list wr-formed');
    list.setAttribute('aria-label', 'Grouped into Results');
    for (const c of focusCandidates(api.data(), api.week).filter(c => grouped.some(t => t.blockId === c.blockId))) {
      const head = el('li', 'wr-formed-head');
      head.append(el('span', 'wr-target-title', c.title));
      if (c.purpose) head.append(el('span', 'wr-target-purpose', c.purpose));
      const chip = c.due && dueChip(c.due, now);
      if (chip) head.append(chip);
      list.append(head);
      for (const task of grouped.filter(t => t.blockId === c.blockId)) list.append(groupedRow(api, task));
    }
    parts.push(list);
  }
  return parts;
}

/** One line per Inbox task: the whole row selects it, as in Gmail and Google Tasks. */
function selectRow(api, task) {
  const {ui} = api;
  const item = el('li', 'wr-row');
  const on = ui.selected.includes(task.id);
  const check = button('', () => {
    ui.selected = on ? ui.selected.filter(id => id !== task.id) : [...ui.selected, task.id];
    api.render();
  }, 'wr-row-check' + (on ? ' on' : ''));
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(on));
  check.dataset.key = 'check:' + task.id;
  check.append(icon(on ? 'check_box' : 'check_box_outline_blank', on), el('span', 'wr-row-title', task.title ?? task.raw));
  item.append(check);
  return item;
}

function groupedRow(api, task) {
  const item = el('li', 'wr-row sub');
  const name = task.title ?? task.raw;
  item.append(icon('subdirectory_arrow_right'), el('span', 'wr-row-title', name));
  const back = iconButton('close', `Move "${name}" back to the Inbox`,
    () => api.run(d => groupTasks(d, [task.id], null), 'Moved to Inbox'), 'wr-icon-btn wr-unmove');
  back.dataset.key = 'unmove:' + task.id;
  item.append(back);
  return item;
}

/** While tasks are selected the footer becomes a contextual action bar: how many, New Result, Add to… */
function selectionBar(api) {
  const {ui} = api;
  const bar = el('footer', 'wr-foot wr-selbar');
  const clear = iconButton('close', 'Clear selection', () => { Object.assign(ui, {selected: [], sheet: null}); api.render(); });
  const count = el('span', 'wr-sel-count tnum', `${ui.selected.length} selected`);
  count.setAttribute('aria-live', 'polite');
  const open = sheet => () => {
    Object.assign(ui, {sheet, newBlock: sheet === 'new' ? {title: '', purpose: ''} : ui.newBlock});
    api.render();
    document.querySelector(sheet === 'new' ? '.wr-sheet input' : '.wr-sheet .wr-sheet-title')?.focus({preventScroll: true});
  };
  const fresh = button('New Result', open('new'), 'wr-btn-tonal');
  fresh.dataset.key = 'sel:new';
  const add = button(`Add to…`, open('add'), 'wr-btn-filled wr-sel-add');
  add.dataset.key = 'sel:add';
  add.setAttribute('aria-label', `Add ${plural(ui.selected.length, 'task')} to a Result`);
  bar.append(clear, count, fresh, add);
  return bar;
}

/** A bottom sheet over the step: pick the Result to add the selection to, or name a new one with its Purpose. */
function sheetLayer(api) {
  const {ui} = api;
  const layer = el('div', 'wr-layer');
  const scrim = el('div', 'wr-scrim');
  scrim.addEventListener('click', () => { ui.sheet = null; api.render(); });
  const sheet = el('section', 'wr-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const chosen = api.groupList().filter(t => ui.selected.includes(t.id));
  sheet.append(el('div', 'wr-handle'), ...(ui.sheet === 'new' ? newResultForm(api, chosen) : resultChooser(api, chosen)));
  sheet.setAttribute('aria-label', sheet.querySelector('.wr-sheet-title').textContent);
  layer.append(scrim, sheet);
  return layer;
}

function sheetTitle(text) {
  const h = el('h2', 'wr-sheet-title', text);
  h.tabIndex = -1;
  return h;
}

function resultChooser(api, chosen) {
  const {ui} = api;
  const now = api.now();
  const n = chosen.length;
  const list = el('div', 'wr-picker');
  const fresh = button('New Result', () => { Object.assign(ui, {sheet: 'new', newBlock: {title: '', purpose: ''}}); api.render(); }, 'wr-option wr-option-new', 'add');
  fresh.dataset.key = 'sheet:new';
  list.append(fresh);
  for (const c of focusCandidates(api.data(), api.week, [])) {
    const option = el('button', 'wr-option');
    option.type = 'button';
    option.dataset.key = 'sheet:' + c.blockId;
    const text = el('span', 'wr-option-text');
    text.append(el('span', 'wr-option-label', c.title));
    const detail = c.due ? dueInfo(c.due, now)?.label : c.purpose;
    if (detail) text.append(el('span', 'wr-option-detail', detail));
    option.append(icon('stacks'), text);
    option.addEventListener('click', () => {
      const ids = chosen.map(t => t.id);
      Object.assign(ui, {selected: [], sheet: null});
      api.run(d => groupTasks(d, ids, c.blockId), n === 1 ? 'Added to ' + c.title : `${n} tasks added to ${c.title}`);
    });
    list.append(option);
  }
  return [sheetTitle(`Add ${plural(n, 'task')} to…`), list];
}

/** RPM chunking: the selected tasks become one new Block with its Result and its Purpose, in one undoable change. */
function newResultForm(api, chosen) {
  const {ui} = api;
  const form = el('form', 'wr-new');
  form.noValidate = true;
  const result = textField("What's the Result?", 'What will be true when it is done', ui.newBlock.title, 'chunk:title', v => { ui.newBlock.title = v; sync(); });
  const purpose = textField('Why does it matter?', 'The Purpose that keeps you going', ui.newBlock.purpose, 'chunk:purpose', v => { ui.newBlock.purpose = v; sync(); });
  const actions = el('div', 'wr-new-actions');
  const cancel = button('Cancel', () => { ui.sheet = null; api.render(); }, 'wr-btn-text');
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
    const ids = chosen.map(t => t.id);
    Object.assign(ui, {sheet: null, selected: []});
    api.run(d => groupTasks(d, ids, fields), 'New Result: ' + fields.title);
  });
  form.append(result, purpose, actions);
  return [sheetTitle('New Result'), el('p', 'wr-sheet-sub', chosen.map(t => t.title ?? t.raw).join(' · ')), form];
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
  const parts = heading("Pick this week's Results", 'Choose 3 to 5. Nearest deadline first.');
  parts.push(...clashNotes(api));
  if (!candidates.length) {
    parts.push(emptyState('stacks', 'No Blocks yet', 'Go back a step to group tasks into a new Block, then choose it here.'));
    return parts;
  }
  parts.push(capacityCard(api, candidates.filter(c => ui.focus.includes(c.blockId))));
  // Results with nothing left to do wait behind one row, so they don't compete with the urgent ones.
  const idle = candidates.filter(c => c.total === c.done && !ui.focusBase.includes(c.blockId));
  for (const c of candidates.filter(c => !idle.includes(c))) parts.push(focusCard(api, c, now));
  if (idle.length) {
    const toggle = button('', () => { ui.showIdle = !ui.showIdle; api.render(); }, 'wr-idle-toggle');
    toggle.setAttribute('aria-expanded', String(ui.showIdle));
    toggle.dataset.key = 'idle';
    toggle.append(el('span', 'wr-label', `${plural(idle.length, 'Result')} with no open tasks`), icon(ui.showIdle ? 'expand_less' : 'expand_more'));
    parts.push(toggle);
    if (ui.showIdle) for (const c of idle) parts.push(focusCard(api, c, now));
  }
  return parts;
}

/**
 * What the picked Results ask of the week, against the time there is: each deadline's Must time due by then beside
 * the free time until then (8 AM–10 PM minus calendar events), and a day strip with deadlines and clashes.
 * Without a readable calendar it says so and still shows the Must time.
 */
function capacityCard(api, chosen) {
  const {ui} = api;
  const now = api.now();
  const events = api.events();
  const cap = weekCapacity(chosen, events, api.week, now);
  const box = el('section', 'wr-summary');
  box.setAttribute('aria-label', 'This week at a glance');
  const head = el('p', 'wr-summary-head');
  head.setAttribute('aria-live', 'polite');
  head.append(el('span', 'wr-summary-count tnum', `${chosen.length} picked`), el('span', 'wr-summary-aim', ' · aim for 3–5'));
  box.append(head, dayStrip(cap.days, events != null, now));
  if (chosen.length) {
    const ladder = el('ul', 'wr-ladder');
    for (const c of cap.checkpoints.slice(0, 4)) {
      const info = c.value ? dueInfo(c.value, now) : null;
      const state = info?.overdue || c.over ? 'over' : c.tight ? 'tight' : events ? 'fits' : '';
      const item = el('li', state);
      const when = info ? capital(info.overdue ? 'Overdue' : info.label.replace(/^Due /, '')) : 'By the end of the week';
      const text = el('span', 'wr-ladder-text');
      text.append(el('span', 'wr-ladder-when', when),
        el('span', 'wr-ladder-must tnum', `${formatMinutes(c.must)} of Must` + (c.free != null ? ` · ${formatMinutes(c.free)} free` : ' by then')));
      item.append(icon(c.value ? 'hourglass_bottom' : 'date_range', true), text);
      if (state === 'over') item.append(el('span', 'wr-ladder-state', c.free != null ? `Short ${formatMinutes(c.must - c.free)}` : 'Overdue'));
      else if (state === 'tight') item.append(el('span', 'wr-ladder-state', 'Tight'));
      else if (state === 'fits') item.append(el('span', 'wr-ladder-state', 'Fits'));
      ladder.append(item);
    }
    box.append(ladder);
  } else {
    box.append(el('p', 'wr-summary-line', 'Pick a Result to see whether its Must time fits before its deadline.'));
  }
  box.append(el('p', 'wr-summary-note', calendarNote(ui.calendar)));
  if (ui.focusHint) box.append(el('p', 'wr-summary-note wr-summary-warn', ui.focusHint));
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

/** Today to Sunday as Calendar-style day cells: free hours, an hourglass on deadline days, a warning on clash days. */
function dayStrip(days, counted, now) {
  const strip = el('ol', 'wr-strip');
  strip.setAttribute('aria-label', 'Days until the end of the week');
  const today = days[0]?.day;
  for (const d of days) {
    const date = new Date(d.day + 'T12:00');
    const cell = el('li', 'wr-strip-day' + (d.day === today ? ' today' : '') + (date.getDay() === 1 ? ' monday' : '') + (d.over ? ' over' : ''));
    const said = [dayName(d.day)];
    cell.append(el('span', 'wr-strip-letter', date.toLocaleDateString(undefined, {weekday: 'narrow'})), el('span', 'wr-strip-num tnum', String(date.getDate())));
    if (counted) {
      cell.append(el('span', 'wr-strip-free tnum', `${Math.round(d.free / 60)}h`));
      said.push(`${formatMinutes(d.free)} free`);
    }
    const marks = el('span', 'wr-strip-marks');
    if (d.deadlines) { marks.append(icon('hourglass_bottom', true)); said.push(d.over ? 'deadline, Must time does not fit' : 'deadline'); }
    if (d.clash) { marks.append(Object.assign(icon('warning', true), {className: 'ms fill clash'})); said.push('calendar clash'); }
    cell.append(marks);
    cell.setAttribute('aria-label', said.join(', '));
    strip.append(cell);
  }
  return strip;
}

function focusCard(api, c, now) {
  const {ui} = api;
  const selected = ui.focus.includes(c.blockId);
  const card = el('article', 'wr-card wr-pick' + (selected ? ' sel' : ''));
  const head = el('button', 'wr-pick-head');
  head.type = 'button';
  head.setAttribute('role', 'checkbox');
  head.setAttribute('aria-checked', String(selected));
  head.dataset.key = 'pick:' + c.blockId;
  head.append(icon(selected ? 'check_circle' : 'radio_button_unchecked', selected));
  const text = el('span', 'wr-pick-text');
  text.append(el('span', 'wr-card-title', c.title));
  if (c.purpose) text.append(el('span', 'wr-card-purpose', c.purpose));
  const open = c.total - c.done;
  const info = c.due ? dueInfo(c.due, now) : null;
  // One facts line: the deadline, the Must time left (or why there is none), and Carried when it came from step 1.
  const facts = el('span', 'wr-tags tnum');
  const chip = c.due && dueChip(c.due, now);
  if (chip) facts.append(chip);
  if (!c.total) facts.append(el('span', 'wr-fact', 'No tasks yet'));
  else if (!open) facts.append(el('span', 'wr-fact', 'All tasks done'));
  else if (c.mustMinutes) facts.append(el('span', 'wr-fact', `${formatMinutes(c.mustMinutes)} Must`));
  else if (info && (info.soon || info.overdue)) {
    const warn = el('span', 'wr-warn');
    warn.append(icon('star'), el('span', '', 'No Must set'));
    facts.append(warn);
  } else facts.append(el('span', 'wr-fact', 'No Must yet'));
  if (c.carried) facts.append(el('span', 'wr-tag', 'Carried'));
  text.append(facts);
  head.append(text);
  head.addEventListener('click', () => toggleFocus(api, c.blockId));
  card.append(head);
  // Only the Result picked last lists its tasks with Must stars; the others fold to one line, so the stack stays short.
  if (selected && ui.expanded === c.blockId) card.append(mustList(api, c.blockId, now));
  else if (selected) {
    const musts = blockTasks(api.data(), c.blockId).filter(t => !t.done && t.must).length;
    const more = button(`${plural(open, 'open task')} · ${plural(musts, 'Must')}`, () => { ui.expanded = c.blockId; api.render(); }, 'wr-musts-more', 'expand_more');
    more.setAttribute('aria-expanded', 'false');
    more.dataset.key = 'more:' + c.blockId;
    card.append(more);
  }
  return card;
}

function toggleFocus(api, blockId) {
  const {ui} = api;
  ui.focusHint = '';
  if (ui.focus.includes(blockId)) ui.focus = ui.focus.filter(id => id !== blockId);
  else if (ui.focus.length >= MAX_FOCUS) ui.focusHint = 'Five is the most for one week. Unpick one to swap it.';
  else Object.assign(ui, {focus: [...ui.focus, blockId], expanded: blockId});
  api.render();
  api.run(d => saveReviewProgress(d, api.week, {focusDraft: ui.focus}), null);
}

/** Inline Must stars for a picked Result's open tasks: the Must time above updates as they change. */
function mustList(api, blockId, now) {
  const open = blockTasks(api.data(), blockId).filter(t => !t.done);
  const box = el('div', 'wr-musts');
  const head = el('div', 'wr-musts-head');
  head.append(el('span', '', open.length ? 'Star what must happen' : 'No open tasks. Add the next step in the Block.'),
    button('Open Block', () => api.openBlock(blockId), 'wr-btn-text wr-open-block'));
  box.append(head);
  for (const task of open) {
    const row = el('div', 'wr-must-row');
    const label = task.must ? 'Must. Tap to unmark' : 'Mark as Must';
    const toggle = () => api.run(d => setMust(d, task.id, !task.must), task.must ? 'No longer a Must' : 'Marked Must');
    const star = iconButton('star', `${label}: ${task.title}`, toggle, 'wr-icon-btn wr-star' + (task.must ? ' on' : ''));
    star.setAttribute('aria-pressed', String(!!task.must));
    star.dataset.key = 'must:' + task.id;
    if (task.must) star.querySelector('.ms').classList.add('fill');
    // One line per task: the star, the title and its time; a date only when the task has one.
    const when = whenText(task, now);
    const title = el('span', 'wr-must-title', task.title ?? task.raw);
    if (when) title.append(el('span', 'wr-must-when' + (when.overdue ? ' overdue' : ''), ' · ' + when.text));
    row.append(star, title, el('span', 'wr-must-min tnum', task.minutes == null ? '–' : formatMinutes(task.minutes)));
    box.append(row);
  }
  return box;
}
