/** Blocks list and Block detail: Result, its deadline, Purpose, your verdict, progress, the ordered Plan. */
import {blockTasks, blockDue, localDay} from '../planner-state.mjs';
import {weekStart, weekFocus, resultStatus, markAchieved} from '../review-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState, areaDot, attrs, sectionHeader} from './dom.mjs';
import {duration, plural, dateText, dueInfo, timeLeft} from './format.mjs';
import {taskRow, completedSection, toggleDone, taskWhen} from './task-row.mjs';
import {openSheet, field} from './sheet.mjs';
import {openMenu} from './menu.mjs';

const thisWeek = app => weekFocus(app.data(), weekStart(localDay()));

/** "30 min of Musts left · 1 h 50 min in total" (open tasks only) from the review contract's status. */
export function timeSummary(status) {
  const parts = [];
  if (status.mustMinutes) parts.push(duration(status.mustMinutes) + ' of Musts left');
  if (status.plannedMinutes) parts.push(duration(status.plannedMinutes) + (status.mustMinutes ? ' in total' : ' left'));
  return parts.join(' · ');
}

/** Deadline with its countdown; `tight` when the open Musts need a quarter or more of the clock time left. */
export function deadline(data, block, status, now = new Date()) {
  const due = blockDue(data, block.id);
  const info = due && dueInfo(due.value, now);
  if (!info || status.achieved) return null;
  const tight = info.overdue || status.mustMinutes * 60000 * 4 >= info.at - now;
  return {...info, task: due.task, tight, text: info.overdue ? info.label : `${info.label} · ${timeLeft(info.at, now)} left`};
}

/**
 * Urgency order: Results due within the week ahead (or overdue) first, soonest first; then `first` (this week's
 * Results); then the rest. Each later group is ordered by deadline too, and ties keep their order.
 */
export function byDeadline(data, blocks, first = new Set(), now = new Date()) {
  const key = (block, i) => {
    const at = dueInfo(blockDue(data, block.id)?.value, now)?.at.getTime() ?? Infinity;
    return [at - now < 7 * 864e5 ? 0 : first.has(block.id) ? 1 : 2, at, i, block];
  };
  return blocks.map(key).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(entry => entry[3]);
}

/**
 * Sort by time: the Plan's ids with its open dated tasks in time order, each taking a slot a dated task held.
 * Undated and completed tasks keep their places, so the priorities the user set by hand survive.
 */
export function planByTime(rows) {
  const when = task => taskWhen(task) ?? (task.plannedDate ? Date.parse(task.plannedDate + 'T23:59') : null);
  const dated = rows.filter(task => !task.done && when(task) != null);
  const sorted = [...dated].sort((a, b) => when(a) - when(b));
  return rows.map(task => (dated.includes(task) ? sorted.shift() : task).id);
}

