// Weekly review: last week's Results → capture → group into Blocks → this week's Results.
// Renders into the container the planner gives it and talks to the app only through `ctx`
// (getData, commit, close, openBlock, openCapture, now, day; optional sortInbox).
// Plan changes go through ctx.commit with a label, so they save, re-render and offer Undo.
// Review progress (step, draft choice of Results) is saved with ctx.commit(mutator, null):
// a null label means "save quietly"; it changes no plan data and keeps the last Undo intact.
import {
  REVIEW_STEPS, reviewWeek, reviewSummary, markAchieved, decideLeftover, leftoverChoice, inboxTasks,
  groupTasks, addInboxTask, taskDate, setMust, focusCandidates, weekFocus, reviewProgress, saveReviewProgress, finishReview,
} from './review-state.mjs';
import {blockTasks} from './planner-state.mjs';
import {dueInfo} from './planner/format.mjs';

const STEPS = [
  {name: "Last week's Results", next: 'Next: capture this week'},
  {name: 'Capture', next: 'Next: group into Blocks'},
  {name: 'Group into Blocks', next: "Next: this week's Results"},
  {name: "This week's Results", next: 'Finish review'},
];
const VERDICTS = [['achieved', 'Achieved'], ['partly', 'Partly'], ['notyet', 'Not yet']];
const VERDICT_RECEIPTS = {achieved: 'Result achieved', partly: 'Marked partly achieved', notyet: 'Marked not achieved yet'};
const CHOICES = [['carry', 'Carry'], ['defer', 'Defer'], ['drop', 'Drop']];
const MAX_FOCUS = 5;
const AIM = 3;

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
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

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
  const text = info.overdue ? 'Overdue' : info.label.replace(/^Due /, '');
  return {text: text[0].toUpperCase() + text.slice(1), overdue: info.overdue, soon: info.soon};
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
    chunk: false,
    pickerFor: null,
    newBlock: {title: '', purpose: ''},
    draft: '',
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

  return {
    refresh: render,
    /** Android Back: closes an open picker or form, then a selection; returns true when it handled the press. */
    back() {
      if (ui.chunk || ui.pickerFor != null) Object.assign(ui, {chunk: false, pickerFor: null});
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
    Object.assign(ui, {inboxIds: groupList().map(t => t.id), step, selected: [], chunk: false, pickerFor: null,
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
  return {data, week, ui, run, goTo, close, finish, render, groupList, openBlock, now: () => ctx.now()};
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
  const foot = footer(api, api.finish);
  root.replaceChildren(topBar(api), progressBar(ui.step, api.goTo), body, foot);
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
  const {ui} = api, step = ui.step;
  if (step === 3 && ui.selected.length && !ui.chunk) return selectionBar(api);
  const bar = el('header', 'wr-bar');
  bar.append(iconButton('close', 'Close review', api.close), el('h1', 'wr-bar-title', 'Weekly review'));
  const count = el('span', 'wr-bar-count tnum', `${step} of ${REVIEW_STEPS}`);
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

/**
 * Every step can be skipped, so Next and Finish are never disabled. Until the step's job is done the
 * button is tonal and a short line says what is left; it turns filled once the step is complete.
 */
function stepGuide(api) {
  const {ui} = api;
  if (ui.step === 1) {
    const left = reviewSummary(api.data(), api.week).results.filter(r => !r.verdict).length;
    return left ? `${plural(left, 'Result')} still to decide. You can come back to ${left === 1 ? 'it' : 'them'}.` : '';
  }
  if (ui.step === REVIEW_STEPS && ui.focus.length < AIM) {
    const more = AIM - ui.focus.length;
    return ui.focus.length ? `Pick ${more} more for a full week, or finish with fewer.` : 'Pick 3 to 5 Results, or finish without.';
  }
  return '';
}

function footer(api, finish) {
  const {ui} = api;
  const foot = el('footer', 'wr-foot');
  const guide = stepGuide(api);
  if (guide) foot.append(el('p', 'wr-foot-hint', guide));
  if (ui.step > 1) foot.append(button('Back', () => api.goTo(ui.step - 1), 'wr-btn-text wr-back', 'arrow_back'));
  const last = ui.step === REVIEW_STEPS;
  const label = last ? finishLabel(ui.focus.length) : STEPS[ui.step - 1].next;
  const next = button('', last ? finish : () => api.goTo(ui.step + 1), 'wr-btn-filled wr-next' + (guide ? ' soft' : ''));
  const short = last ? 'Finish' : 'Next';
  next.append(el('span', 'wr-label wr-long', label), el('span', 'wr-label wr-short', short), icon(last ? 'check' : 'arrow_forward'));
  next.setAttribute('aria-label', label);
  foot.append(next);
  return foot;
}
function finishLabel(n) {
  if (!n) return 'Finish review';
  return `Finish with ${plural(n, 'Result')}`;
}

function heading(title, sub) {
  const h = el('h2', 'wr-title', title);
  h.tabIndex = -1;
  return [h, el('p', 'wr-sub', sub)];
}

function stepContent(api, ctx) {
  const parts = [stepOne, stepTwo, stepThree, stepFour][api.ui.step - 1](api, ctx);
  for (const message of [api.ui.step < REVIEW_STEPS ? api.ui.focusHint : '', api.ui.hint]) {
    if (!message) continue;
    const hint = el('p', 'wr-error', message);
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
  const summary = reviewSummary(api.data(), api.week);
  const n = summary.results.length;
  const sub = n
    ? `${weekLabel(summary.lastWeek)}. Ticking every task doesn't mean the Result happened, so decide for each.`
    : `${weekLabel(summary.lastWeek)}.`;
  const parts = heading("How did last week's Results go?", sub);
  if (!n) {
    const body = "Once you choose this week's Results in step 4, next week's review starts here.";
    parts.push(emptyState('history', 'Nothing to look back on yet', body));
    return parts;
  }
  const decided = summary.results.filter(r => r.verdict).length;
  const wins = summary.results.filter(r => r.verdict === 'achieved');
  const tally = el('p', 'wr-tally tnum');
  tally.setAttribute('aria-live', 'polite');
  tally.append(el('span', '', decided === n ? `All ${n} decided` : `${decided} of ${n} decided`));
  if (wins.length) {
    const won = el('span', 'wr-tally-win');
    won.append(icon('emoji_events', true), el('span', '', plural(wins.length, 'win')));
    tally.append(won);
  }
  parts.push(tally);
  for (const result of summary.results) parts.push(resultCard(api, summary, result));
  if (wins.length) parts.push(winsCard(wins));
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
  if (result.verdict === 'partly' || result.verdict === 'notyet') card.append(carryResult(api, result), leftoverList(api, result));
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

function verdictControl(api, summary, result) {
  const group = el('div', 'wr-chips wr-verdicts');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', `Did "${result.title}" happen?`);
  for (const [value, label] of VERDICTS) {
    const selected = result.verdict === value;
    const option = button('', () => {
      if (selected) return;
      const achieved = value === 'achieved';
      api.run(d => markAchieved(d, result.blockId, {achieved, week: summary.lastWeek, verdict: value}), VERDICT_RECEIPTS[value]);
    }, 'wr-chip' + (selected ? ' sel' : '') + (selected && value === 'achieved' ? ' win' : ''));
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

/** A Result that is still live can go straight into this week: it is pre-picked in step 4 (a draft, not plan data). */
function carryResult(api, result) {
  const on = api.ui.focus.includes(result.blockId);
  const row = el('div', 'wr-carry');
  const chip = button(on ? "In this week's Results" : 'Carry into this week', () => toggleFocus(api, result.blockId),
    'wr-chip' + (on ? ' sel' : ''), on ? 'check' : 'redo');
  chip.setAttribute('aria-pressed', String(on));
  chip.dataset.key = 'carry:' + result.blockId;
  row.append(chip);
  if (on) row.append(el('span', 'wr-carry-note', 'Picked for step 4'));
  return row;
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
  const chips = el('div', 'wr-chips');
  chips.setAttribute('role', 'radiogroup');
  chips.setAttribute('aria-label', `What to do with "${task.title}"`);
  for (const [value, label] of CHOICES) {
    const selected = current === value;
    const chip = button(label, () => {
      if (!selected) api.run(d => decideLeftover(d, task.id, value, api.week), decisionLabel(value));
    }, 'wr-chip' + (selected ? ' sel' : ''));
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(selected));
    chip.dataset.key = `left:${task.id}:${value}`;
    chips.append(chip);
  }
  row.append(chips);
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
  const parts = heading('Empty your head', 'Get every idea, want and to-do out, in your own words. Sorting comes next.');
  parts.push(quickAdd(api));
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
      if (when) meta.append(el('span', when.overdue ? 'overdue' : when.soon ? 'soon' : '', when.text));
      if (task.must) {
        const must = el('span', 'wr-must-tag');
        must.append(icon('star', true), el('span', '', 'Must'));
        meta.append(must);
      }
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
  input.placeholder = 'Add a task to the Inbox';
  input.value = ui.draft;
  input.enterKeyHint = 'enter';
  input.dataset.key = 'quick-add';
  input.setAttribute('aria-label', 'New Inbox task');
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

/* ---------- step 3: group into Blocks ---------- */
function stepThree(api, ctx) {
  const {ui} = api;
  const rows = api.groupList();
  const loose = rows.filter(t => (t.blockId ?? null) === null);
  ui.selected = ui.selected.filter(id => loose.some(t => t.id === id));
  if (!ui.selected.length) ui.chunk = false;
  const parts = heading('Group into Blocks', 'Select tasks that serve one Result, then add them to it or start a new one. Errands can stay in the Inbox.');
  if (ctx.sortInbox && loose.length) {
    parts.push(button('Sort with Jev', () => ctx.sortInbox(), 'wr-btn-outlined wr-sort', 'auto_awesome'));
  }
  if (!rows.length) {
    parts.push(emptyState('done_all', 'Nothing to group', 'Your Inbox is empty, so every task already has a home.'));
    return parts;
  }
  const targets = focusCandidates(api.data(), api.week, weekFocus(api.data(), api.week));
  const now = api.now();

  parts.push(sectionHead('Inbox', loose.length));
  if (loose.length) {
    const list = el('ul', 'wr-list wr-group-list');
    list.setAttribute('aria-label', 'Inbox tasks to group');
    for (const task of loose) list.append(...taskRow(api, task, targets, false));
    parts.push(list);
  } else parts.push(el('p', 'wr-quiet', 'Inbox is clear. Every task here has a Result.'));
  if (ui.chunk) parts.push(chunkForm(api, loose.filter(t => ui.selected.includes(t.id))));

  const picking = ui.selected.length > 0 && !ui.chunk;
  parts.push(sectionHead('Your Results', null));
  if (picking) parts.push(el('p', 'wr-section-note', `Tap a Result below to add ${ui.selected.length === 1 ? 'the selected task' : `the ${ui.selected.length} selected tasks`}, or start a New Result.`));
  const list = el('ul', 'wr-list wr-targets');
  list.setAttribute('aria-label', 'Your Results');
  for (const c of targets) {
    list.append(targetRow(api, c, picking, now));
    for (const task of rows.filter(t => t.blockId === c.blockId)) list.append(...taskRow(api, task, targets, true));
  }
  parts.push(list);
  return parts;
}

/** One line per task: a checkbox to select it for grouping (Inbox only) and a small Move chip. */
function taskRow(api, task, targets, grouped) {
  const {ui} = api;
  const item = el('li', 'wr-row' + (grouped ? ' sub' : ''));
  const name = task.title ?? task.raw;
  if (grouped) {
    item.append(icon('subdirectory_arrow_right'), el('span', 'wr-row-title', name));
  } else {
    const on = ui.selected.includes(task.id);
    const check = button('', () => {
      ui.selected = on ? ui.selected.filter(id => id !== task.id) : [...ui.selected, task.id];
      ui.pickerFor = null;
      api.render();
    }, 'wr-row-check' + (on ? ' on' : ''));
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(on));
    check.dataset.key = 'check:' + task.id;
    check.append(icon(on ? 'check_box' : 'check_box_outline_blank', on), el('span', 'wr-row-title', name));
    item.append(check);
  }
  const open = ui.pickerFor === task.id;
  const move = iconButton(open ? 'expand_less' : 'drive_file_move', `Move "${name}" to a Result or the Inbox`, () => {
    ui.pickerFor = open ? null : task.id;
    ui.chunk = false;
    api.render();
  }, 'wr-icon-btn wr-move' + (open ? ' on' : ''));
  move.setAttribute('aria-expanded', String(open));
  move.dataset.key = 'move:' + task.id;
  item.append(move);
  if (!open) return [item];
  const picker = el('li', 'wr-row-picker');
  picker.append(blockPicker(api, task, targets));
  return [item, picker];
}

function targetRow(api, c, picking, now) {
  const {ui} = api;
  const row = el('li', 'wr-target');
  const body = el(picking ? 'button' : 'div', 'wr-target-body');
  const text = el('span', 'wr-target-text');
  text.append(el('span', 'wr-target-title', c.title));
  if (c.purpose) text.append(el('span', 'wr-target-purpose', c.purpose));
  const meta = el('span', 'wr-target-meta tnum');
  const open = c.total - c.done;
  meta.append(el('span', '', open ? plural(open, 'open task') : 'No open tasks'));
  const chip = c.due && dueChip(c.due, now);
  if (chip) meta.append(chip);
  text.append(meta);
  body.append(text);
  if (picking) {
    body.type = 'button';
    body.dataset.key = 'target:' + c.blockId;
    body.setAttribute('aria-label', `Add ${plural(ui.selected.length, 'task')} to ${c.title}`);
    const add = el('span', 'wr-add-here');
    add.append(icon('add'), el('span', '', 'Add'));
    body.append(add);
    body.addEventListener('click', () => {
      const ids = ui.selected;
      ui.selected = [];
      api.run(d => groupTasks(d, ids, c.blockId), ids.length === 1 ? 'Added to ' + c.title : `${ids.length} tasks added to ${c.title}`);
    });
  }
  row.append(body);
  return row;
}

/** While tasks are selected the top bar becomes a selection bar (as in Gmail): Clear, how many, and New Result. */
function selectionBar(api) {
  const {ui} = api;
  const bar = el('header', 'wr-bar wr-selbar');
  const clear = iconButton('close', 'Clear selection', () => { ui.selected = []; api.render(); });
  const count = el('h1', 'wr-bar-title tnum', `${ui.selected.length} selected`);
  count.setAttribute('aria-live', 'polite');
  const fresh = button('New Result', () => openChunk(api), 'wr-btn-tonal', 'add');
  fresh.dataset.key = 'chunk';
  fresh.setAttribute('aria-label', `New Result from ${plural(ui.selected.length, 'selected task')}`);
  bar.append(clear, count, fresh);
  return bar;
}

function openChunk(api) {
  api.ui.chunk = true;
  api.ui.pickerFor = null;
  api.ui.newBlock = {title: '', purpose: ''};
  api.render();
  const field = document.querySelector('.wr-new input');
  field?.focus({preventScroll: true});
  field?.closest('.wr-new')?.scrollIntoView({block: 'nearest'});
}

/** Inline single-choice list (no overlay, so Back and TalkBack stay simple). */
function blockPicker(api, task, targets) {
  const {ui} = api;
  const current = task.blockId ?? null;
  const list = el('div', 'wr-picker');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', `Block for "${task.title}"`);
  const choose = (target, label) => {
    ui.pickerFor = null;
    if (target === current) return api.render();
    ui.selected = ui.selected.filter(id => id !== task.id);
    api.run(d => groupTasks(d, [task.id], target), label);
  };
  list.append(pickerOption('Leave in Inbox', 'Standalone errands can stay here', !current, () => choose(null, 'Moved to Inbox'), `pick:${task.id}:inbox`));
  for (const c of targets) {
    list.append(pickerOption(c.title, c.purpose, current === c.blockId, () => choose(c.blockId, 'Added to ' + c.title), `pick:${task.id}:${c.blockId}`));
  }
  const add = button('New Result', () => {
    ui.selected = [task.id];
    openChunk(api);
  }, 'wr-picker-add', 'add');
  add.dataset.key = 'new:' + task.id;
  list.append(add);
  return list;
}

function pickerOption(label, detail, selected, onClick, key) {
  const option = el('button', 'wr-option' + (selected ? ' sel' : ''));
  option.type = 'button';
  option.dataset.key = key;
  option.setAttribute('role', 'radio');
  option.setAttribute('aria-checked', String(selected));
  option.append(icon(selected ? 'radio_button_checked' : 'radio_button_unchecked', selected));
  const text = el('span', 'wr-option-text');
  text.append(el('span', 'wr-option-label', label));
  if (detail) text.append(el('span', 'wr-option-detail', detail));
  option.append(text);
  option.addEventListener('click', onClick);
  return option;
}

/** RPM chunking: the selected tasks become one new Block with its Result and its Purpose, in one undoable change. */
function chunkForm(api, chosen) {
  const {ui} = api;
  const form = el('form', 'wr-card wr-new');
  form.noValidate = true;
  form.append(el('h3', 'wr-card-title', `New Result from ${plural(chosen.length, 'task')}`));
  form.append(el('p', 'wr-card-purpose', chosen.map(t => t.title ?? t.raw).join(' · ')));
  const result = textField("What's the Result?", 'What will be true when it is done', ui.newBlock.title, 'chunk:title', v => { ui.newBlock.title = v; sync(); });
  const purpose = textField('Why does it matter?', 'The Purpose that keeps you going', ui.newBlock.purpose, 'chunk:purpose', v => { ui.newBlock.purpose = v; sync(); });
  const actions = el('div', 'wr-new-actions');
  const cancel = button('Cancel', () => { ui.chunk = false; api.render(); }, 'wr-btn-text');
  const create = el('button', 'wr-btn-tonal');
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
    Object.assign(ui, {chunk: false, selected: []});
    api.run(d => groupTasks(d, ids, fields), 'New Result: ' + fields.title);
  });
  form.append(result, purpose, actions);
  return form;
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
  const data = api.data();
  const now = api.now();
  ui.focusBase ??= [...ui.focus];
  const candidates = focusCandidates(data, api.week, ui.focusBase);
  ui.focus = ui.focus.filter(id => candidates.some(c => c.blockId === id));
  const parts = heading("Pick this week's Results", 'Choose 3 to 5. The nearest deadlines come first.');
  if (!candidates.length) {
    parts.push(emptyState('stacks', 'No Blocks yet', 'Go back a step to group tasks into a new Block, then choose it here.'));
    return parts;
  }
  parts.push(weekSummary(candidates.filter(c => ui.focus.includes(c.blockId)), ui, now));
  for (const c of candidates) parts.push(focusCard(api, c, now));
  return parts;
}

/**
 * What the picked Results ask of the week: Must and planned time, and how much Must work has to happen
 * before each deadline. There is no calendar here, so it never claims the time fits.
 */
function weekSummary(chosen, ui, now) {
  const box = el('div', 'wr-summary');
  box.setAttribute('aria-live', 'polite');
  const n = chosen.length;
  const head = el('p', 'wr-summary-head');
  head.append(el('span', 'wr-summary-count tnum', `${n} picked`), el('span', 'wr-summary-aim', ' · aim for 3–5'));
  box.append(head);
  if (!n) {
    box.append(el('p', 'wr-summary-line', 'Tap a Result to pick it. Its Must time and deadline add up here.'));
  } else {
    const must = chosen.reduce((s, c) => s + c.mustMinutes, 0);
    const planned = chosen.reduce((s, c) => s + c.plannedMinutes, 0);
    box.append(el('p', 'wr-summary-line tnum', `Must ${formatMinutes(must)} · Planned ${formatMinutes(planned)}`));
    const dated = chosen.filter(c => c.due).map(c => ({c, info: dueInfo(c.due, now)})).sort((a, b) => a.info.at - b.info.at);
    const ladder = el('ul', 'wr-ladder');
    let sum = 0;
    for (const [i, {c, info}] of dated.entries()) {
      sum += c.mustMinutes;
      if (dated[i + 1] && dated[i + 1].info.at - info.at < 6 * 36e5) continue; // same evening: one line
      const item = el('li', info.overdue ? 'overdue' : info.soon ? 'soon' : '');
      item.append(icon(info.overdue ? 'error' : 'event'), el('span', 'wr-ladder-when', info.label),
        el('span', 'wr-ladder-must tnum', `${formatMinutes(sum)} Must by then`));
      ladder.append(item);
      if (ladder.children.length === 3) break;
    }
    if (ladder.children.length) box.append(ladder, el('p', 'wr-summary-note', 'From your Must estimates. Your calendar is not checked.'));
  }
  if (ui.focusHint) box.append(el('p', 'wr-summary-note', ui.focusHint));
  return box;
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
  const tags = el('span', 'wr-tags');
  const chip = c.due && dueChip(c.due, now);
  if (chip) tags.append(chip);
  if (info && (info.soon || info.overdue) && open && !c.mustMinutes) {
    const warn = el('span', 'wr-warn');
    warn.append(icon('star'), el('span', '', 'No Must set'));
    tags.append(warn);
  }
  if (c.carried) tags.append(el('span', 'wr-tag', 'Carried over'));
  if (tags.children.length) text.append(tags);
  const must = c.mustMinutes ? `Must ${formatMinutes(c.mustMinutes)}` : 'No Must yet';
  const meta = !c.total ? 'No tasks yet'
    : open ? `${must} · Planned ${formatMinutes(c.plannedMinutes)} · ${c.done} of ${c.total} done` : `All ${c.total} tasks done`;
  text.append(el('span', 'wr-card-meta tnum', meta));
  head.append(text);
  head.addEventListener('click', () => toggleFocus(api, c.blockId));
  card.append(head);
  if (selected) card.append(mustList(api, c.blockId, now));
  return card;
}

function toggleFocus(api, blockId) {
  const {ui} = api;
  ui.focusHint = '';
  if (ui.focus.includes(blockId)) ui.focus = ui.focus.filter(id => id !== blockId);
  else if (ui.focus.length >= MAX_FOCUS) ui.focusHint = 'Five is the most for one week. Unpick one to swap it.';
  else ui.focus = [...ui.focus, blockId];
  api.render();
  api.run(d => saveReviewProgress(d, api.week, {focusDraft: ui.focus}), null);
}

function mustList(api, blockId, now) {
  const open = blockTasks(api.data(), blockId).filter(t => !t.done);
  const box = el('div', 'wr-musts');
  if (!open.length) {
    box.append(el('p', 'wr-card-note', 'No open tasks. Add the next step from the Block.'));
  } else box.append(el('p', 'wr-musts-head', 'Star the tasks that must happen'));
  for (const task of open) {
    const row = el('div', 'wr-must-row');
    const label = task.must ? 'Must. Tap to unmark' : 'Mark as Must';
    const toggle = () => api.run(d => setMust(d, task.id, !task.must), task.must ? 'No longer a Must' : 'Marked Must');
    const star = iconButton('star', `${label}: ${task.title}`, toggle, 'wr-icon-btn wr-star' + (task.must ? ' on' : ''));
    star.setAttribute('aria-pressed', String(!!task.must));
    star.dataset.key = 'must:' + task.id;
    if (task.must) star.querySelector('.ms').classList.add('fill');
    const text = el('span', 'wr-must-text');
    text.append(el('span', 'wr-must-title', task.title ?? task.raw));
    const when = whenText(task, now);
    const minutes = task.minutes == null ? 'No time' : formatMinutes(task.minutes);
    text.append(el('span', 'wr-must-min tnum' + (when?.overdue ? ' overdue' : ''), when ? `${when.text} · ${minutes}` : minutes));
    row.append(star, text);
    box.append(row);
  }
  box.append(button('Open Block', () => api.openBlock(blockId), 'wr-btn-text wr-open-block', 'open_in_new'));
  return box;
}
