/** Full-screen search, as in Google Tasks and Calendar: the query lives in the top bar. */
import {tasks, localDay} from '../planner-state.mjs';
import {el, button, iconButton, listItem, sectionHeader, emptyState} from './dom.mjs';
import {taskRow, taskWhen} from './task-row.mjs';

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

const wordChar = /[\p{L}\p{N}]/u;
/** Where the query starts a word in `text`, as the Block add field matches; a hit inside a word is not one. */
export function wordStarts(text, q) {
  const lower = text.toLocaleLowerCase(), found = [];
  if (!q) return found;
  for (let hit = lower.indexOf(q); hit !== -1; hit = lower.indexOf(q, hit + 1)) {
    if (hit && wordChar.test(lower[hit - 1])) continue;
    found.push(hit);
    hit += q.length - 1;
  }
  return found;
}

/** Bolds each word the query starts in a row's title; a match inside a word stays listed but plain. */
function markHits(node, q) {
  if (!node) return;
  const text = node.textContent;
  const parts = [];
  let at = 0;
  for (const hit of wordStarts(text, q)) {
    if (hit > at) parts.push(text.slice(at, hit));
    parts.push(el('strong', 'search-hit', text.slice(hit, hit + q.length)));
    at = hit + q.length;
  }
  if (!parts.length) return;
  if (at < text.length) parts.push(text.slice(at));
  node.replaceChildren(...parts);
}

const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, {numeric: true, sensitivity: 'base'});
/** Display order only, the same on phone and website: open before done, Musts first, then by title. Nothing is dropped. */
export const searchOrder = (a, b) => !!a.done - !!b.done || (!a.done && !!b.must - !!a.must) || byTitle(a, b);
/** Display order only: within a run, titles with a word that starts with the query come before other matches. */
export const wordFirst = (list, q) => list.map((item, i) => [item, wordStarts(item.title, q).length ? 0 : 1, i])
  .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([item]) => item);

/** Open Musts due today or earlier, soonest first: what Search offers before a word is typed. */
function mustsToday(app) {
  const today = localDay();
  const day = task => { const when = taskWhen(task); return when ? localDay(new Date(when)) : task.plannedDate ?? null; };
  return tasks(app.data()).filter(task => task.must && !task.done && day(task) && day(task) <= today)
    .sort((a, b) => (taskWhen(a) ?? Infinity) - (taskWhen(b) ?? Infinity) || byTitle(a, b));
}

function drawResults(app, host) {
  if (!host) return;
  host.replaceChildren();
  const q = query.trim().toLocaleLowerCase();
  const row = task => taskRow(app, task, {context: app.context(task).block?.title ?? ''});
  if (!q) {
    const musts = mustsToday(app);
    /** Under "Musts for today" every row is a Must, so the heading says it and the rows drop the star. */
    const must = task => { const node = row(task); node.querySelector('.must-mark')?.remove(); return node; };
    if (musts.length) host.append(sectionHeader('Musts for today'), ...musts.map(must));
    host.append(sectionHeader('Go to'),
      listItem({leading: 'inbox', headline: 'Inbox', onClick: () => app.actions.inbox()}),
      listItem({leading: 'mic', headline: 'Capture', onClick: () => app.capture()}));
    return;
  }
  const p = app.p();
  const groups = [
    ['Blocks', 'stacks', app.activeBlocks(), b => app.openBlock(b.id), b => b.purpose],
    ['Projects', 'folder', p.projects, pr => app.openProject(pr.id), pr => pr.purpose],
    ['Goals', 'flag', p.goals, g => app.openGoal(g.id), g => String(g.year), true],
    ['Areas', 'spa', p.areas, a => app.openArea(a.id), a => a.purpose],
  ];
  const found = tasks(app.data()).filter(task => matches(task, q)).sort(searchOrder).slice(0, 30);
  const hit = task => { const node = row(task); markHits(node.querySelector('.task-title'), q); return node; };
  /** A done row is its title alone: its time and Block no longer help to find it. */
  const done = task => { const node = hit(task); node.querySelector('.task-supporting')?.remove(); return node; };
  const open = found.filter(task => !task.done);
  if (open.length) host.append(sectionHeader('Tasks'),
    ...[...wordFirst(open.filter(task => task.must), q), ...wordFirst(open.filter(task => !task.must), q)].map(hit));
  let count = found.length;
  // On wide a short fact (a Goal's year) ends the title's line rather than standing alone on a second line.
  const wide = Boolean(app.api.wide?.());
  for (const [label, symbol, items, go, supporting, short] of groups) {
    const hits = wordFirst(items.filter(item => matches(item, q)).slice(0, 30), q);
    if (!hits.length) continue;
    host.append(sectionHeader(label));
    for (const item of hits) {
      const meta = supporting(item) ?? '';
      const node = listItem({leading: symbol, headline: item.title, onClick: () => go(item),
        ...(short && wide ? {trailing: el('span', 'list-meta tnum', meta)} : {supporting: meta})});
      markHits(node.querySelector('.list-headline'), q);
      host.append(node);
    }
    count += hits.length;
  }
  const finished = wordFirst(found.filter(task => task.done), q);
  if (finished.length) {
    // Done tasks rarely answer a search, so two show and the rest wait behind one button.
    const shown = finished.slice(0, 2).map(done);
    host.append(sectionHeader('Done'), ...shown);
    const rest = finished.slice(2);
    if (rest.length) {
      const more = button(`Show ${rest.length} more`, () => more.replaceWith(...rest.map(done)), 'text-btn show-all search-more');
      host.append(more);
    }
  }
  if (!count) host.append(emptyState({symbol: 'search_off', title: 'No matches', body: 'Try another word.'}));
}

export function renderSearch(app, page) {
  const results = el('div', 'search-results');
  page.append(results);
  drawResults(app, results);
}
