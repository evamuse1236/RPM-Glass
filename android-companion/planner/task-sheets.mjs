/** Task detail, quick add / edit, and the task-level actions (move, order, archive, delete, restore). */
import {tasks, blockTasks, localDay, shiftDay, conflicts} from '../planner-state.mjs';
import {repeats, nextOccurrence, occurrences} from '../planner-recurrence.mjs';
import {calendarLabel, calendarRisk, calendarRows} from '../planner-calendar.mjs';
import {el, icon, button, iconButton, labelButton, emptyState} from './dom.mjs';
import {clock, duration, dateText, relativeDay, timeValue} from './format.mjs';
import {openSheet, field, select, rememberValue} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {taskRow, toggleDone} from './task-row.mjs';

const REPEAT_LABELS = {daily: 'Daily', weekdays: 'Every weekday', weekly: 'Weekly'};

const findTask = (app, id) => tasks(app.data()).find(task => task.id === id);

function repeatText(task) {
  if (task.repeatAfterDays) return `${task.repeatAfterDays} days after completion`;
  return REPEAT_LABELS[task.recurrence] ?? "Doesn't repeat";
}

function detailRow(symbol, text, onClick, {fill = false, cls = ''} = {}) {
  const row = button('', onClick, 'detail-row ' + cls);
  row.append(icon(symbol, {fill}), el('span', 'detail-text', text));
  return row;
}

function partOf(app, task) {
  const context = app.context(task);
  if (!context.block) {
    return detailRow('stacks', 'No block · Choose a Block', () => movePicker(app, task));
  }
  const panel = button('', () => app.openBlock(context.block.id), 'part-of');
  panel.dataset.tone = app.tone(context.area);
  panel.append(el('span', 'overline', 'Part of'), el('strong', 'part-result', context.block.title));
  panel.append(el('span', 'part-purpose', context.block.purpose || 'Add a Purpose to this Block'));
  const crumbs = [context.area?.title, context.project?.title].filter(Boolean).join(' › ');
  if (crumbs) panel.append(el('span', 'part-crumbs', crumbs));
  panel.setAttribute('aria-label', `Part of ${context.block.title}. Purpose: ${context.block.purpose || 'none yet'}. Open Block`);
  return panel;
}

function inlineText(app, body, symbol, label, value, onSave) {
  const wrap = el('label', 'detail-row detail-field');
  const input = el('textarea');
  input.rows = 1;
  input.placeholder = label;
  input.value = value ?? '';
  input.setAttribute('aria-label', label);
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  };
  input.addEventListener('input', grow);
  requestAnimationFrame(grow);
  input.addEventListener('change', () => onSave(input.value));
  wrap.append(icon(symbol), input);
  body.append(wrap);
  return input;
}

