/** Blocks list and Block detail: Result, its deadline, Purpose, your verdict, progress, the ordered Plan. */
import {blockTasks, blockDue, localDay} from '../planner-state.mjs';
import {weekStart, weekFocus, resultStatus, markAchieved} from '../review-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState, areaDot, attrs, sectionHeader} from './dom.mjs';
import {duration, plural, dateText, dueInfo, timeLeft} from './format.mjs';
import {taskRow, completedSection, toggleDone, taskWhen} from './task-row.mjs';
import {openSheet, field} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {playMotion, landInPlace, waitMotion, DURATION, EASE} from '../surface-motion.mjs';
import {inlineText, focusField, selectAll, carryFocus, backHandler, persist, saveEntity, NO_ICON} from './inline-edit.mjs';

const thisWeek = app => weekFocus(app.data(), weekStart(localDay()));

/** The open Must time with the star as its legend ("★ 3 h 50 min of Musts left"), or null when no Must is open. */
export function mustLeft(status, {words = true} = {}) {
  if (!status.mustMinutes) return null;
  const node = el('span', 'must-left');
  node.append(icon('star', {fill: true, cls: 'must-legend'}), duration(status.mustMinutes) + (words ? ' of Musts left' : ''));
  return node;
}

/** Deadline with its countdown; `tight` when the open Musts need a quarter or more of the clock time left. */
export function deadline(data, block, status, now = new Date()) {
  const due = blockDue(data, block.id);
  const info = due && dueInfo(due.value, now);
  if (!info || status.achieved) return null;
  const tight = info.overdue || status.mustMinutes * 60000 * 4 >= info.at - now;
  return {...info, task: due.task, tight, text: info.overdue ? info.label
    : `${info.label} · ${timeLeft(info.at, now).replace(' ', '\u00a0')}\u00a0left`};
}

