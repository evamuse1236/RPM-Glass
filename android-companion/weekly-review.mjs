// Weekly review: last week's Results → capture → group into Blocks → this week's Results.
// Renders into the container the planner gives it and talks to the app only through `ctx`
// (getData, commit, close, openBlock, openCapture, now, day; optional sortInbox).
// Plan changes go through ctx.commit with a label, so they save, re-render and offer Undo.
// Review progress (step, draft choice of Results) is saved with ctx.commit(mutator, null):
// a null label means "save quietly"; it changes no plan data and keeps the last Undo intact.
import {
  REVIEW_STEPS, reviewWeek, reviewSummary, markAchieved, decideLeftover, leftoverChoice, inboxTasks,
  groupTask, setMust, focusCandidates, weekFocus, reviewProgress, saveReviewProgress, finishReview,
} from './review-state.mjs';
import {planner, blockTasks} from './planner-state.mjs';

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
  node.addEventListener('click', onClick);
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

/* ---------- mount ---------- */
export function mountWeeklyReview(container, ctx) {
  const week = reviewWeek(ctx.day());
  const saved = reviewProgress(ctx.getData(), week);
  const ui = {
    step: saved.step,
    focus: saved.focusDraft ?? weekFocus(ctx.getData(), week),
    focusHint: '',
    inboxIds: saved.inboxIds,
    newBlockFor: null,
    pickerFor: null,
    newBlock: {title: '', purpose: ''},
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
    /** Android Back: closes an open inline picker or form first; returns true when it handled the press. */
    back() {
      if (ui.newBlockFor == null && ui.pickerFor == null) return false;
      ui.newBlockFor = null;
      ui.pickerFor = null;
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
    Object.assign(ui, {inboxIds: groupList().map(t => t.id), step, newBlockFor: null, pickerFor: null, hint: '', focusHint: '', stepChanged: true});
    render();
    saveProgress({finishedAt: null});
  }
  async function close() {
    await saveProgress();
    ctx.close();
  }
  async function finish() {
    ui.hint = '';
    const ids = ui.focus.filter(id => planner(data()).blocks.some(b => b.id === id));
    await run(d => finishReview(d, week, ids, ctx.now()), ids.length ? `${plural(ids.length, 'Result')} for this week` : 'Weekly review finished');
    if (!ui.hint) ctx.close();
  }
  async function openBlock(blockId) {
    await saveProgress();
    ctx.openBlock(blockId);
  }
  return {data, week, ui, run, goTo, close, finish, render, groupList, openBlock};
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
  root.replaceChildren(topBar(ui.step, api.close), progressBar(ui.step, api.goTo), body, footer(api, api.finish));
  body.scrollTop = keepScroll;
  if (ui.stepChanged) {
    ui.stepChanged = false;
    root.querySelector('.wr-title')?.focus({preventScroll: true});
  } else if (active) {
    root.querySelector(`[data-key="${CSS.escape(active)}"]`)?.focus({preventScroll: true});
  }
}

/* ---------- frame: top bar, progress, footer ---------- */
function topBar(step, onClose) {
  const bar = el('header', 'wr-bar');
  bar.append(iconButton('close', 'Close review', onClose), el('h1', 'wr-bar-title', 'Weekly review'));
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

function footer(api, finish) {
  const {ui} = api;
  const foot = el('footer', 'wr-foot');
  if (ui.step > 1) foot.append(button('Back', () => api.goTo(ui.step - 1), 'wr-btn-text wr-back', 'arrow_back'));
  const last = ui.step === REVIEW_STEPS;
  const label = last ? finishLabel(ui.focus.length) : STEPS[ui.step - 1].next;
  const next = button('', last ? finish : () => api.goTo(ui.step + 1), 'wr-btn-filled wr-next');
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

/* ---------- step 1: last week's Results ---------- */
function stepOne(api) {
  const summary = reviewSummary(api.data(), api.week);
  const sub = summary.results.length
    ? `${weekLabel(summary.lastWeek)}. Ticking every task doesn't mean the Result happened, so decide for each.`
    : `${weekLabel(summary.lastWeek)}.`;
  const parts = heading("How did last week's Results go?", sub);
  if (!summary.results.length) {
    const body = "Once you choose this week's Results in step 4, next week's review starts here.";
    parts.push(emptyState('history', 'Nothing to look back on yet', body));
    return parts;
  }
  for (const result of summary.results) parts.push(resultCard(api, summary, result));
  const wins = summary.results.filter(r => r.verdict === 'achieved').length;
  if (wins) parts.push(celebrate(wins));
  return parts;
}

function resultCard(api, summary, result) {
  const card = el('article', 'wr-card');
  card.append(el('h3', 'wr-card-title', result.title));
  if (result.purpose) card.append(el('p', 'wr-card-purpose', result.purpose));
  card.append(el('p', 'wr-card-meta tnum', `${result.done} of ${plural(result.total, 'task')} done`));
  card.append(verdictControl(api, summary, result));
  if (result.verdict === 'achieved') card.append(evidenceField(api, summary, result));
  if (result.verdict === 'partly' || result.verdict === 'notyet') card.append(leftoverList(api, result));
  else if (result.verdict === 'achieved' && result.leftovers.length) {
    card.append(el('p', 'wr-card-note', `${plural(result.leftovers.length, 'open task')} stay in this Block.`));
  }
  return card;
}

function verdictControl(api, summary, result) {
  const group = el('div', 'wr-seg');
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
  wrap.append(el('span', 'wr-field-label', 'How do you know? (optional)'));
  const input = el('input', 'wr-input');
  input.type = 'text';
  input.maxLength = 300;
  input.value = result.evidence;
  input.placeholder = 'One line of evidence';
  input.enterKeyHint = 'done';
  const save = () => {
    const evidence = input.value.trim();
    if (evidence === result.evidence) return;
    api.run(d => markAchieved(d, result.blockId, {achieved: true, evidence, week: summary.lastWeek}), 'Evidence saved');
  };
  input.addEventListener('change', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  wrap.append(input);
  return wrap;
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

function celebrate(wins) {
  const box = el('div', 'wr-celebrate');
  box.setAttribute('role', 'status');
  box.append(icon('celebration'));
  const line = wins === 1 ? 'You achieved a Result last week.' : `You achieved ${wins} Results last week.`;
  box.append(el('p', '', `${line} Take a moment to enjoy that before planning more.`));
  return box;
}

/* ---------- step 2: capture ---------- */
function stepTwo(api, ctx) {
  const inbox = inboxTasks(api.data());
  const parts = heading('Empty your head', 'Get every idea, want and to-do out, in your own words. Sorting comes next.');
  const hero = el('div', 'wr-hero');
  const count = el('div', 'wr-hero-count');
  const unit = inbox.length === 1 ? 'task in Inbox' : 'tasks in Inbox';
  count.append(el('span', 'wr-hero-number tnum', String(inbox.length)), el('span', 'wr-hero-unit', unit));
  hero.append(count, button('Open Capture', () => ctx.openCapture(), 'wr-btn-tonal', 'edit_note'));
  parts.push(hero);
  if (!inbox.length) {
    parts.push(emptyState('inbox', 'Inbox is empty', 'Open Capture if anything is still on your mind.'));
    return parts;
  }
  const list = el('ul', 'wr-list');
  list.setAttribute('aria-label', 'Inbox');
  for (const task of inbox) {
    const item = el('li', 'wr-list-item');
    item.append(el('span', 'wr-list-title', task.title ?? task.raw));
    list.append(item);
  }
  parts.push(el('h3', 'wr-section', 'In your Inbox'), list);
  return parts;
}

/* ---------- step 3: group into Blocks ---------- */
function activeBlocks(data, week) {
  const focus = new Set(weekFocus(data, week));
  return planner(data).blocks
    .filter(b => !b.archived && b.achieved !== true)
    .map((b, i) => ({b, i}))
    .sort((x, y) => Number(focus.has(y.b.id)) - Number(focus.has(x.b.id)) || y.i - x.i)
    .map(x => x.b);
}

function stepThree(api, ctx) {
  const rows = api.groupList();
  const parts = heading('Group into Blocks', 'Put each task under the Result it serves. Standalone errands can stay in the Inbox.');
  if (ctx.sortInbox && rows.some(t => t.blockId == null)) {
    parts.push(button('Sort with Jev', () => ctx.sortInbox(), 'wr-btn-outlined wr-sort', 'auto_awesome'));
  }
  if (!rows.length) {
    parts.push(emptyState('done_all', 'Nothing to group', 'Your Inbox is empty, so every task already has a home.'));
    return parts;
  }
  const blocks = activeBlocks(api.data(), api.week);
  for (const task of rows) parts.push(groupCard(api, task, blocks));
  return parts;
}

function groupCard(api, task, blocks) {
  const {ui} = api;
  const current = task.blockId ?? null;
  const currentBlock = current ? planner(api.data()).blocks.find(b => b.id === current) : null;
  const open = ui.pickerFor === task.id;
  const card = el('article', 'wr-card wr-group');
  card.append(el('h3', 'wr-card-title', task.title ?? task.raw));

  const select = el('button', 'wr-select' + (currentBlock ? ' set' : ''));
  select.type = 'button';
  select.dataset.key = 'select:' + task.id;
  select.setAttribute('aria-expanded', String(open));
  select.setAttribute('aria-label', `Block for "${task.title}": ${currentBlock ? currentBlock.title : 'Inbox'}`);
  select.append(
    icon(currentBlock ? 'stacks' : 'inbox'),
    el('span', 'wr-label', currentBlock ? currentBlock.title : 'Inbox'),
    icon(open ? 'expand_less' : 'expand_more'),
  );
  select.addEventListener('click', () => {
    ui.pickerFor = open ? null : task.id;
    ui.newBlockFor = null;
    api.render();
  });
  card.append(select);
  if (open) card.append(blockPicker(api, task, blocks, currentBlock));
  if (ui.newBlockFor === task.id) card.append(newBlockForm(api, task));
  return card;
}

/** Inline single-choice list (no overlay, so Back and TalkBack stay simple). */
function blockPicker(api, task, blocks, currentBlock) {
  const {ui} = api;
  const list = el('div', 'wr-picker');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', `Block for "${task.title}"`);
  const options = currentBlock && !blocks.some(b => b.id === currentBlock.id) ? [currentBlock, ...blocks] : blocks;
  const choose = (target, label) => {
    ui.pickerFor = null;
    if ((target ?? null) === (currentBlock?.id ?? null)) return api.render();
    api.run(d => groupTask(d, task.id, target), label);
  };
  const inboxChoice = () => choose(null, 'Moved to Inbox');
  list.append(pickerOption('Leave in Inbox', 'Standalone errands can stay here', !currentBlock, inboxChoice, `pick:${task.id}:inbox`));
  for (const block of options) {
    const selected = currentBlock?.id === block.id;
    const onPick = () => choose(block.id, 'Added to ' + block.title);
    list.append(pickerOption(block.title, block.purpose, selected, onPick, `pick:${task.id}:${block.id}`));
  }
  const add = button('New Block', () => {
    ui.pickerFor = null;
    ui.newBlockFor = task.id;
    ui.newBlock = {title: '', purpose: ''};
    api.render();
    document.querySelector('.wr-new input')?.focus();
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

function newBlockForm(api, task) {
  const {ui} = api;
  const form = el('form', 'wr-new');
  form.noValidate = true;
  const result = textField('Result', 'What will be true when it is done', ui.newBlock.title, v => { ui.newBlock.title = v; sync(); });
  const purpose = textField('Purpose', 'Why it matters to you', ui.newBlock.purpose, v => { ui.newBlock.purpose = v; });
  const actions = el('div', 'wr-new-actions');
  const cancel = button('Cancel', () => { ui.newBlockFor = null; api.render(); }, 'wr-btn-text');
  const create = el('button', 'wr-btn-tonal');
  create.type = 'submit';
  create.textContent = 'Create and add';
  const sync = () => { create.disabled = !ui.newBlock.title.trim(); };
  sync();
  actions.append(cancel, create);
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!ui.newBlock.title.trim()) return;
    const fields = {title: ui.newBlock.title.trim(), purpose: ui.newBlock.purpose.trim()};
    ui.newBlockFor = null;
    api.run(d => groupTask(d, task.id, fields), 'New Block: ' + fields.title);
  });
  form.append(result, purpose, actions);
  return form;
}

function textField(label, placeholder, value, onInput) {
  const wrap = el('label', 'wr-field');
  wrap.append(el('span', 'wr-field-label', label));
  const input = el('input', 'wr-input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = placeholder;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input);
  return wrap;
}

/* ---------- step 4: this week's Results ---------- */
function stepFour(api) {
  const {ui} = api;
  const data = api.data();
  const candidates = focusCandidates(data, api.week, ui.focus);
  ui.focus = ui.focus.filter(id => candidates.some(c => c.blockId === id));
  const parts = heading("Pick this week's Results", 'Choose 3 to 5. Then check the Must time fits the week you really have.');
  parts.push(capacityCard(candidates.filter(c => ui.focus.includes(c.blockId)), ui));
  if (!candidates.length) {
    parts.push(emptyState('stacks', 'No Blocks yet', 'Go back a step to group tasks into a new Block, then choose it here.'));
    return parts;
  }
  for (const c of candidates) parts.push(focusCard(api, c));
  return parts;
}

function capacityCard(chosen, ui) {
  const box = el('div', 'wr-capacity');
  box.setAttribute('aria-live', 'polite');
  const must = chosen.reduce((s, c) => s + c.mustMinutes, 0);
  const planned = chosen.reduce((s, c) => s + c.plannedMinutes, 0);
  const stat = (value, label) => {
    const cell = el('div', 'wr-stat');
    cell.append(el('span', 'wr-stat-value tnum', value), el('span', 'wr-stat-label', label));
    return cell;
  };
  const stats = el('div', 'wr-stats');
  stats.append(stat(`${chosen.length} of ${MAX_FOCUS}`, 'Results'), stat(formatMinutes(must), 'Must time'), stat(formatMinutes(planned), 'Planned'));
  box.append(stats);
  if (ui.focusHint) box.append(el('p', 'wr-capacity-note', ui.focusHint));
  const pin = el('div', 'wr-capacity-pin');
  pin.append(box);
  return pin;
}

function focusCard(api, c) {
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
  const times = `Must ${formatMinutes(c.mustMinutes)} · Planned ${formatMinutes(c.plannedMinutes)}`;
  const meta = el('span', 'wr-card-meta tnum', `${times} · ${c.done} of ${c.total} done`);
  text.append(meta);
  if (c.carried) text.append(el('span', 'wr-tag', 'Carried over'));
  head.append(text);
  head.addEventListener('click', () => toggleFocus(api, c.blockId));
  card.append(head);
  if (selected) card.append(mustList(api, c.blockId));
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

function mustList(api, blockId) {
  const open = blockTasks(api.data(), blockId).filter(t => !t.done);
  const box = el('div', 'wr-musts');
  if (!open.length) {
    box.append(el('p', 'wr-card-note', 'No open tasks. Add the next step from the Block.'));
  }
  for (const task of open) {
    const row = el('div', 'wr-must-row');
    const label = task.must ? 'Must. Tap to unmark' : 'Mark as Must';
    const toggle = () => api.run(d => setMust(d, task.id, !task.must), task.must ? 'No longer a Must' : 'Marked Must');
    const star = iconButton('star', `${label}: ${task.title}`, toggle, 'wr-icon-btn wr-star' + (task.must ? ' on' : ''));
    star.setAttribute('aria-pressed', String(!!task.must));
    star.dataset.key = 'must:' + task.id;
    if (task.must) star.querySelector('.ms').classList.add('fill');
    row.append(star, el('span', 'wr-must-title', task.title ?? task.raw));
    row.append(el('span', 'wr-must-min tnum', task.minutes == null ? 'No time' : formatMinutes(task.minutes)));
    box.append(row);
  }
  box.append(button('Open Block', () => api.openBlock(blockId), 'wr-btn-text wr-open-block', 'open_in_new'));
  return box;
}