/** Task detail sheet: completion, editable title, schedule rows, Part of, notes. */
export function openTask(app, id, occurrence) {
  const task = findTask(app, id);
  if (!task) {
    app.notice('This task is no longer available.');
    return;
  }
  app.state.focusedTaskId = id;
  app.state.focusedBlockId = task.blockId ?? null;
  const when = occurrence ?? (repeats(task) ? nextOccurrence(task) : task.planned);
  const {body, actions, header} = openSheet(app, 'Task', {variant: 'detail'});
  const save = (fields, label = 'Task updated') =>
    app.commit({type: 'saveTask', id, fields}, {keepSheet: true, label}).catch(() => {});

  const more = iconButton('more_vert', 'More task options', () => openMenu(more, taskMenu(app, task)));
  header.querySelector('.sheet-close').before(more);

  const titleRow = el('div', 'detail-title-row');
  const check = button('', () => toggleDone(app, task, when), 'task-check large');
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(!!task.done));
  check.setAttribute('aria-label', `Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`);
  const ring = el('span', 'check-ring');
  if (task.done) ring.append(icon('check'));
  check.append(ring);
  const title = el('textarea', 'detail-title');
  title.rows = 1;
  title.value = task.title;
  title.setAttribute('aria-label', 'Task title');
  const grow = () => {
    title.style.height = 'auto';
    title.style.height = title.scrollHeight + 'px';
  };
  title.addEventListener('input', grow);
  requestAnimationFrame(grow);
  title.addEventListener('change', () => save({title: title.value}));
  titleRow.append(check, title);
  body.append(titleRow);

  const dateLabel = when
    ? `${relativeDay(localDayOf(when))}, ${clock(when)}`
    : task.plannedDate ? relativeDay(task.plannedDate) : 'No date';
  body.append(
    detailRow('schedule', dateLabel, () => taskEditor(app, id, {}, [], null, 'date')),
    detailRow('timer', task.minutes == null ? 'No estimate' : duration(task.minutes),
      () => taskEditor(app, id, {}, [], null, 'duration')),
    detailRow('repeat', repeatText(task), () => taskEditor(app, id, {}, [], null, 'repeat')),
  );
  const must = detailRow('star', task.must ? 'Must' : 'Mark as Must',
    () => app.commit({type: 'saveTask', id, fields: {must: !task.must}}, {keepSheet: true,
      label: task.must ? 'Must removed' : 'Marked Must'}).then(() => openTask(app, id, occurrence)).catch(() => {}),
    {fill: !!task.must, cls: task.must ? 'must-on' : ''});
  must.setAttribute('aria-pressed', String(!!task.must));
  body.append(must, partOf(app, task));

  inlineText(app, body, 'notes', 'Add details', task.notes, value => save({notes: value}));
  if (!app.context(task).block) {
    inlineText(app, body, 'favorite', 'Why? (optional)', task.purpose, value => save({purpose: value}));
  }
  if (task.leverage) body.append(detailRow('group', task.leverage, () => taskEditor(app, id, {}, [], null, 'more')));
  if (task.raw && task.raw !== task.title) {
    const raw = el('details', 'original-capture');
    raw.append(el('summary', '', 'Original capture'), el('p', '', task.raw));
    body.append(raw);
  }
  actions.append(labelButton(task.done ? 'undo' : 'check', task.done ? 'Mark incomplete' : 'Mark complete',
    () => toggleDone(app, task, when), 'filled-btn grow'));
}

function localDayOf(value) {
  return localDay(new Date(value));
}

function taskMenu(app, task) {
  const items = [
    {label: 'Ask Capture', icon: 'mic', onClick: () => app.capture()},
    {label: 'Move to Block', icon: 'drive_file_move', onClick: () => movePicker(app, task)},
  ];
  if (task.blockId != null || blockTasks(app.data(), null).length > 1) {
    items.push({label: 'Change Plan order', icon: 'swap_vert', onClick: () => planOrder(app, task)});
  }
  items.push({label: 'Duplicate', icon: 'content_copy', onClick: () => duplicate(app, task)});
  if (task.completions?.length && repeats(task)) {
    items.push({label: 'Undo last completion', icon: 'undo', onClick: () =>
      app.commit({type: 'reopenTask', id: task.id}, {label: 'Completion undone'}).catch(() => {})});
  }
  items.push({label: 'Archive', icon: 'archive', onClick: () => archiveTask(app, task)});
  items.push({divider: true}, {label: 'Delete', icon: 'delete', danger: true, onClick: () => deleteTask(app, task)});
  return items;
}

function duplicate(app, task) {
  const fields = {
    title: task.title, blockId: task.blockId ?? null, minutes: task.minutes, must: !!task.must,
    notes: task.notes ?? '', purpose: task.purpose ?? '', leverage: task.leverage ?? '',
  };
  app.commit({type: 'saveTask', fields}, {label: 'Task duplicated'}).catch(() => {});
}

export function archiveTask(app, task) {
  return app.commit({type: 'archiveTask', id: task.id, disposition: 'archive'},
    {label: 'Archived. Restore it from Archive.'}).catch(() => {});
}

export function deleteTask(app, task) {
  const {body, actions} = openSheet(app, 'Delete task?', {variant: 'dialog'});
  body.append(el('p', 'sheet-lead', task.title),
    el('p', 'sheet-note', 'This removes the task from your plan and stops its alerts. You can restore it from Trash.'));
  actions.append(button('Keep', () => openTask(app, task.id), 'text-btn'),
    button('Delete task', () => app.commit({type: 'archiveTask', id: task.id}, {label: 'Moved to Trash'})
      .catch(() => {}), 'filled-btn danger'));
}