/** The collapsed top bar's subtitle on Block detail: the deadline line, so it stays in view while the Plan scrolls. */
export function blockSubtitle(app, block) {
  return deadline(app.data(), block, resultStatus(app.data(), block.id))?.text ?? '';
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
  // One facts line: the deadline (error colour when tight), the Musts' time left, tasks done. The day in the
  // deadline says how near it is, so cards carry no countdown; Block detail has it.
  const due = deadline(app.data(), block, status);
  const facts = el('span', 'card-facts tnum');
  const count = status.total ? `${status.done} of ${plural(status.total, 'task')} done` : 'No tasks in the Plan yet';
  const parts = [];
  if (due) {
    const when = el('b', 'card-due', due.label);
    when.classList.toggle('tight', due.tight);
    parts.push(when);
  }
  const must = mustLeft(status, {words: false});
  if (must) parts.push(must);
  parts.push(el('span', '', status.total ? `${status.done} of ${status.total} done` : count));
  parts.forEach((part, i) => facts.append(...(i ? [' · ', part] : [part])));
  main.append(facts);
  main.setAttribute('aria-label', `Result: ${block.title}. ${due ? due.text + '. ' : ''}`
    + `${must ? duration(status.mustMinutes) + ' of Musts left. ' : ''}${count}. Open Block`);
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
    label: text, icon: v === value ? 'check' : NO_ICON, onClick: () => onSelect(v),
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
  // One list in order of urgency; this week's Results carry a badge instead of a separate section. Cards in a row
  // from the same Project sit under one Area and Project line, as Calendar's schedule names a day once; a Project
  // filter already names it, so then there is no line at all.
  let last;
  for (const block of byDeadline(app.data(), blocks, focus)) {
    if (!state.blockFilter && block.projectId !== last) {
      const head = el('div', 'project-run');
      head.append(eyebrow(app, block));
      page.append(head);
      last = block.projectId;
    }
    page.append(blockCard(app, block, {focus: focus.has(block.id), project: false}));
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

/** A field's label with a quiet edit glyph beside it (Google Contacts, Calendar): it says the words take a tap, at
 * rest, without outlining them. The glyph goes while the field is being edited. */
function editLabel(text) {
  const label = el('span', 'fact-label');
  const glyph = icon('edit', {cls: 'label-edit'});
  glyph.setAttribute('aria-hidden', 'true');
  label.append(text, glyph);
  return label;
}

/**
 * Purpose as a labelled detail row (Block, Project, Goal, Area) that edits where it is: tap anywhere on the row
 * and the caret lands in the words; Enter or leaving saves, with Undo.
 */
export function purposePanel(app, collection, record, noun = 'Purpose') {
  const {row, copy} = factRow('favorite', {cls: 'purpose-row editable-row'});
  const text = inlineText(app, {key: `${collection}:${record.id}:purpose`, value: record.purpose ?? '', label: noun,
    placeholder: 'Add why this matters to you', multiline: false, maxLength: 2000, cls: 'purpose-text',
    onSave: words => saveEntity(app, collection, record, {purpose: words}, words ? 'Purpose saved' : 'Purpose cleared')});
  copy.append(editLabel(noun), text);
  row.addEventListener('click', event => { if (event.target !== text) focusField(text); });
  return row;
}

/** Notes, shown once there are some (or once "Add notes" asks for them); multi-line, saved on leaving. */
export function notesPanel(app, collection, record) {
  const key = `${collection}:${record.id}:notes`;
  if (!record.notes && openNotes !== key) return null;
  const {row, copy} = factRow('notes', {cls: 'notes-row editable-row'});
  const text = inlineText(app, {key, value: record.notes ?? '', label: 'Notes', placeholder: 'Add notes',
    multiline: true, maxLength: 8000, cls: 'notes-text',
    onSave: words => saveEntity(app, collection, record, {notes: words}, words ? 'Notes saved' : 'Notes cleared')});
  text.addEventListener('blur', () => {
    if (!text.textContent.trim() && !record.notes) {
      openNotes = null;
      row.remove();
    }
  });
  copy.append(editLabel('Notes'), text);
  row.addEventListener('click', event => { if (event.target !== text) focusField(text); });
  return row;
}

let openNotes = null;
/** "Add notes" from a detail page's More menu: show the Notes row and put the caret in it. */
export function revealNotes(app, collection, id) {
  openNotes = `${collection}:${id}:notes`;
  app.render();
  focusField(app.dom.work.querySelector(`[data-edit-key="${openNotes}"]`));
}

/** The detail page's large title, edited in place. An empty title is never saved. */
export function titleField(app, collection, record, label) {
  const heading = el('h2', 'detail-title-text');
  heading.append(inlineText(app, {key: `${collection}:${record.id}:title`, value: record.title, label, required: true,
    placeholder: label, cls: 'title-edit', emptyNotice: `A ${label} needs words. Kept “${record.title}”.`,
    onSave: words => saveEntity(app, collection, record, {title: words}, `${label} renamed`)}));
  return heading;
}

/** Called at the end of every detail render: Back reverts an open edit, and focus survives the re-render. */
export function finishDetail(app, page) {
  backHandler(app);
  carryFocus(page);
  if (pendingTitle) {
    const node = page.querySelector(`[data-edit-key="${pendingTitle}"]`);
    pendingTitle = null;
    if (node) node.dataset.nextKey = node.dataset.editKey.replace(/:title$/, ':purpose');
    selectAll(node);
  }
}

let pendingTitle = null;
/** A newly created Block, Project, Goal or Area opens with its placeholder title selected, ready to be typed over. */
export function focusTitleOnOpen(collection, id) {
  pendingTitle = `${collection}:${id}:title`;
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
    copy.append(el('span', 'list-headline', 'Is this Result achieved?'),
      el('span', 'list-supporting', 'Ticked tasks don’t decide it'));
    const mark = button('Mark achieved', () => achievedSheet(app, block), 'outlined-btn');
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
  // The same node for the life of the page: never rebuilt by a save, so focus, caret and typing carry straight on.
  form.dataset.keep = `plan-add:${block.id}`;
  const input = el('input');
  input.placeholder = 'Add a task';
  input.maxLength = 200;
  input.enterKeyHint = 'enter';
  input.dataset.editKey = `plan-add:${block.id}`;
  input.setAttribute('aria-label', 'Add a task to the Plan');
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !input.value) return;
    event.preventDefault();
    event.stopPropagation();
    input.value = '';
    input.blur();
  });
  const submit = iconButton('add', 'Add task to the Plan', () => form.requestSubmit());
  form.append(submit, input);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = input.value;
    if (!title.trim()) return;
    // One frame: the words become the new Plan row above the field (full opacity, where they were typed) and the
    // field empties, keeping its focus and caret, so the next words typed (however fast) go to the next task. The
    // row is shown from a copy of the data while the save runs; only the field's place moves, as the row opens.
    input.value = '';
    const words = title.trim();
    const isRow = node => node.matches('.plan-list > .task-row') && node.querySelector('.task-title')?.textContent === words;
    landInPlace(isRow);
    const op = {type: 'saveTask', fields: {title, blockId: block.id}};
    const pending = {op};
    app.pending.push(pending);
    // The field's hint and its + wait until the row has opened above it, so the two never overlap; the caret stays
    // lit meanwhile and while the next words are typed.
    const landing = form.__landing = {};
    form.dataset.landing = form.dataset.steady = 'true';
    waitMotion(80).then(() => { if (form.__landing === landing) delete form.dataset.landing; });
    waitMotion(DURATION.medium4 * 2).then(() => { if (form.__landing === landing) delete form.dataset.steady; });
    app.render();
    try {
      await persist(app, op, {label: 'Task added', pending});
    } catch {
      // Not saved: the row leaves and the words come back to the field (unless new words are already there).
      app.pending = app.pending.filter(p => p !== pending);
      app.render();
      if (input.isConnected && !input.value) input.value = title;
    }
  });
  return form;
}