export function eyebrow(app, block) {
  const project = app.p().projects.find(pr => pr.id === block.projectId);
  const area = app.projectArea(project);
  const line = el('span', 'eyebrow');
  line.append(areaDot(app.tone(area)), el('span', '', [area?.title, project?.title].filter(Boolean).join(' · ')
    || 'No project'));
  return line;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Small determinate progress ring (tasks done), so progress sits on a line instead of a bar of its own. */
export function progressRing(done, total, label) {
  const percent = total ? Math.round(done / total * 100) : 0;
  const svg = document.createElementNS(SVG, 'svg');
  attrs(svg, {class: 'ring', viewBox: '0 0 24 24', role: 'progressbar', 'aria-label': label,
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent});
  const circle = cls => attrs(document.createElementNS(SVG, 'circle'), {class: cls, cx: 12, cy: 12, r: 9, pathLength: 100});
  svg.append(circle('ring-track'));
  if (percent) svg.append(attrs(circle('ring-value'), {'stroke-dasharray': `${percent} 100`}));
  return svg;
}

/** A Result card: Area and Project (unless the list already says it), title, Purpose, one facts line, the Next task. */
export function blockCard(app, block, {focus = false, project = true} = {}) {
  const status = resultStatus(app.data(), block.id);
  const card = el('article', 'block-card');
  card.dataset.blockId = block.id;
  card.dataset.tone = app.tone(app.blockArea(block));
  const main = button('', () => app.openBlock(block.id), 'card-main');
  const badge = status.achieved ? el('span', 'badge success') : focus ? el('span', 'badge', 'Picked for this week') : null;
  if (status.achieved) badge.append(icon('emoji_events'), el('span', '', 'Achieved'));
  if (project || badge) {
    const top = el('span', 'card-top');
    if (project) top.append(eyebrow(app, block));
    if (badge) top.append(badge);
    main.append(top);
  }
  main.append(el('span', 'card-title', block.title));
  main.append(el('span', 'card-purpose', block.purpose || 'Add the Purpose: why this Result matters'));
  // One facts line: progress ring, the deadline (error colour when tight), tasks done.
  const due = deadline(app.data(), block, status);
  const facts = el('span', 'card-facts tnum');
  const count = status.total ? `${status.done} of ${plural(status.total, 'task')} done` : 'No tasks in the Plan yet';
  if (status.total) facts.append(progressRing(status.done, status.total, count));
  const short = status.total ? `${status.done} of ${status.total} done` : count;
  const copy = el('span', 'card-facts-text');
  if (due) {
    const when = el('b', 'card-due', due.soon || due.overdue ? due.text : due.label);
    when.classList.toggle('tight', due.tight);
    copy.append(when, ' · ');
  }
  copy.append(short);
  facts.append(copy);
  main.append(facts);
  main.setAttribute('aria-label', `Result: ${block.title}. ${due ? due.text + '. ' : ''}${count}. Open Block`);
  card.append(main);
  const next = blockTasks(app.data(), block.id).find(task => !task.done);
  if (next) {
    const row = el('div', 'next-task');
    const check = button('', () => toggleDone(app, next), 'task-check');
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', 'false');
    check.setAttribute('aria-label', `Mark ${next.title} complete`);
    check.append(el('span', 'check-ring'));
    const open = button('', () => app.actions.openTask(next.id), 'next-title');
    open.append(el('span', 'overline', 'Next'), el('span', '', next.title));
    row.append(check, open);
    card.append(row);
  }
  return card;
}

function filterChip(app, label, value, options, onSelect) {
  const current = options.find(([v]) => v === value);
  const chip = button('', null, 'filter-chip dropdown');
  chip.classList.toggle('on', value != null && value !== 'all');
  chip.append(el('span', '', current && value != null ? current[1] : label), icon('arrow_drop_down'));
  chip.setAttribute('aria-label', `${label}: ${current?.[1] ?? 'All'}`);
  chip.addEventListener('click', () => openMenu(chip, options.map(([v, text]) => ({
    label: text, icon: v === value ? 'check' : '', onClick: () => onSelect(v),
  })), label));
  return chip;
}

export function renderBlocks(app, page) {
  const {state} = app;
  const filters = el('div', 'chip-row filters');
  filters.append(
    filterChip(app, 'Project', state.blockFilter, [[null, 'All projects'],
      ...app.p().projects.map(pr => [pr.id, pr.title])], v => { state.blockFilter = v; app.render({reset: true}); }),
    filterChip(app, 'Status', state.blockStatus, [['active', 'Active'], ['completed', 'All tasks done'],
      ['achieved', 'Achieved'], ['all', 'All statuses']], v => { state.blockStatus = v; app.render({reset: true}); }),
  );
  page.append(filters);
  const focus = new Set(thisWeek(app));
  const blocks = app.activeBlocks().filter(block => {
    if (state.blockFilter && block.projectId !== state.blockFilter) return false;
    const status = resultStatus(app.data(), block.id);
    const allDone = status.total > 0 && status.done === status.total;
    if (state.blockStatus === 'active') return !allDone && !status.achieved;
    if (state.blockStatus === 'completed') return allDone;
    if (state.blockStatus === 'achieved') return status.achieved;
    return true;
  });
  // One list in order of urgency; this week's Results carry a badge instead of a separate section. A Project
  // filter already names the Project, so the cards drop that line.
  for (const block of byDeadline(app.data(), blocks, focus)) {
    page.append(blockCard(app, block, {focus: focus.has(block.id), project: !state.blockFilter}));
  }
  if (!blocks.length) {
    page.append(emptyState({
      symbol: 'stacks',
      title: app.activeBlocks().length ? 'No Blocks match these filters' : 'Start with a Result',
      body: 'Result: what you want. Purpose: why it matters. Plan: the tasks that can get you there.',
      action: () => app.actions.newEntity('blocks'),
      label: 'New Block',
    }));
  }
  const inbox = blockTasks(app.data(), null).filter(task => !task.done).length;
  const row = button('', () => app.actions.inbox(), 'list-item inbox-row');
  row.append(icon('inbox', {cls: 'leading'}));
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'list-headline', 'Inbox'), el('span', 'list-supporting',
    inbox ? plural(inbox, 'task') + ' not in a Block' : 'Empty'));
  row.append(copy, icon('chevron_right', {cls: 'trailing'}));
  page.append(row);
}