export function movePicker(app, task) {
  const {body} = openSheet(app, 'Move to Block');
  body.append(el('p', 'sheet-note', 'Moving keeps the task, its schedule and its details.'));
  const choices = [...app.activeBlocks(), {id: null, title: 'No block'}];
  for (const block of choices) {
    const row = button('', () => app.commit({type: 'moveTask', id: task.id, blockId: block.id},
      {label: block.id ? 'Moved to ' + block.title : 'Moved to No block'}).catch(() => {}), 'choice-row');
    const selected = (task.blockId ?? null) === block.id;
    row.setAttribute('aria-pressed', String(selected));
    row.append(icon(block.id ? 'stacks' : 'inbox'), el('span', '', block.title));
    if (selected) row.append(icon('check', {cls: 'trailing'}));
    body.append(row);
  }
}

/** Accessible alternative to dragging: move one step in the Plan. */
export function planOrder(app, task) {
  const rows = blockTasks(app.data(), task.blockId);
  const index = rows.findIndex(row => row.id === task.id);
  const {body, actions} = openSheet(app, 'Plan order');
  body.append(el('p', 'sheet-lead', task.title),
    el('p', 'sheet-note', 'Plan order is the task’s priority. It does not change the scheduled time.'));
  const move = delta => {
    const ids = rows.map(row => row.id);
    const next = index + delta;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    app.commit({type: 'reorder', blockId: task.blockId, ids}, {label: 'Plan order changed'}).catch(() => {});
  };
  const up = labelButton('arrow_upward', 'Move up', () => move(-1), 'outlined-btn');
  const down = labelButton('arrow_downward', 'Move down', () => move(1), 'outlined-btn');
  up.disabled = index === 0;
  down.disabled = index === rows.length - 1;
  actions.append(up, down);
}

export function showTrash(app, archive = false) {
  const {body} = openSheet(app, archive ? 'Archive' : 'Trash');
  if (archive) {
    for (const block of app.p().blocks.filter(b => b.archived)) {
      const row = el('div', 'list-item');
      row.append(icon('stacks', {cls: 'leading'}), el('span', 'list-copy', block.title),
        button('Restore', () => app.commit({type: 'archiveBlock', id: block.id, archived: false},
          {label: 'Block restored'}).catch(() => {}), 'text-btn'));
      body.append(row);
    }
  }
  const rows = app.data().entries.filter(e => e.archived && (e.kind ?? 'plan') === 'plan'
    && (e.archiveDisposition === 'archive') === archive);
  if (!rows.length && !(archive && app.p().blocks.some(b => b.archived))) {
    body.append(emptyState({symbol: archive ? 'archive' : 'delete', title: archive ? 'Nothing archived' : 'Trash is empty'}));
  }
  for (const task of rows) {
    const row = el('div', 'list-item');
    row.append(icon('task_alt', {cls: 'leading'}), el('span', 'list-copy', task.title),
      button('Restore', () => app.commit({type: 'restoreTask', id: task.id}, {label: 'Task restored'})
        .catch(() => {}), 'text-btn'));
    body.append(row);
  }
}

/** Inbox: open tasks that are not in a Block yet. */
export function showInbox(app) {
  const {body, actions} = openSheet(app, 'Inbox');
  const rows = blockTasks(app.data(), null).filter(task => !task.done);
  if (!rows.length) {
    body.append(emptyState({symbol: 'inbox', title: 'Inbox is empty',
      body: 'New captures land here until you give them a Block.'}));
  } else {
    body.append(el('p', 'sheet-note', 'Tasks not in a Block yet. Give each one a Result, or keep it here.'));
    body.append(labelButton('auto_awesome', 'Sort with Jev', () => app.actions.jevSort(), 'tonal-btn'));
  }
  for (const task of rows) body.append(taskRow(app, task, {swipe: false}));
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'),
    labelButton('add', 'Add task', () => taskEditor(app, null), 'filled-btn'));
}

