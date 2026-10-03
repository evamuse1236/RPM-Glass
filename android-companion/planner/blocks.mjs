/** Blocks list and Block detail: Result, its deadline, Purpose, progress, Mark Result achieved, the ordered Plan. */
import {blockTasks, blockDue, localDay} from '../planner-state.mjs';
import {weekStart, weekFocus, resultStatus, markAchieved} from '../review-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState, progress, areaDot, sectionHeader} from './dom.mjs';
import {duration, plural, dateText, dueInfo} from './format.mjs';
import {taskRow, completedSection, toggleDone} from './task-row.mjs';
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

/** "31 h left", "3 days left". */
export function timeLeft(at, now = new Date()) {
  const minutes = Math.max(0, Math.floor((at - now) / 60000));
  if (minutes < 60) return `${minutes} min left`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h left`;
  return plural(Math.floor(minutes / 1440), 'day') + ' left';
}

/** Deadline with its countdown; `tight` when the open Musts need a quarter or more of the clock time left. */
export function deadline(data, block, status, now = new Date()) {
  const due = blockDue(data, block.id);
  const info = due && dueInfo(due.value, now);
  if (!info || status.achieved) return null;
  const tight = info.overdue || status.mustMinutes * 60000 * 4 >= info.at - now;
  return {...info, task: due.task, tight, text: info.overdue ? info.label : `${info.label} · ${timeLeft(info.at, now)}`};
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

export function eyebrow(app, block) {
  const project = app.p().projects.find(pr => pr.id === block.projectId);
  const area = app.projectArea(project);
  const line = el('span', 'eyebrow');
  line.append(areaDot(app.tone(area)), el('span', '', [area?.title, project?.title].filter(Boolean).join(' · ')
    || 'No project'));
  return line;
}

export function blockCard(app, block, {focus = false} = {}) {
  const status = resultStatus(app.data(), block.id);
  const card = el('article', 'block-card');
  card.dataset.blockId = block.id;
  card.dataset.tone = app.tone(app.blockArea(block));
  const main = button('', () => app.openBlock(block.id), 'card-main');
  const top = el('span', 'card-top');
  top.append(eyebrow(app, block));
  if (status.achieved) {
    const badge = el('span', 'badge success');
    badge.append(icon('emoji_events'), el('span', '', 'Achieved'));
    top.append(badge);
  } else if (focus) {
    top.append(el('span', 'badge', 'This week'));
  }
  main.append(top, el('span', 'card-title', block.title));
  main.append(el('span', 'card-purpose', block.purpose || 'Add the Purpose: why this Result matters'));
  const due = deadline(app.data(), block, status);
  if (due) {
    const line = el('span', 'card-due tnum');
    line.classList.toggle('tight', due.tight);
    line.append(icon(due.overdue ? 'event_busy' : 'event'), el('span', '', due.soon || due.overdue ? due.text : due.label));
    main.append(line);
  }
  if (status.total) {
    main.append(progress(status.done, status.total, `${status.done} of ${status.total} tasks done`));
    const meta = [`${status.done} of ${plural(status.total, 'task')} done`,
      status.mustMinutes ? duration(status.mustMinutes) + ' of Musts left' : ''].filter(Boolean);
    main.append(el('span', 'card-meta tnum', meta.join(' · ')));
  } else {
    main.append(el('span', 'card-meta', 'No tasks in the Plan yet'));
  }
  main.setAttribute('aria-label', `Result: ${block.title}. ${due ? due.text + '. ' : ''}`
    + `${status.done} of ${status.total} tasks done. Open Block`);
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
  // One list in order of urgency; this week's Results carry a badge instead of a separate section.
  for (const block of byDeadline(app.data(), blocks, focus)) page.append(blockCard(app, block, {focus: focus.has(block.id)}));
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

/** Purpose in a tonal container, labelled, as in the approved mockup. */
export function purposePanel(purpose, onEdit) {
  const panel = button('', onEdit, 'purpose-panel');
  const label = el('span', 'overline');
  label.append(icon('favorite'), el('span', '', 'Purpose'));
  panel.append(label, el('p', '', purpose || 'Add why this matters to you'));
  panel.classList.toggle('empty', !purpose);
  return panel;
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

function achievedControl(app, block, status) {
  if (!status.achieved) {
    return labelButton('emoji_events', 'Mark Result achieved', () => achievedSheet(app, block), 'outlined-btn achieve-btn');
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

/** Due row under the title: when, how long is left, and the task that sets it (tap to open). */
function dueRow(app, due) {
  const row = button('', () => app.actions.openTask(due.task.id), 'due-row');
  row.classList.toggle('tight', due.tight);
  row.append(icon(due.overdue ? 'event_busy' : 'event', {cls: 'leading'}));
  const copy = el('span', 'list-copy');
  copy.append(el('span', 'due-when tnum', due.text), el('span', 'list-supporting', due.task.title));
  row.append(copy);
  row.setAttribute('aria-label', `${due.text}${due.tight && !due.overdue ? ', tight for the Musts left' : ''}. `
    + `Set by ${due.task.title}. Open task`);
  return row;
}

export function renderBlockDetail(app, page, block) {
  const project = app.p().projects.find(pr => pr.id === block.projectId);
  const status = resultStatus(app.data(), block.id);
  const rows = blockTasks(app.data(), block.id);
  const open = rows.filter(t => !t.done);
  const head = el('div', 'detail-head');
  const crumb = button('', () => (project ? app.openProject(project.id) : app.actions.editEntity('blocks', block.id)),
    'assist-chip crumb');
  crumb.append(eyebrow(app, block));
  head.append(crumb);
  if (thisWeek(app).includes(block.id)) head.append(el('span', 'badge', 'This week'));
  page.append(head);
  page.append(el('h2', 'detail-title-text', block.title));
  const due = deadline(app.data(), block, status);
  if (due) page.append(dueRow(app, due));
  page.append(purposePanel(block.purpose, () => app.actions.editEntity('blocks', block.id)));

  // Progress, the time the open tasks still need, and the user's own verdict, together above the Plan.
  const summary = el('div', 'progress-summary');
  summary.append(progress(status.done, status.total, `${status.done} of ${status.total} tasks done`));
  const labels = el('div', 'progress-labels tnum');
  labels.append(el('span', 'progress-count', status.total ? `${status.done} of ${plural(status.total, 'task')} done`
    : 'No tasks yet'));
  if (!status.achieved) labels.append(achievedControl(app, block, status));
  summary.append(labels);
  const time = timeSummary(status);
  if (time) {
    const budget = el('p', 'time-left tnum');
    budget.classList.toggle('tight', !!due?.tight);
    if (due?.tight) budget.append(icon('warning'));
    budget.append(el('span', '', time));
    summary.append(budget);
  }
  page.append(summary);
  if (status.achieved) page.append(achievedControl(app, block, status));

  const reordering = app.state.reorderBlock === block.id && open.length > 1;
  const toggle = open.length > 1 ? labelButton(reordering ? 'check' : 'swap_vert', reordering ? 'Done' : 'Reorder', () => {
    app.state.reorderBlock = reordering ? null : block.id;
    app.render();
  }, 'text-btn reorder-btn') : null;
  toggle?.setAttribute('aria-pressed', String(reordering));
  page.append(sectionHeader('Plan', toggle));
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
