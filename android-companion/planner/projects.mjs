/** Projects list and Project detail. Lists summarise; Block cards appear only one level down. */
import {blockTasks, tasks} from '../planner-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState, sectionHeader} from './dom.mjs';
import {nestRings} from './rings.mjs';
import {plural, doneStats} from './format.mjs';
import {openMenu} from './menu.mjs';
import {purposePanel, notesPanel, titleField, finishDetail, byDeadline, deadline, nextTaskRow, taskTally, factRow, progressRing} from './blocks.mjs';
import {resultStatus} from '../review-state.mjs';
import {saveEntity, NO_ICON} from './inline-edit.mjs';

export function projectTasks(app, project) {
  const blocks = app.activeBlocks().filter(block => block.projectId === project.id);
  const rows = tasks(app.data()).filter(task => blocks.some(block => block.id === task.blockId));
  return {blocks, rows, stats: doneStats(rows)};
}

/** One Block's tasks done of total. */
function blockStats(app, block) {
  return doneStats(tasks(app.data()).filter(task => task.blockId === block.id));
}

/** Opens and closes a card's Block list in place; only one card is open at a time. */
export function toggleProject(state, id) {
  state.projectOpen = state.projectOpen === id ? null : id;
  return state.projectOpen;
}

/** What an empty Plan says, the same on every Project surface. */
const NO_TASKS = 'No tasks yet';

/**
 * One Block as a compact row: the title across the row, one line with the deadline (hours left inside the last day)
 * and tasks done at its end as the Block card's 16dp ring and "2/7", then the Next task. The same row on an open Project card and on Project detail; the Purpose waits one tap away, on the Block.
 */
function blockLine(app, block) {
  const status = resultStatus(app.data(), block.id);
  const line = el('div', 'block-line');
  line.dataset.key = 'block-line:' + block.id;
  line.dataset.tone = app.tone(app.blockArea(block));
  const main = button('', () => app.openBlock(block.id), 'block-line-main');
  const count = status.total ? `${status.done} of ${plural(status.total, 'task')} done` : NO_TASKS;
  main.append(el('span', 'card-title', block.title));
  const due = deadline(app.data(), block, status);
  const facts = el('span', 'card-facts tnum');
  const words = due ? due.text : status.achieved ? 'Result achieved' : !status.total ? count : '';
  facts.append(el('span', 'card-due' + (due?.tight ? ' tight' : ''), words));
  if (status.total) facts.append(taskTally(status, count));
  main.append(facts);
  main.setAttribute('aria-label', `${block.title}, ${count}. ${due ? due.text + '. ' : ''}Open Block`);
  line.append(main);
  const next = status.achieved ? null : blockTasks(app.data(), block.id).find(task => !task.done);
  if (next) line.append(nextTaskRow(app, next));
  return line;
}

/**
 * The wide list's Block row, one line read as a table across every full-width Project card: its name, its next task,
 * its deadline, then tasks done as the same ring and "2/7" as every Block row.
 */
function blockRow(app, block) {
  const {done, total} = blockStats(app, block);
  const status = resultStatus(app.data(), block.id);
  const due = deadline(app.data(), block, status);
  const row = button('', () => app.openBlock(block.id), 'project-block');
  row.dataset.key = 'project-block:' + block.id;
  const name = el('span', 'project-block-name', block.title);
  const next = blockTasks(app.data(), block.id).find(task => !task.done);
  const copy = el('span', 'project-block-copy');
  // A finished Block's ring and count already say it is done, so its chip gives no second line.
  copy.append(name, ...(next || !total ? [el('span', 'project-block-next', next?.title ?? NO_TASKS)] : []));
  row.title = block.title;
  const count = `${done} of ${plural(total, 'task')} done`;
  copy.append(el('span', 'project-block-due card-due' + (due?.tight ? ' tight' : ''), due ? due.text : status.achieved ? 'Result achieved' : ''));
  row.append(copy, ...(total ? [taskTally({done, total}, count)] : []));
  row.setAttribute('aria-label', `${block.title}, ${total ? count : NO_TASKS}. ${due ? due.text + '. ' : ''}Open Block`);
  return row;
}

