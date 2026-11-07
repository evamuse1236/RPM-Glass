import {focusCandidates, rankResults} from './review-state.mjs';
import {planner} from './planner-state.mjs';
import {dueInfo} from './planner/format.mjs';
import {el, icon, button, iconButton, heading, emptyState, sectionHead, textField} from './review-ui.mjs';
import {attachSwipe} from './task-swipe.mjs';

/* ---------- step 3: sort the Inbox into Results ---------- */
export function stepThree(api, ctx) {
  const {ui} = api;
  const rows = api.groupList();
  const clashes = api.clashes().filter(c => c.task && (c.task.blockId ?? null) === null);
  const clashIds = new Set(clashes.map(c => c.task.id));
  const loose = rows.filter(t => (t.blockId ?? null) === null && !clashIds.has(t.id));
  const toSort = loose.filter(t => !ui.kept.includes(t.id));
  const kept = loose.filter(t => ui.kept.includes(t.id));
  if (ui.sheet && !loose.some(t => t.id === ui.sheet.taskId)) ui.sheet = null;
  const parts = heading('Sort the Inbox');
  if (!rows.length) {
    parts.push(emptyState('done_all', 'Nothing to sort', 'Your Inbox is empty, so every task already has a Result.'));
    return parts;
  }
  const jev = ctx.sortInbox && toSort.length ? button('Ask Jev', () => ctx.sortInbox(), 'wr-btn-text', 'auto_awesome') : null;
  parts.push(sectionHead('To sort', toSort.length + clashes.length, jev));
  if (toSort.length || clashes.length) {
    const candidates = focusCandidates(api.data(), api.week, []);
    const list = el('ul', 'wr-list wr-sort-list');
    list.setAttribute('aria-label', 'Inbox tasks to sort');
    for (const task of toSort) list.append(sortRow(api, task, rankResults(api.data(), task, candidates).suggested));
    for (const clash of clashes) list.append(clashSortRow(api, clash));
    parts.push(list);
  } else parts.push(el('p', 'wr-quiet', 'All sorted. Every task has a Result or stays in the Inbox on purpose.'));

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

/** One Inbox task as one control: its words, the suggested Result under them when there is one, and a tap that opens
 * the chooser. A swipe right takes the suggestion, a swipe left keeps the task in the Inbox. */
function sortRow(api, task, suggested) {
  const {ui} = api;
  const name = task.title ?? task.raw;
  const item = el('li', 'wr-sort');
  const row = el('button', 'wr-sort-row');
  row.type = 'button';
  const text = el('span', 'wr-sort-text');
  text.append(el('span', 'wr-row-title', name));
  if (suggested) {
    const proposal = el('span', 'wr-sort-proposal');
    proposal.append(icon('stacks'), el('span', 'wr-sort-label', suggested.title));
    text.append(proposal);
  }
  row.append(text);
  row.setAttribute('aria-label', `Choose a Result for "${name}"`);
  if (suggested) row.setAttribute('aria-description', 'Suggested: ' + suggested.title);
  row.setAttribute('aria-haspopup', 'dialog');
  row.dataset.key = 'choose:' + task.id;
  row.addEventListener('click', () => {
    Object.assign(ui, {sheet: {kind: 'add', taskId: task.id}});
    api.render();
    document.querySelector('.wr-sheet .wr-sheet-title')?.focus({preventScroll: true});
  });
  item.append(row);
  attachSwipe(item, {
    right: suggested && {kind: 'done', symbol: 'stacks', word: 'Add to Result',
      run: () => api.run({type: 'groupTasks', ids: [task.id], blockId: suggested.blockId}, 'Added to ' + suggested.title)},
    left: {kind: 'schedule', symbol: 'inbox', word: 'Keep in Inbox', run: () => keep(api, task.id, true)},
  });
  return item;
}

/** An Inbox task that clashes with the calendar: marked, and decided with the other clashes in step 4. */
function clashSortRow(api, clash) {
  const name = clash.task.title ?? clash.task.raw;
  const item = el('li', 'wr-sort wr-sort-clash');
  const row = el('button', 'wr-sort-row');
  row.type = 'button';
  const text = el('span', 'wr-sort-text');
  const note = el('span', 'wr-sort-proposal');
  note.append(el('span', 'wr-sort-label', 'Calendar clash · decided in step 4'));
  text.append(el('span', 'wr-row-title', name), note);
  row.append(icon('event_busy'), text, icon('chevron_right'));
  row.setAttribute('aria-label', `"${name}" clashes with your calendar. Decide it in step 4`);
  row.dataset.key = 'clash-task:' + clash.task.id;
  row.addEventListener('click', () => api.goTo(4));
  item.append(row);
  return item;
}

function groupedRow(api, task, kept = false) {
  const item = el('li', 'wr-row sub');
  const name = task.title ?? task.raw;
  item.append(icon(kept ? 'inbox' : 'subdirectory_arrow_right'), el('span', 'wr-row-title', name));
  const back = kept
    ? iconButton('undo', `Sort "${name}" after all`, () => keep(api, task.id, false), 'wr-icon-btn wr-unmove')
    : iconButton('close', `Move "${name}" back to the Inbox`, () => api.run({type: 'groupTasks', ids: [task.id], blockId: null}, 'Moved to Inbox'), 'wr-icon-btn wr-unmove');
  back.dataset.key = 'unmove:' + task.id;
  item.append(back);
  return item;
}

/** A bottom sheet over the step: choose the task's Result, or name a new one with its Purpose. */
export function sheetLayer(api) {
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
  const {ranked, suggested} = rankResults(api.data(), task, focusCandidates(api.data(), api.week, []));
  for (const c of ranked) {
    const option = el('button', 'wr-option' + (c.blockId === suggested?.blockId ? ' wr-option-suggested' : ''));
    option.type = 'button';
    option.dataset.key = 'sheet:' + c.blockId;
    const text = el('span', 'wr-option-text');
    const info = c.due && dueInfo(c.due, now);
    const detail = [info?.label ?? 'No deadline', areaOf(c.blockId)].filter(Boolean).join(' · ');
    text.append(el('span', 'wr-option-label', c.title), el('span', 'wr-option-detail' + (info?.overdue ? ' overdue' : ''), detail));
    option.append(icon('stacks'), text);
    option.addEventListener('click', () => {
      ui.sheet = null;
      api.run({type: 'groupTasks', ids: [task.id], blockId: c.blockId}, 'Added to ' + c.title);
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
    api.run({type: 'groupTasks', ids: [task.id], newBlock: fields}, 'New Result: ' + fields.title);
  });
  form.append(result, purpose, actions);
  return [sheetTitle('New Result'), el('p', 'wr-sheet-sub', task.title ?? task.raw), form];
}
