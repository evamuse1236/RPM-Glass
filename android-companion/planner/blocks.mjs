/** Blocks list and Block detail: Result, Purpose, progress, the ordered Plan, Mark Result achieved. */
import {blockTasks, localDay} from '../planner-state.mjs';
import {weekStart, weekFocus, resultStatus, markAchieved} from '../review-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState, progress, areaDot, sectionHeader} from './dom.mjs';
import {duration, plural, dateText} from './format.mjs';
import {taskRow, completedSection, toggleDone} from './task-row.mjs';
import {openSheet, field} from './sheet.mjs';
import {openMenu} from './menu.mjs';

const thisWeek = app => weekFocus(app.data(), weekStart(localDay()));

/** "Must 30 min · 1 h 50 min planned" from the review contract's status. */
export function timeSummary(status) {
  const parts = [];
  if (status.mustMinutes) parts.push('Must ' + duration(status.mustMinutes));
  if (status.plannedMinutes) parts.push(duration(status.plannedMinutes) + ' planned');
  return parts.join(' · ');
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
  if (status.total) {
    main.append(progress(status.done, status.total, `${status.done} of ${status.total} tasks done`));
    const meta = [`${status.done} of ${plural(status.total, 'task')} done`, timeSummary(status)].filter(Boolean);
    main.append(el('span', 'card-meta tnum', meta.join(' · ')));
  } else {
    main.append(el('span', 'card-meta', 'No tasks in the Plan yet'));
  }
  main.setAttribute('aria-label', `Result: ${block.title}. ${status.done} of ${status.total} tasks done. Open Block`);
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
  const chosen = blocks.filter(block => focus.has(block.id));
  const others = blocks.filter(block => !focus.has(block.id));
  if (chosen.length) {
    page.append(sectionHeader('This week'));
    for (const block of chosen) page.append(blockCard(app, block));
    if (others.length) page.append(sectionHeader('Other Blocks'));
  }
  for (const block of others) page.append(blockCard(app, block));
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
    return labelButton('emoji_events', 'Mark Result achieved', () => achievedSheet(app, block), 'outlined-btn wide');
  }
  const panel = el('section', 'achieved-panel');
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

export function renderBlockDetail(app, page, block) {
  const project = app.p().projects.find(pr => pr.id === block.projectId);
  const status = resultStatus(app.data(), block.id);
  const rows = blockTasks(app.data(), block.id);
  const head = el('div', 'detail-head');
  const crumb = button('', () => (project ? app.openProject(project.id) : app.actions.editEntity('blocks', block.id)),
    'assist-chip crumb');
  crumb.append(eyebrow(app, block));
  head.append(crumb);
  if (thisWeek(app).includes(block.id)) head.append(el('span', 'badge', 'This week'));
  page.append(head);
  const title = el('h2', 'detail-title-text', block.title);
  page.append(title, purposePanel(block.purpose, () => app.actions.editEntity('blocks', block.id)));

  const summary = el('div', 'progress-summary');
  summary.append(progress(status.done, status.total, `${status.done} of ${status.total} tasks done`));
  const labels = el('div', 'progress-labels tnum');
  labels.append(el('span', '', status.total ? `${status.done} of ${status.total} done` : 'No tasks yet'),
    el('span', '', timeSummary(status)));
  summary.append(labels);
  page.append(summary);

  page.append(sectionHeader('Plan', el('small', '', rows.some(t => !t.done) ? 'Drag to reorder' : '')));
  const list = el('div', 'plan-list');
  for (const task of rows.filter(t => !t.done)) list.append(taskRow(app, task, {plan: true, anytime: true}));
  page.append(list, inlineAdd(app, block));
  completedSection(app, page, rows.filter(t => t.done), {plan: true});
  page.append(achievedControl(app, block, status));
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