/**
 * Where the Result stands, as one row by its progress ring: the deadline and its countdown (error colour, in words,
 * when overdue or tight), then tasks done and the open Must time. The Plan below shows the step that sets the deadline.
 */
function statusRow(status, due) {
  const label = status.total ? `${status.done} of ${plural(status.total, 'task')} done` : 'No tasks in the Plan yet';
  const {row, copy} = factRow(progressRing(status.done, status.total, label), {cls: 'status-row'});
  row.classList.toggle('tight', !!due?.tight);
  const must = mustLeft(status);
  const left = !must && status.plannedMinutes ? el('span', 'nowrap', duration(status.plannedMinutes) + ' left') : null;
  const parts = [due ? el('span', 'nowrap', status.total ? `${status.done} of ${status.total} done` : label) : null,
    must, left].filter(Boolean);
  copy.append(el('span', 'list-headline due-when tnum', due ? due.text : label));
  // Always two lines, so the first task added changes the words, never the height (nothing below jumps).
  if (!parts.length) {
    parts.push(el('span', '', !status.total ? 'Add the first step below'
      : status.done === status.total ? 'Every task ticked' : 'No time estimates yet'));
  }
  if (parts.length) {
    const line = el('span', 'list-supporting tnum');
    parts.forEach((part, i) => line.append(...(i ? [' · ', part] : [part])));
    copy.append(line);
  }
  return row;
}

/** Sort by time shows only while the open dated tasks are out of time order. */
function sortByTime(app, block) {
  const rows = blockTasks(app.data(), block.id);
  if (rows.filter(t => !t.done).length < 2) return null;
  const ids = planByTime(rows);
  if (ids.every((id, i) => id === rows[i].id)) return null;
  // The order is read when tapped, so a link kept across an in-place reorder never sorts a stale Plan.
  return button('Sort by time', () => app.commit({type: 'reorder', blockId: block.id,
    ids: planByTime(blockTasks(app.data(), block.id))}, {label: 'Plan sorted by time'}).catch(() => {}), 'text-btn');
}

/** The Plan header keeps the link's height whether it shows or not, so it never pushes the Plan down. */
function planHeader(app, block) {
  const header = sectionHeader('Plan', sortByTime(app, block));
  header.classList.add('plan-header');
  return header;
}

