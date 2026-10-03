/** Projects list and Project detail. Lists summarise; Block cards appear only one level down. */
import {tasks} from '../planner-state.mjs';
import {el, icon, button, labelButton, emptyState, progress, areaDot, sectionHeader} from './dom.mjs';
import {plural, doneStats} from './format.mjs';
import {openMenu} from './menu.mjs';
import {blockCard, purposePanel, notesPanel, titleField, finishDetail, byDeadline, factRow, progressRing} from './blocks.mjs';
import {saveEntity, NO_ICON} from './inline-edit.mjs';

function projectTasks(app, project) {
  const blocks = app.activeBlocks().filter(block => block.projectId === project.id);
  const rows = tasks(app.data()).filter(task => blocks.some(block => block.id === task.blockId));
  return {blocks, rows, stats: doneStats(rows)};
}

function projectCard(app, project) {
  const area = app.projectArea(project);
  const {blocks, stats} = projectTasks(app, project);
  const card = button('', () => app.openProject(project.id), 'project-card');
  card.dataset.projectId = project.id;
  card.dataset.tone = app.tone(area);
  const eyebrow = el('span', 'eyebrow');
  eyebrow.append(areaDot(app.tone(area)), el('span', '', area?.title ?? 'No area'));
  card.append(eyebrow, el('span', 'card-title', project.title));
  card.append(el('span', 'card-purpose', project.purpose || 'Add a Purpose for this Project'));
  if (stats.total) card.append(progress(stats.done, stats.total, `${stats.done} of ${stats.total} tasks done`));
  const meta = [plural(blocks.length, 'Block'), stats.total ? `${stats.done} of ${plural(stats.total, 'task')} done` : '']
    .filter(Boolean).join(' · ');
  card.append(el('span', 'card-meta tnum', meta));
  card.setAttribute('aria-label', `Project: ${project.title}. ${meta}. Open Project`);
  return card;
}

export function renderProjects(app, page) {
  const {state} = app;
  const all = tasks(app.data());
  const stats = doneStats(all);
  const blocks = app.activeBlocks();
  page.append(el('p', 'stat-line tnum', [plural(app.p().projects.length, 'Project'), plural(blocks.length, 'Block'),
    `${stats.done} of ${plural(stats.total, 'task')} done`].join(' · ')));
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
  for (const project of projects) page.append(projectCard(app, project));
  if (!projects.length) {
    page.append(emptyState({symbol: 'folder', title: app.p().projects.length ? 'No Projects in this Area' : 'Connect your Blocks',
      body: 'A Project gives related Results a shared home.', action: () => app.actions.newEntity('projects'),
      label: 'New Project'}));
  }
}

/** Assist chips for Area › Goal. A part may carry `menu` (items) to open instead of navigating. */
export function breadcrumbs(app, parts) {
  const line = el('nav', 'crumbs');
  line.setAttribute('aria-label', 'Breadcrumb');
  for (const part of parts.filter(Boolean)) {
    const [label, kind, id, symbol, menu] = Array.isArray(part) ? part : [part.label, part.kind, part.id, part.icon, part.menu];
    if (!label) continue;
    const chip = button('', null, 'assist-chip crumb');
    chip.append(icon(symbol), el('span', '', label));
    if (menu) {
      chip.append(icon('arrow_drop_down', {cls: 'crumb-drop'}));
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
  page.append(breadcrumbs(app, [[area?.title, 'areas', area?.id, 'spa'],
    {label: goal?.title ?? 'Link a Goal', icon: 'flag', menu: goalMenu}]));
  page.append(titleField(app, 'projects', project, 'Project'));
  const facts = el('div', 'block-facts');
  facts.append(purposePanel(app, 'projects', project));
  const notes = notesPanel(app, 'projects', project);
  if (notes) facts.append(notes);
  const {blocks, stats} = projectTasks(app, project);
  if (stats.total) {
    const count = `${stats.done} of ${plural(stats.total, 'task')} done`;
    const {row, copy} = factRow(progressRing(stats.done, stats.total, count), {cls: 'progress-row'});
    copy.append(el('span', 'list-headline tnum', count), el('span', 'list-supporting', plural(blocks.length, 'Block')));
    facts.append(row);
  }
  page.append(facts);
  page.append(sectionHeader('Blocks', el('small', '', blocks.length ? String(blocks.length) : '')));
  // The page already names the Project, so its Block cards leave that line out.
  for (const block of byDeadline(app.data(), blocks)) page.append(blockCard(app, block, {project: false}));
  if (!blocks.length) page.append(el('p', 'quiet', 'No Blocks in this Project yet.'));
  page.append(labelButton('add', 'Add Block', () => app.actions.newEntity('blocks', {projectId: project.id}),
    'outlined-btn wide'));
  finishDetail(app, page);
}