/** What a Project card leads with: its soonest-due Block's deadline and the next open task (that Block's first). */
function projectLead(app, project) {
  const {blocks, stats} = projectTasks(app, project);
  const ordered = byDeadline(app.data(), blocks);
  const dated = ordered.map(block => [block, deadline(app.data(), block, resultStatus(app.data(), block.id))])
    .find(([, due]) => due);
  const open = block => blockTasks(app.data(), block.id).find(task => !task.done);
  const next = (dated && open(dated[0])) ?? ordered.map(open).find(Boolean) ?? null;
  return {blocks, stats, ordered, due: dated?.[1] ?? null, next, finished: stats.total > 0 && stats.done === stats.total};
}

function projectCard(app, project, lead = projectLead(app, project)) {
  const area = app.projectArea(project);
  const {stats, ordered, due, next, finished} = lead;
  const wide = Boolean(app.api.wide?.());
  const open = wide || app.state.projectOpen === project.id;
  const card = el('article', 'project-card' + (open ? ' open' : ''));
  card.dataset.projectId = project.id;
  card.dataset.tone = app.tone(area);
  // The rings say progress, so the card's words say only what is due first; the count stays in the aria-label.
  const count = `${stats.done} of ${stats.total} tasks done`;
  const meta = due ? `${due.text}. ${count}` : count;
  const toggle = wide ? button('', () => app.openProject(project.id), 'project-toggle')
    : button('', () => { toggleProject(app.state, project.id); app.render(); }, 'project-toggle');
  if (!wide) toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', `${[project.title, area?.title].filter(Boolean).join(', ')}. ${meta}. ${wide ? 'Open Project' : open ? 'Hide Blocks' : 'Show Blocks'}`);
  const copy = el('span', 'project-copy');
  if (area) copy.append(el('span', 'project-area', area.title));
  copy.append(el('span', 'card-title', project.title));
  // Words first on the card's one text edge; the rings close the row, as every progress mark in the Projects tab does.
  const sum = stats.total && !finished ? `${stats.done}/${stats.total}` : '';
  const figures = () => {
    const span = el('span', 'project-figures tnum', sum);
    span.setAttribute('aria-hidden', 'true');
    return span;
  };
  const rings = nestRings(wide ? [stats] : ordered.map(block => blockStats(app, block)), count, {finished});
  if (wide) {
    // On wide the head is the table's first row: the Project's first deadline in the deadline column, then "8/18" by its ring.
    const tally = el('span', 'project-tally');
    tally.append(el('span', 'project-figures tnum', stats.total ? `${stats.done}/${stats.total}` : ''), rings);
    tally.firstChild.setAttribute('aria-hidden', 'true');
    toggle.append(copy, el('span', 'project-due card-due tnum' + (due?.tight ? ' tight' : ''), due?.label ?? ''), tally);
  } else {
    toggle.append(copy, rings);
    // Every folded card ends its count on one right edge: on the first deadline's line, or with no deadline on the Next
    // task's line, so the card has no line of its own for a number. Open, the count joins the Block rows' count column
    // in their form, a small ring then "4/18"; with no deadline the rows say it. A finished Project's check says done.
    if (due) {
      const facts = el('span', 'card-facts project-facts tnum');
      facts.append(el('span', 'card-due' + (due.tight ? ' tight' : ''), due.label));
      if (sum) facts.append(open ? taskTally(stats, count) : figures());
      toggle.append(facts);
    }
  }
  const head = el('div', 'project-head');
  head.append(toggle);
  if (!wide) head.append(iconButton('chevron_right', `Open ${project.title}`, () => app.openProject(project.id), {cls: 'project-open'}));
  card.append(head);
  // Closed, the card ends on the one task to do next; open, each Block row carries its own.
  if (!open && next) {
    const row = nextTaskRow(app, next);
    if (!wide && !due && sum) row.append(figures());
    card.append(row);
  }
  if (open) {
    const list = el('div', 'project-blocks');
    list.dataset.key = 'project-blocks:' + project.id;
    for (const block of ordered) list.append(wide ? blockRow(app, block) : blockLine(app, block));
    if (!ordered.length) list.append(el('p', 'quiet', 'No Blocks in this Project yet.'));
    card.append(list);
  }
  return card;
}