async function scheduleCheck(app, id, fields) {
  const existing = id ? findTask(app, id) : null;
  const candidate = {...existing, ...fields};
  const planned = candidate.planned;
  const minutes = candidate.minutes ?? 30;
  if (!planned) return {clashes: [], risk: null, candidate, minutes};
  const anchor = repeats(candidate) ? nextOccurrence(candidate) : planned;
  const copy = await app.api.native('calendarRead', {anchor: Date.parse(anchor)});
  app.state.calendar = calendarRows(copy);
  app.state.calendarState = calendarLabel(copy);
  const start = Date.parse(anchor);
  const risk = calendarRisk(copy, start, start + minutes * 60000);
  const window = start + (repeats(candidate) ? 21 * 86400000 : 1);
  const clashes = occurrences(candidate, start, window)
    .flatMap(o => conflicts(app.data(), o.start, minutes, app.state.calendar, id))
    .filter((e, i, all) => all.findIndex(x => x.id === e.id && x.start === e.start) === i);
  return {clashes, risk, candidate, minutes};
}

let reviewToken = null;
let scheduleWorking = false;

/** Save a task after checking calendar and plan conflicts; conflicts reopen the editor for review. */
async function scheduleSave(app, id, fields, allow, label) {
  if (scheduleWorking || app.saving) return undefined;
  scheduleWorking = true;
  try {
    const {clashes, risk, candidate, minutes} = await scheduleCheck(app, id, fields);
    const token = JSON.stringify({id, planned: candidate.planned, minutes, recurrence: candidate.recurrence ?? null,
      repeatAfterDays: candidate.repeatAfterDays ?? null, clashes: clashes.map(e => [e.id, e.start, e.end]), risk});
    if ((clashes.length || risk) && (!allow || reviewToken !== token)) {
      reviewToken = token;
      taskEditor(app, id, fields, clashes, risk);
      return undefined;
    }
    const saved = await app.commit({type: 'saveTask', id, fields}, {label});
    reviewToken = null;
    return saved;
  } finally {
    scheduleWorking = false;
  }
}

function optionPanels(body, focusOption) {
  const host = el('div', 'option-panels');
  body.append(host);
  const panels = new Map();
  const add = (key, label) => {
    const panel = el('section', 'option-panel');
    panel.hidden = focusOption !== key;
    panel.append(el('h3', 'overline', label));
    panels.set(key, panel);
    host.append(panel);
    return panel;
  };
  const show = key => {
    for (const [name, panel] of panels) panel.hidden = name !== key || !panel.hidden;
  };
  return {add, show};
}

function chip(symbol, onClick) {
  const node = button('', onClick, 'assist-chip');
  node.append(icon(symbol), el('span', 'chip-label'));
  node.setLabel = text => { node.querySelector('.chip-label').textContent = text; };
  return node;
}

/**
 * Quick add (id null) or task options. Date, duration, Block, Must, repeat and More are optional chips.
 * Conflicts from scheduleSave come back here with a warning and "Save anyway".
 */
function datePanel(app, panels, v, update) {
  const panel = panels.add('date', 'Date and time');
  const presets = el('div', 'chip-row wrap');
  panel.append(presets);
  const date = field(app, panel, 'Date', v.planned ? localDay(new Date(v.planned)) : v.plannedDate ?? '', 'date');
  const time = field(app, panel, 'Time', v.planned ? timeValue(v.planned) : '', 'time');
  const today = localDay();
  for (const [label, value] of [['Today', today], ['Tomorrow', shiftDay(today, 1)], ['No date', '']]) {
    presets.append(button(label, () => {
      date.value = value;
      if (!value) time.value = '';
      date.dispatchEvent(new Event('input'));
      time.dispatchEvent(new Event('input'));
      update();
    }, 'filter-chip'));
  }
  return {date, time};
}

function durationPanel(app, panels, v, update) {
  const panel = panels.add('duration', 'Duration');
  const durations = el('div', 'chip-row wrap');
  panel.append(durations);
  const minutes = field(app, panel, 'Minutes', v.minutes ?? 30, 'number');
  minutes.min = 1;
  minutes.max = 1440;
  for (const n of [15, 30, 45, 60, 90]) {
    durations.append(button(duration(n), () => {
      minutes.value = n;
      minutes.dispatchEvent(new Event('input'));
      update();
    }, 'filter-chip'));
  }
  return minutes;
}