/** A Google Tasks detail row: a 24dp icon in the check column, then text aligned with the task titles. */
export function factRow(symbol, {onClick = null, cls = ''} = {}) {
  const row = onClick ? button('', onClick, 'fact-row ' + cls) : el('div', 'fact-row ' + cls);
  row.append(typeof symbol === 'string' ? icon(symbol, {cls: 'leading'}) : symbol);
  const copy = el('span', 'list-copy');
  row.append(copy);
  return {row, copy};
}

/** Purpose as a labelled detail row (Block, Project and Goal); tap to edit. */
export function purposePanel(purpose, onEdit) {
  const {row, copy} = factRow('favorite', {onClick: onEdit, cls: 'purpose-row'});
  copy.append(el('span', 'fact-label', 'Purpose'), el('span', 'purpose-text', purpose || 'Add why this matters to you'));
  row.classList.toggle('empty', !purpose);
  row.setAttribute('aria-label', `Purpose: ${purpose || 'not set'}. Edit`);
  return row;
}

function achievedSheet(app, block) {
  const {body, actions} = openSheet(app, 'Mark Result achieved', {variant: 'dialog'});
  body.append(el('p', 'sheet-lead', block.title),
    el('p', 'sheet-note', 'Achieving the Result is your call. Ticking tasks alone does not decide it.'));
  const evidence = field(app, body, 'How do you know? (optional)', '', 'text', {helper: 'One line of evidence'});
  evidence.maxLength = 200;
  actions.append(button('Cancel', () => app.closeSheet(), 'text-btn'),
    labelButton('emoji_events', 'Mark achieved', () => app.commit(
      data => markAchieved(data, block.id, {achieved: true, evidence: evidence.value}),
      {label: 'Result achieved'}).catch(() => {}), 'filled-btn'));
}

/** The verdict is a question about the Result, apart from the tick count; once marked, the green achieved panel. */
function achievedControl(app, block, status) {
  if (!status.achieved) {
    const {row, copy} = factRow('emoji_events', {cls: 'verdict-row'});
    copy.append(el('span', 'list-headline', 'Is this Result achieved?'));
    const mark = button('Mark achieved', () => achievedSheet(app, block), 'text-btn');
    mark.setAttribute('aria-label', 'Mark Result achieved');
    row.append(mark);
    return row;
  }
  const panel = el('section', 'achieved-panel');
  panel.setAttribute('aria-label', 'Result achieved');
  const head = el('div', 'achieved-head');
  head.append(icon('emoji_events', {fill: true}), el('strong', '', 'Result achieved'));
  if (status.achievedAt) head.append(el('span', 'achieved-date', dateText(status.achievedAt)));
  panel.append(head);
  if (status.evidence) panel.append(el('p', '', status.evidence));
  panel.append(button('Mark not achieved', () => app.commit(
    data => markAchieved(data, block.id, {achieved: false}), {label: 'Result marked not achieved'}).catch(() => {}),
  'text-btn'));
  return panel;
}

function inlineAdd(app, block) {
  const form = el('form', 'inline-add');
  const input = el('input');
  input.placeholder = 'Add a task';
  input.maxLength = 200;
  input.setAttribute('aria-label', 'Add a task to the Plan');
  const submit = iconButton('add', 'Add task to the Plan', () => form.requestSubmit());
  form.append(submit, input);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!input.value.trim()) return;
    try {
      await app.commit({type: 'saveTask', fields: {title: input.value, blockId: block.id}}, {label: 'Task added'});
      app.dom.work.querySelector('.inline-add input')?.focus();
    } catch {}
  });
  return form;
}