export function renderProjects(app, page) {
  const {state} = app;
  const filters = el('div', 'chip-row filters');
  const current = app.p().areas.find(area => area.id === state.projectFilter);
  const chip = button('', null, 'filter-chip dropdown');
  chip.classList.toggle('on', !!current);
  chip.append(el('span', '', current?.title ?? 'Area'), icon('arrow_drop_down'));
  chip.setAttribute('aria-label', 'Area: ' + (current?.title ?? 'All'));
  chip.addEventListener('click', () => openMenu(chip, [[null, 'All areas'], ...app.p().areas.map(a => [a.id, a.title])]
    .map(([value, label]) => ({label, icon: value === state.projectFilter ? 'check' : NO_ICON,
      onClick: () => { state.projectFilter = value; app.render({reset: true}); }})), 'Area'));
  filters.append(chip);
  page.append(filters);
  const wide = Boolean(app.api.wide?.());
  const projects = app.p().projects.filter(pr => !state.projectFilter || app.projectArea(pr)?.id === state.projectFilter);
  // Soonest due first, then Projects with no deadline, finished ones last; ties keep the user's order.
  const rank = ({due, finished}) => [finished ? 2 : due ? 0 : 1, due?.at.getTime() ?? Infinity];
  const leads = projects.map((project, i) => ({project, i, lead: projectLead(app, project)}))
    .map(entry => ({...entry, key: rank(entry.lead)}))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.i - b.i);
  for (const {project, lead} of leads) page.append(projectCard(app, project, lead));
  // On wide New Project ends the filter row, in view at the top, rather than after the last card.
  if (projects.length) (wide ? filters : page).append(labelButton('add', 'New Project', () => app.actions.newEntity('projects'), 'text-btn project-add'));
  if (!projects.length) {
    page.append(emptyState({symbol: 'folder', title: app.p().projects.length ? 'No Projects in this Area' : 'Connect your Blocks',
      body: 'A Project gives related Results a shared home.', action: () => app.actions.newEntity('projects'),
      label: 'New Project'}));
  }
}

/** An Area's letter in its own colour: the one mark an Area has wherever it is named. */
export function initialAvatar(app, area) {
  const avatar = el('span', 'avatar', (area.title.trim()[0] ?? '?').toUpperCase());
  avatar.dataset.tone = app.tone(area);
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}

/** Assist chips for Area › Goal. A part may carry `menu` (items) to open instead of navigating. `quiet` draws each as icon
 * and words with no outline or arrow, so Area and Goal share one line under a title. */
export function breadcrumbs(app, parts, {quiet = false} = {}) {
  const line = el('nav', 'crumbs');
  line.setAttribute('aria-label', 'Breadcrumb');
  for (const part of parts.filter(Boolean)) {
    const [label, kind, id, symbol, menu] = Array.isArray(part) ? part : [part.label, part.kind, part.id, part.icon, part.menu];
    if (!label) continue;
    const chip = button('', null, quiet ? 'crumb crumb-quiet' : 'assist-chip crumb');
    chip.append(typeof symbol === 'string' ? icon(symbol) : symbol, el('span', '', label));
    if (menu) {
      if (!quiet) chip.append(icon('arrow_drop_down', {cls: 'crumb-drop'}));
      chip.setAttribute('aria-haspopup', 'menu');
      chip.addEventListener('click', () => openMenu(chip, menu(), label));
    } else {
      chip.addEventListener('click', () => app.push(kind, id));
    }
    line.append(chip);
  }
  return line;
}

/**
 * A parent picker as an anchored menu: open the current parent, or move to another (or none) in one tap.
 * {current, options: [[id, label]], none, open, choose(id, label)}
 */