/** After a reorder saved in place: Sort by time fades in (200ms) or out (150ms) where it stands. */
function refreshPlanHeader(app, block, header) {
  if (!header.isConnected) return;
  const shown = header.querySelector('.text-btn');
  const wanted = sortByTime(app, block);
  if (!!shown === !!wanted) {
    if (shown && wanted) shown.replaceWith(wanted);
    return;
  }
  if (wanted) {
    header.append(wanted);
    // A fade (200ms, decelerating) that starts faint, so it reads as appearing, never as a pop.
    playMotion(wanted, [{opacity: 0}, {opacity: 1}], {duration: DURATION.short4, easing: EASE.standardDecelerate,
      fill: 'backwards'});
  } else {
    shown.inert = true;
    playMotion(shown, [{opacity: 1}, {opacity: 0}], {duration: DURATION.short3, easing: EASE.standardAccelerate,
      fill: 'forwards'}).then(() => shown.remove());
  }
}

/** The Area · Project line: one tap opens the Projects as a menu that moves the Block in one more tap. */
function projectLine(app, block, project) {
  const crumb = button('', null, 'crumb crumb-link project-picker');
  crumb.append(eyebrow(app, block), icon('arrow_drop_down', {cls: 'crumb-drop'}));
  crumb.setAttribute('aria-haspopup', 'menu');
  crumb.setAttribute('aria-label', `Project: ${project?.title ?? 'No project'}. Change Project`);
  crumb.addEventListener('click', () => {
    const move = (projectId, name) => () => {
      if ((block.projectId ?? null) === projectId) return;
      saveEntity(app, 'blocks', block, {projectId}, projectId ? `Moved to ${name}` : 'Moved out of its Project')
        .catch(() => {});
    };
    const items = [];
    if (project) items.push({label: 'Open ' + project.title, icon: 'folder_open', onClick: () => app.openProject(project.id)},
      {divider: true});
    for (const pr of app.p().projects) {
      items.push({label: pr.title, icon: pr.id === block.projectId ? 'check' : NO_ICON, onClick: move(pr.id, pr.title)});
    }
    items.push({label: 'No project', icon: block.projectId ? NO_ICON : 'check', onClick: move(null)});
    openMenu(crumb, items, 'Project');
  });
  return crumb;
}

export function renderBlockDetail(app, page, block) {
  const project = app.p().projects.find(pr => pr.id === block.projectId);
  const status = resultStatus(app.data(), block.id);
  const rows = blockTasks(app.data(), block.id);
  const open = rows.filter(t => !t.done);
  const head = el('div', 'detail-head');
  head.append(projectLine(app, block, project));
  page.append(head);
  page.append(titleField(app, 'blocks', block, 'Result'));
  // As on its card: the Result, its Purpose, then where it stands, then your verdict, then the Plan.
  const facts = el('div', 'block-facts');
  facts.append(purposePanel(app, 'blocks', block));
  const notes = notesPanel(app, 'blocks', block);
  if (notes) facts.append(notes);
  facts.append(statusRow(status, deadline(app.data(), block, status)));
  facts.append(achievedControl(app, block, status));
  page.append(facts);

  const header = planHeader(app, block);
  page.append(header);
  // A stable key: the Plan stays the same list whatever its first task is, so a re-render moves its rows, never it.
  const list = el('div', 'plan-list');
  list.dataset.key = 'plan';
  const onReorder = () => refreshPlanHeader(app, block, header);
  for (const task of open) list.append(taskRow(app, task, {plan: true, days: true, onReorder}));
  page.append(list, inlineAdd(app, block));
  completedSection(app, page, rows.filter(t => t.done), {plan: true, days: true});
  finishDetail(app, page);
}

export function blockMenu(app, block) {
  const items = [];
  if (!block.notes) items.push({label: 'Add notes', icon: 'notes', onClick: () => revealNotes(app, 'blocks', block.id)});
  items.push(
    {label: 'Suggest a Purpose', icon: 'auto_awesome', onClick: () => app.actions.purposeIdea(block.id)},
    {label: 'Archive Block', icon: 'archive', onClick: () => app.commit({type: 'archiveBlock', id: block.id},
      {label: 'Block archived'}).then(() => app.back()).catch(() => {})},
  );
  return items;
}
