/** Projects list and Project detail. Lists summarise; Block cards appear only one level down. */
import {blockTasks, tasks} from '../planner-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState} from './dom.mjs';
import {segmentRing, nestRings} from './rings.mjs';
import {plural, doneStats} from './format.mjs';
import {openMenu} from './menu.mjs';
import {purposePanel, notesPanel, titleField, finishDetail, byDeadline, deadline, nextTaskRow} from './blocks.mjs';
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

/** A Block at a glance, the same at every width: when it is due, then the next open task, on one line. A Block with no
 * tasks says so; an achieved one says that instead of a next task. */
function blockGlance(app, block, status, cls) {
  const due = deadline(app.data(), block, status);
  const next = status.achieved ? null : blockTasks(app.data(), block.id).find(task => !task.done);
  const line = el('span', cls + ' tnum');
  if (due) line.append(el('span', 'card-due' + (due.tight ? ' tight' : ''), due.text));
  const words = next?.title ?? (status.achieved ? 'Result achieved' : status.total ? '' : 'No tasks yet');
  if (words) line.append(el('span', next ? 'glance-next' : 'glance-state', words));
  return {line, due, next};
}

/**
 * One Block as a compact row: its tasks as a segment ring in the leading column, the title, then one line with the
 * deadline and the next task. The same row on an open Project card and on Project detail; the Plan waits one tap away.
 */
function blockLine(app, block) {
  const status = resultStatus(app.data(), block.id);
  const line = el('div', 'block-line');
  line.dataset.key = 'block-line:' + block.id;
  line.dataset.tone = app.tone(app.blockArea(block));
  const main = button('', () => app.openBlock(block.id), 'block-line-main');
  const count = status.total ? `${status.done} of ${plural(status.total, 'task')} done` : 'No tasks in the Plan yet';
  const {line: glance, due, next} = blockGlance(app, block, status, 'block-glance');
  const copy = el('span', 'block-line-copy');
  copy.append(el('span', 'card-title', block.title), glance);
  main.append(status.total ? segmentRing(status.done, status.total) : el('span', 'block-line-mark'), copy);
  main.setAttribute('aria-label', `${block.title}, ${count}. ${due ? due.text + '. ' : ''}${next ? `Next: ${next.title}. ` : ''}Open Block`);
  line.append(main);
  return line;
}

/** The wide list's Block chip: its segment ring, name, the same due-and-next line as the phone row, and tasks done. */
function blockRow(app, block) {
  const {done, total} = blockStats(app, block);
  const row = button('', () => app.openBlock(block.id), 'project-block');
  row.dataset.key = 'project-block:' + block.id;
  const name = el('span', 'project-block-name', block.title);
  const next = blockTasks(app.data(), block.id).find(task => !task.done);
  const copy = el('span', 'project-block-copy');
  copy.append(name, blockGlance(app, block, resultStatus(app.data(), block.id), 'project-block-next').line);
  row.title = block.title;
  row.append(...(total ? [segmentRing(done, total), copy, el('span', 'project-block-count tnum', `${done}/${total}`)] : [copy]));
  row.setAttribute('aria-label', `${block.title}, ${done} of ${plural(total, 'task')} done. ${next ? `Next: ${next.title}. ` : ''}Open Block`);
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
  const count = `${stats.done} of ${stats.total} tasks done`;
  const meta = due ? `${due.text}. ${count}` : count;
  const toggle = wide ? button('', () => app.openProject(project.id), 'project-toggle')
    : button('', () => { toggleProject(app.state, project.id); app.render(); }, 'project-toggle');
  if (!wide) toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', `${[project.title, area?.title].filter(Boolean).join(', ')}. ${meta}. ${wide ? 'Open Project' : open ? 'Hide Blocks' : 'Show Blocks'}`);
  // Every card leads with its Area, so titles share one line; an open card leaves the deadline to its Block rows, and a
  // card with no deadline shows none (its rings already show tasks done).
  const copy = el('span', 'project-copy');
  copy.append(el('span', 'project-area' + (area ? '' : ' no-area'), area?.title ?? 'No Area'), el('span', 'card-title', project.title));
  if (due && !open) copy.append(el('span', 'card-due tnum' + (due.tight ? ' tight' : ''), due.label));
  toggle.append(nestRings(wide ? [stats] : ordered.map(block => blockStats(app, block)), count, {finished}), copy);
  const head = el('div', 'project-head');
  head.append(toggle);
  if (!wide) head.append(iconButton('chevron_right', `Open ${project.title}`, () => app.openProject(project.id), {cls: 'project-open'}));
  card.append(head);
  // Closed, the card ends on the one task to do next; open, each Block row carries its own.
  if (!open && next) card.append(nextTaskRow(app, next));
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
  const projects = app.p().projects.filter(pr => !state.projectFilter || app.projectArea(pr)?.id === state.projectFilter);
  // Soonest due first, then Projects with no deadline, finished ones last; ties keep the user's order.
  const rank = ({due, finished}) => [finished ? 2 : due ? 0 : 1, due?.at.getTime() ?? Infinity];
  const leads = projects.map((project, i) => ({project, i, lead: projectLead(app, project)}))
    .map(entry => ({...entry, key: rank(entry.lead)}))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.i - b.i);
  for (const {project, lead} of leads) page.append(projectCard(app, project, lead));
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
  // The Project leads at the largest size; its Area and Goal follow on one quiet line of icon and words.
  page.append(titleField(app, 'projects', project, 'Project'));
  const crumbs = breadcrumbs(app, [area && [area.title, 'areas', area.id, initialAvatar(app, area)],
    {label: goal?.title ?? 'Link a Goal', icon: 'flag', menu: goalMenu}], {quiet: true});
  crumbs.classList.add('head-crumbs');
  crumbs.dataset.tone = app.tone(area);
  page.append(crumbs);
  const facts = el('div', 'block-facts');
  facts.dataset.tone = app.tone(area);
  // The heart marks the Purpose, as on a Block, so its row needs no label.
  facts.append(purposePanel(app, 'projects', project, 'Purpose', {labelled: false}));
  const notes = notesPanel(app, 'projects', project);
  if (notes) facts.append(notes);
  page.append(facts);
  // The Blocks follow as one group, soonest due first, each row with its own ring, so no heading or summary repeats them;
  // the group ends in Add Block on the rows' text edge.
  const {blocks} = projectTasks(app, project);
  const list = el('div', 'block-lines');
  list.dataset.key = 'block-lines:' + project.id;
  list.dataset.tone = app.tone(area);
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Blocks');
  for (const block of byDeadline(app.data(), blocks)) list.append(blockLine(app, block));
  const add = el('div', 'block-line block-add');
  add.append(labelButton('add', 'Add Block', () => app.actions.newEntity('blocks', {projectId: project.id}), 'block-line-main'));
  list.append(add);
  page.append(list);
  finishDetail(app, page);
}