/** Due row under the title: when, how long is left, and the last step that sets it (tap to open). */
function dueRow(app, due) {
  const {row, copy} = factRow(due.overdue ? 'event_busy' : 'event', {onClick: () => app.actions.openTask(due.task.id),
    cls: 'due-fact'});
  row.classList.toggle('tight', due.tight);
  copy.append(el('span', 'due-when tnum', due.text), el('span', 'list-supporting', 'Last step: ' + due.task.title));
  row.setAttribute('aria-label', `${due.text}${due.tight && !due.overdue ? ', tight for the Musts left' : ''}. `
    + `Last step: ${due.task.title}. Open task`);
  return row;
}

/** Progress as one row: a ring, the count, and the open time with the Must star as its legend. */
function progressRow(status, due) {
  const label = status.total ? `${status.done} of ${plural(status.total, 'task')} done` : 'No tasks in the Plan yet';
  const {row, copy} = factRow(progressRing(status.done, status.total, label), {cls: 'progress-row'});
  copy.append(el('span', 'list-headline tnum', label));
  const summary = timeSummary(status);
  if (!summary) return row;
  const time = el('span', 'list-supporting time-left tnum');
  time.classList.toggle('tight', !!due?.tight);
  if (status.mustMinutes) time.append(icon('star', {fill: true, cls: 'must-legend'}));
  time.append(summary);
  copy.append(time);
  return row;
}

function planHeader(app, block, rows, open) {
  const actions = el('div', 'plan-actions');
  const reordering = app.state.reorderBlock === block.id && open.length > 1;
  if (open.length > 1 && !reordering) {
    const ids = planByTime(rows);
    if (ids.some((id, i) => id !== rows[i].id)) {
      actions.append(labelButton('schedule', 'Sort by time', () => app.commit({type: 'reorder', blockId: block.id, ids},
        {label: 'Plan sorted by time'}).catch(() => {}), 'text-btn'));
    }
  }
  if (open.length > 1) {
    const toggle = reordering ? labelButton('check', 'Done', null, 'text-btn')
      : iconButton('swap_vert', 'Reorder the Plan', null);
    toggle.addEventListener('click', () => {
      app.state.reorderBlock = reordering ? null : block.id;
      app.render();
    });
    toggle.setAttribute('aria-pressed', String(reordering));
    actions.append(toggle);
  }
  const header = sectionHeader('Plan', actions.children.length ? actions : null);
  header.classList.add('plan-header');
  return {header, reordering};
}

export function renderBlockDetail(app, page, block) {
  const project = app.p().projects.find(pr => pr.id === block.projectId);
  const status = resultStatus(app.data(), block.id);
  const rows = blockTasks(app.data(), block.id);
  const open = rows.filter(t => !t.done);
  const head = el('div', 'detail-head');
  const crumb = button('', () => (project ? app.openProject(project.id) : app.actions.editEntity('blocks', block.id)),
    'crumb crumb-link');
  crumb.append(eyebrow(app, block));
  head.append(crumb);
  page.append(head);
  page.append(el('h2', 'detail-title-text', block.title));
  // Result, then when and why, then your verdict, then the work: progress and the Plan.
  const facts = el('div', 'block-facts');
  const due = deadline(app.data(), block, status);
  if (due) facts.append(dueRow(app, due));
  facts.append(purposePanel(block.purpose, () => app.actions.editEntity('blocks', block.id)));
  facts.append(achievedControl(app, block, status));
  facts.append(progressRow(status, due));
  page.append(facts);

  const {header, reordering} = planHeader(app, block, rows, open);
  page.append(header);
  const list = el('div', 'plan-list');
  list.classList.toggle('reordering', reordering);
  for (const task of open) list.append(taskRow(app, task, {plan: true, days: true, reorder: reordering}));
  page.append(list, inlineAdd(app, block));
  completedSection(app, page, rows.filter(t => t.done), {plan: true, days: true});
}

export function blockMenu(app, block) {
  return [
    {label: 'Edit Block', icon: 'edit', onClick: () => app.actions.editEntity('blocks', block.id)},
    {label: 'Move to Project', icon: 'drive_file_move', onClick: () => app.actions.editEntity('blocks', block.id)},
    {label: 'Suggest a Purpose', icon: 'auto_awesome', onClick: () => app.actions.purposeIdea(block.id)},
    {label: 'Archive Block', icon: 'archive', onClick: () => app.commit({type: 'archiveBlock', id: block.id},
      {label: 'Block archived'}).then(() => app.back()).catch(() => {})},
  ];
}