/** Block choice: a searchable list (recent Block first) backed by a hidden select that keeps the draft. */
function blockPanel(app, panels, v, update) {
  const panel = panels.add('block', 'Block');
  const search = field(app, panel, 'Search Blocks', '', 'search', {key: 'Search blocks'});
  const block = select(app, panel, 'Block', v.blockId,
    [['', 'No block'], ...app.activeBlocks().map(b => [b.id, b.title])]);
  block.parentElement.hidden = true;
  const list = el('div', 'choice-list');
  panel.append(list);
  const draw = () => {
    list.replaceChildren();
    let recent = null;
    try { recent = localStorage.getItem('rpm-recent-block'); } catch {}
    const ordered = app.activeBlocks().slice().sort((a, b) => Number(b.id === recent) - Number(a.id === recent));
    const query = search.value.toLowerCase();
    for (const [value, title] of [['', 'No block'], ...ordered.map(b => [b.id, b.title])]) {
      if (!title.toLowerCase().includes(query)) continue;
      const row = button('', () => {
        block.value = value;
        block.dispatchEvent(new Event('change'));
        update();
        panels.show('block');
      }, 'choice-row');
      row.setAttribute('aria-pressed', String(block.value === value));
      row.append(icon(value ? 'stacks' : 'inbox'), el('span', '', title));
      if (block.value === value) row.append(icon('check', {cls: 'trailing'}));
      list.append(row);
    }
  };
  search.addEventListener('input', draw);
  draw();
  return block;
}

function repeatPanel(app, panels, v) {
  const panel = panels.add('repeat', 'Repeat');
  const repeat = select(app, panel, 'Repeat', v.repeatAfterDays ? 'after' : v.recurrence ?? '', [
    ['', "Doesn't repeat"], ['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'],
    ['after', 'After completion'],
  ]);
  const interval = field(app, panel, 'Days after completion', v.repeatAfterDays ?? 1, 'number');
  interval.min = 1;
  interval.max = 365;
  interval.parentElement.hidden = repeat.value !== 'after';
  repeat.addEventListener('change', () => { interval.parentElement.hidden = repeat.value !== 'after'; });
  return {repeat, interval};
}

function morePanel(app, panels, v) {
  const panel = panels.add('more', 'More');
  return {
    notes: field(app, panel, 'Notes', v.notes, 'textarea'),
    why: field(app, panel, 'Why? (optional)', v.purpose, 'textarea'),
    leverage: field(app, panel, 'Leverage', v.leverage, 'textarea', {helper: 'Who or what could help with this'}),
    alert: select(app, panel, 'Alert', v.alertIntent?.type ?? 'off',
      [['off', 'No alert'], ['reminder', 'Reminder'], ['alarm', 'Ringing alarm']]),
  };
}

/** The chip row under the title; each chip opens its option panel and shows the current choice. */
function editorChips(app, chips, panels, f) {
  const c = {
    date: chip('event', () => panels.show('date')),
    duration: chip('timer', () => panels.show('duration')),
    block: chip('stacks', () => panels.show('block')),
    must: chip('star', () => {
      f.mustOn = !f.mustOn;
      rememberValue(app, 'Must', f.mustOn);
      f.update();
    }),
    repeat: chip('repeat', () => panels.show('repeat')),
    more: chip('tune', () => panels.show('more')),
  };
  c.must.setAttribute('aria-label', 'Must');
  chips.append(c.date, c.duration, c.block, c.must, c.repeat, c.more);
  return () => {
    const day = f.date.value;
    c.date.setLabel(day ? relativeDay(day) + (f.time.value ? ' · ' + f.time.value : '') : 'No date');
    c.date.classList.toggle('on', !!day);
    c.duration.setLabel(f.minutes.value ? duration(Number(f.minutes.value)) : 'No estimate');
    c.block.setLabel(f.block.selectedOptions[0]?.textContent ?? 'No block');
    c.block.classList.toggle('on', !!f.block.value);
    c.must.setLabel('Must');
    c.must.setAttribute('aria-pressed', String(f.mustOn));
    c.must.classList.toggle('on', f.mustOn);
    c.must.querySelector('.ms').classList.toggle('fill', f.mustOn);
    c.repeat.setLabel(f.repeat.value ? 'Repeats' : 'Repeat');
    c.repeat.classList.toggle('on', !!f.repeat.value);
    f.why.parentElement.hidden = !!f.block.value;
  };
}

