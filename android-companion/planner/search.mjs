/** Full-screen search, as in Google Tasks and Calendar: the query lives in the top bar. */
import {tasks} from '../planner-state.mjs';
import {el, iconButton, listItem, sectionHeader, emptyState} from './dom.mjs';
import {taskRow} from './task-row.mjs';

let query = '';

export function searchBar(app, bar) {
  bar.className = 'top-bar search-bar';
  bar.append(iconButton('arrow_back', 'Back', () => app.back()));
  const input = el('input', 'search-input');
  input.type = 'search';
  input.placeholder = 'Search tasks, Blocks, Projects';
  input.setAttribute('aria-label', 'Search tasks, Blocks, Projects and Goals');
  input.value = query;
  input.addEventListener('input', () => {
    query = input.value;
    clear.hidden = !query;
    drawResults(app, app.dom.work.querySelector('.search-results'));
  });
  const clear = iconButton('close', 'Clear search', () => {
    query = '';
    input.value = '';
    clear.hidden = true;
    input.focus();
    drawResults(app, app.dom.work.querySelector('.search-results'));
  });
  clear.hidden = !query;
  bar.append(input, clear);
  requestAnimationFrame(() => { if (!query) input.focus(); });
}

function matches(item, q) {
  return (item.title + ' ' + (item.purpose ?? '') + ' ' + (item.notes ?? '')).toLocaleLowerCase().includes(q);
}

function drawResults(app, host) {
  if (!host) return;
  host.replaceChildren();
  const q = query.trim().toLocaleLowerCase();
  if (!q) {
    host.append(listItem({leading: 'inbox', headline: 'Inbox', supporting: 'Tasks not in a Block yet',
      onClick: () => app.actions.inbox()}));
    host.append(listItem({leading: 'mic', headline: 'Capture', supporting: 'Say or type what is on your mind',
      onClick: () => app.capture()}));
    return;
  }
  const p = app.p();
  const groups = [
    ['Blocks', 'stacks', app.activeBlocks(), b => app.openBlock(b.id), b => b.purpose],
    ['Projects', 'folder', p.projects, pr => app.openProject(pr.id), pr => pr.purpose],
    ['Goals', 'flag', p.goals, g => app.openGoal(g.id), g => String(g.year)],
    ['Areas', 'spa', p.areas, a => app.openArea(a.id), a => a.purpose],
  ];
  let count = 0;
  const found = tasks(app.data()).filter(task => matches(task, q)).slice(0, 30);
  if (found.length) {
    host.append(sectionHeader('Tasks'));
    for (const task of found) {
      host.append(taskRow(app, task, {context: app.context(task).block?.title ?? 'No block'}));
    }
    count += found.length;
  }
  for (const [label, symbol, items, open, supporting] of groups) {
    const hits = items.filter(item => matches(item, q)).slice(0, 30);
    if (!hits.length) continue;
    host.append(sectionHeader(label));
    for (const item of hits) {
      host.append(listItem({leading: symbol, headline: item.title, supporting: supporting(item) ?? '',
        onClick: () => open(item)}));
    }
    count += hits.length;
  }
  if (!count) host.append(emptyState({symbol: 'search_off', title: 'No matches', body: 'Try another word.'}));
}

export function renderSearch(app, page) {
  const results = el('div', 'search-results');
  page.append(results);
  drawResults(app, results);
}