export function parentMenu({current, currentLabel, options, none, open, choose}) {
  const items = [];
  if (current != null && open) items.push({label: 'Open ' + currentLabel, icon: 'open_in_new', onClick: open}, {divider: true});
  for (const [id, label] of options) {
    items.push({label, icon: id === current ? 'check' : NO_ICON, onClick: () => { if (id !== current) choose(id, label); }});
  }
  items.push({label: none, icon: current == null ? 'check' : NO_ICON, onClick: () => { if (current != null) choose(null, none); }});
  return items;
}

export function renderProjectDetail(app, page, project) {
  const goal = app.p().goals.find(g => g.id === project.goalId);
  const area = app.projectArea(project);
  const goalMenu = () => parentMenu({current: goal?.id ?? null, currentLabel: goal?.title, none: 'No goal',
    options: app.p().goals.map(g => [g.id, g.title]), open: () => app.openGoal(goal.id),
    choose: (goalId, label) => saveEntity(app, 'projects', project, {goalId},
      goalId ? `Linked to ${label}` : 'Unlinked from its Goal').catch(() => {})});
  // The Project leads at the largest size; its Area and Goal follow on one quiet line of icon and words. On wide the
  // facts card beside the Blocks holds them instead, under the Purpose and where the Project stands, as on a Block.
  const wide = Boolean(app.api.wide?.());
  page.append(titleField(app, 'projects', project, 'Project'));
  const crumbs = breadcrumbs(app, [area && [area.title, 'areas', area.id, initialAvatar(app, area)],
    {label: goal?.title ?? 'Link a Goal', icon: 'flag', menu: goalMenu}], {quiet: true});
  crumbs.classList.add('head-crumbs');
  crumbs.dataset.tone = app.tone(area);
  const {blocks, stats, due} = projectLead(app, project);
  // On the phone the first deadline follows the Area ("Studies · Due tomorrow 11 PM") and the Goal takes the next line
  // whole, so the Project's reason is never cut. Wide says the deadline in the facts card.
  if (due && !wide) {
    const when = el('span', 'crumb-quiet crumb-due tnum' + (due.tight ? ' tight' : ''));
    when.append(el('span', '', due.label));
    crumbs.insertBefore(when, crumbs.querySelector('[aria-haspopup]'));
  }
  if (!wide) page.append(crumbs);
  const facts = el('div', 'block-facts');
  facts.dataset.tone = app.tone(area);
  // The heart marks the Purpose, as on a Block, so its row needs no label.
  facts.append(purposePanel(app, 'projects', project, 'Purpose', {labelled: false}));
  const notes = notesPanel(app, 'projects', project);
  if (notes) facts.append(notes);
  const count = stats.total ? `${stats.done} of ${plural(stats.total, 'task')} done` : 'No tasks yet';
  if (wide) facts.append(projectStatus(stats, due, count), crumbs);
  page.append(facts);
  // The Blocks header ends in the Project's small ring and "4/18" on the Block rows' count column, in the rows' own form.
  // On wide the facts card says it once instead.
  const progress = stats.total && !wide ? taskTally(stats, count) : null;
  progress?.classList.add('tnum');
  const header = sectionHeader('Blocks', progress);
  header.dataset.tone = app.tone(area);
  page.append(header);
  // Compact Block rows, soonest due first; each opens its Block, where the Purpose and Plan live.
  if (blocks.length) {
    const list = el('div', 'block-lines');
    list.dataset.key = 'block-lines:' + project.id;
    for (const block of byDeadline(app.data(), blocks)) list.append(blockLine(app, block));
    page.append(list);
  } else page.append(el('p', 'quiet', 'No Blocks in this Project yet.'));
  page.append(labelButton('add', 'Add Block', () => app.actions.newEntity('blocks', {projectId: project.id}),
    'text-btn block-add'));
  finishDetail(app, page);
}

/** Where the Project stands, as a Block's status row: its first deadline by the Project's ring, then tasks done. */
function projectStatus(stats, due, count) {
  const {row, copy} = factRow(progressRing(stats.done, stats.total, count), {cls: 'status-row'});
  row.classList.toggle('tight', !!due?.tight);
  copy.append(el('span', 'list-headline due-when tnum', due ? due.text : count));
  if (due) copy.append(el('span', 'list-supporting tnum', count));
  return row;
}