function editorFields(f) {
  const {date, time, minutes, block, repeat} = f;
  if (time.value && !date.value) throw new Error('Choose a date for this time.');
  return {
    title: f.name.value,
    planned: date.value && time.value ? new Date(date.value + 'T' + time.value).toISOString() : null,
    plannedDate: date.value && !time.value ? date.value : null,
    minutes: minutes.value ? Number(minutes.value) : null,
    blockId: block.value || null,
    must: f.mustOn,
    notes: f.notes.value,
    purpose: block.value ? '' : f.why.value,
    leverage: f.leverage.value,
    alert: f.alert.value,
    recurrence: repeat.value === 'after' ? null : repeat.value || null,
    repeatAfterDays: repeat.value === 'after' ? Number(f.interval.value) : null,
  };
}

function saveButton(app, id, f, conflicted, error) {
  const save = button(conflicted ? 'Save anyway' : id ? 'Save' : 'Add', async () => {
    if (app.saving) return;
    save.disabled = true;
    try {
      const fields = editorFields(f);
      const label = id ? 'Task saved'
        : fields.plannedDate === localDay() ? 'Added to Today' : fields.planned ? 'Task scheduled' : 'Task added';
      const saved = await scheduleSave(app, id, fields, conflicted, label);
      if (saved === undefined) return;
      if (fields.blockId) {
        try { localStorage.setItem('rpm-recent-block', fields.blockId); } catch {}
      }
      if (id) openTask(app, id);
      else taskEditor(app, null, {plannedDate: fields.plannedDate, blockId: fields.blockId, minutes: fields.minutes});
    } catch (problem) {
      error.textContent = problem.message;
    } finally {
      save.disabled = !f.name.value.trim();
    }
  }, 'filled-btn');
  save.disabled = !f.name.value.trim();
  f.name.addEventListener('input', () => { save.disabled = !f.name.value.trim(); });
  return save;
}

function conflictBanner(clashes, risk) {
  const warning = el('div', 'banner warning');
  warning.append(icon('warning'), el('span', '', clashes.length
    ? 'Clashes with ' + clashes.map(c => `${c.title} on ${dateText(c.start)}`).join(', ')
    : risk));
  return warning;
}

/** Quick add (new task) and the full editor share one sheet: title, choice chips, option panels. */
export function taskEditor(app, id, overrides = {}, clashes = [], risk = null, focusOption = null) {
  const existing = id ? findTask(app, id) : {};
  if (!existing) return;
  const v = {...existing, ...overrides};
  const {body, actions} = openSheet(app, id ? 'Edit task' : 'New task', {draftKey: 'task:' + (id ?? 'new'),
    variant: id ? 'form' : 'form sheet-quick'});
  const conflicted = !!(clashes.length || risk);
  if (conflicted) {
    app.sheet.draftValues = {};
    body.append(conflictBanner(clashes, risk));
  }
  const f = {mustOn: false, update: () => {}};
  const update = () => f.update();
  f.name = field(app, body, 'Task', v.title, 'text');
  f.name.placeholder = 'New task';
  f.name.maxLength = 200;
  f.name.parentElement.classList.add('quick-title');
  const chips = el('div', 'chip-row');
  body.append(chips);
  const panels = optionPanels(body, focusOption);
  Object.assign(f, datePanel(app, panels, v, update));
  f.minutes = durationPanel(app, panels, v, update);
  f.block = blockPanel(app, panels, v, update);
  Object.assign(f, repeatPanel(app, panels, v), morePanel(app, panels, v));
  f.mustOn = !!(app.sheet.draftValues.Must ?? v.must);
  f.update = editorChips(app, chips, panels, f);
  for (const control of [f.date, f.time, f.minutes, f.block, f.repeat]) control.addEventListener('change', update);
  update();

  const error = el('p', 'sheet-error');
  error.setAttribute('role', 'alert');
  body.append(error);
  const save = saveButton(app, id, f, conflicted, error);
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'), el('span', 'spacer'), save);
  requestAnimationFrame(() => {
    if (id) return;
    f.name.focus();
    app.api.native('keyboard', {field: 'Task'}).catch(() => {});
  });
}
