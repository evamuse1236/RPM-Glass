/** Projects list and Project detail. Lists summarise; Block cards appear only one level down. */
import {tasks} from '../planner-state.mjs';
import {el, icon, button, labelButton, emptyState, progress, areaDot, sectionHeader} from './dom.mjs';
import {plural, doneStats} from './format.mjs';
import {openMenu} from './menu.mjs';
import {blockCard, purposePanel, byDeadline} from './blocks.mjs';

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
    .map(([value, label]) => ({label, icon: value === state.projectFilter ? 'check' : '',
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

/** Assist chips for Area › Goal. */
export function breadcrumbs(app, parts) {
  const line = el('nav', 'crumbs');
  line.setAttribute('aria-label', 'Breadcrumb');
  for (const [label, kind, id, symbol] of parts.filter(([label]) => !!label)) {
    const chip = button('', () => app.push(kind, id), 'assist-chip crumb');
    chip.append(icon(symbol), el('span', '', label));
    line.append(chip);
  }
  return line;
}

export function renderProjectDetail(app, page, project) {
  const goal = app.p().goals.find(g => g.id === project.goalId);
  const area = app.projectArea(project);
  page.append(breadcrumbs(app, [[area?.title, 'areas', area?.id, 'spa'], [goal?.title, 'goals', goal?.id, 'flag']]));
  page.append(el('h2', 'detail-title-text', project.title));
  page.append(purposePanel(project.purpose, () => app.actions.editEntity('projects', project.id)));
  const {blocks, stats} = projectTasks(app, project);
  if (stats.total) {
    const summary = el('div', 'progress-summary');
    summary.append(progress(stats.done, stats.total, `${stats.done} of ${stats.total} tasks done`));
    const labels = el('div', 'progress-labels tnum');
    labels.append(el('span', '', `${stats.done} of ${plural(stats.total, 'task')} done`),
      el('span', '', plural(blocks.length, 'Block')));
    summary.append(labels);
    page.append(summary);
  }
  page.append(sectionHeader('Blocks', el('small', '', blocks.length ? String(blocks.length) : '')));
  for (const block of byDeadline(app.data(), blocks)) page.append(blockCard(app, block));
  if (!blocks.length) page.append(el('p', 'quiet', 'No Blocks in this Project yet.'));
  page.append(labelButton('add', 'Add Block', () => app.actions.newEntity('blocks', {projectId: project.id}),
    'outlined-btn wide'));
}
