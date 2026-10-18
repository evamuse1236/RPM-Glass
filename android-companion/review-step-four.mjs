import {setMust, focusCandidates} from './review-state.mjs';
import {blockTasks, shiftDay} from './planner-state.mjs';
import {dueInfo, duration, plural} from './planner/format.mjs';
import {el, icon, button, capital, whenText, heading, emptyState, factsLine, dueFact, mustFact} from './review-ui.mjs';
import {focusCheck} from './review-focus.mjs';
import {weekCard, clashState, clashRow} from './review-week-card.mjs';

/* ---------- step 4: this week's Results ---------- */
export function stepFour(api) {
  const {ui} = api;
  const now = api.now();
  ui.focusBase ??= [...ui.focus];
  const candidates = focusCandidates(api.data(), api.week, ui.focusBase);
  ui.focus = ui.focus.filter(id => candidates.some(c => c.blockId === id));
  const chosen = candidates.filter(c => ui.focus.includes(c.blockId));
  const clashes = api.clashes();
  const missed = unpickedDue(api, candidates, now);
  // Nothing blocks Finish; the counts say what is still open.
  const open = clashes.filter(c => clashState(api, c).state === 'open').length;
  const todo = [open && `${plural(open, 'clash', 'clashes')} to decide`, missed.size && `${plural(missed.size, 'Result')} due this week not picked`].filter(Boolean);
  const [title] = heading("Pick this week's Results", '');
  const sub = el('p', 'wr-sub tnum', `${chosen.length} picked · aim for 3 to 5.` + (todo.length ? ` ${capital(todo.join(' · '))}.` : ''));
  sub.setAttribute('aria-live', 'polite');
  const parts = [title, sub];
  if (!candidates.length) {
    parts.push(emptyState('flag', 'No Results yet', 'Go back a step and give a task a new Result, then pick it here.'));
    return parts;
  }
  // The choice first: one quiet list, nearest deadline first. Results with nothing left to do wait behind one row.
  const idle = candidates.filter(c => c.total === c.done && !ui.focusBase.includes(c.blockId));
  parts.push(resultList(api, candidates.filter(c => !idle.includes(c)), now, missed, "This week's Results"));
  if (idle.length) {
    const toggle = button('', () => { ui.showIdle = !ui.showIdle; api.render(); }, 'wr-idle-toggle');
    toggle.setAttribute('aria-expanded', String(ui.showIdle));
    toggle.dataset.key = 'idle';
    toggle.append(el('span', 'wr-label', `${plural(idle.length, 'Result')} with no open tasks`), icon(ui.showIdle ? 'expand_less' : 'expand_more'));
    parts.push(toggle);
    if (ui.showIdle) parts.push(resultList(api, idle, now, missed, 'Results with no open tasks'));
  }
  // Then what the week holds: a clash to decide, and whether the picked Results' Must time fits.
  if (clashes.length) {
    const list = el('ul', 'wr-risks');
    list.setAttribute('aria-label', 'Calendar clashes');
    list.append(...clashes.map(c => clashRow(api, c)));
    parts.push(list);
  }
  parts.push(weekCard(api, chosen, candidates, now));
  return parts;
}

/** Once picking has started, Results due by Sunday (or overdue) with open tasks that aren't picked: flagged on their row. */
function unpickedDue(api, candidates, now) {
  const end = new Date(shiftDay(api.week, 7) + 'T00:00');
  if (!api.ui.focus.length) return new Set();
  return new Set(candidates.filter(c => !api.ui.focus.includes(c.blockId) && c.due && c.done < c.total && dueInfo(c.due, now).at < end)
    .map(c => c.blockId));
}

/** Results as one list of rows: a checkbox picks, the row opens its Purpose and tasks. Only meaning carries colour. */
function resultList(api, rows, now, missed, label) {
  const list = el('ul', 'wr-list wr-results');
  list.setAttribute('aria-label', label);
  for (const c of rows) list.append(resultRow(api, c, now, missed.has(c.blockId)));
  return list;
}

function resultRow(api, c, now, flagged) {
  const {ui} = api;
  const open = ui.expanded === c.blockId;
  const item = el('li', 'wr-result' + (ui.focus.includes(c.blockId) ? ' picked' : ''));
  const check = focusCheck(api, c.blockId, c.title);
  check.setAttribute('aria-label', `Pick "${c.title}"`);
  const main = button('', () => { ui.expanded = open ? null : c.blockId; api.render(); }, 'wr-result-main');
  main.setAttribute('aria-expanded', String(open));
  main.dataset.key = 'open:' + c.blockId;
  const text = el('span', 'wr-result-text');
  text.append(el('span', 'wr-result-title', c.title));
  // One facts line, as on the Blocks list: the deadline, the Must time (or why there is none), Carried, Not picked.
  const left = c.total - c.done;
  const info = c.due ? dueInfo(c.due, now) : null;
  const must = !c.total ? 'No tasks yet' : !left ? 'All tasks done' : c.mustMinutes ? mustFact(c.mustMinutes)
    : info && (info.soon || info.overdue) ? el('span', 'wr-warn', 'No Must set') : null;
  const facts = el('span', 'wr-facts tnum');
  facts.append(...factsLine([dueFact(c.due, now), must, !c.due && left ? `${c.done} of ${c.total} done` : null,
    c.carried ? 'Carried from last week' : null]));
  text.append(facts);
  if (flagged) text.append(el('span', 'wr-flag', 'Due this week · not picked'));
  main.append(text, icon(open ? 'expand_less' : 'expand_more'));
  main.setAttribute('aria-label', `${c.title}. ${open ? 'Hide' : 'Show'} its Purpose and tasks`);
  const row = el('div', 'wr-result-row');
  row.append(check, main);
  item.append(row);
  if (open) {
    const more = el('div', 'wr-result-more');
    if (c.purpose) more.append(el('p', 'wr-result-purpose', c.purpose));
    more.append(mustList(api, c.blockId, now));
    item.append(more);
  }
  return item;
}

/** A Result's open tasks, each row toggling Must: the Must time above updates as they change, with Undo. */
function mustList(api, blockId, now) {
  const open = blockTasks(api.data(), blockId).filter(t => !t.done);
  const box = el('div', 'wr-musts');
  const head = el('div', 'wr-musts-head');
  const plan = button('Open Plan', () => api.openBlock(blockId), 'wr-btn-text wr-open-block');
  head.append(el('span', '', open.length ? 'Tap the tasks that must happen' : 'No open tasks. Add the next step to the Plan.'), plan);
  box.append(head);
  for (const task of open) {
    // The whole row toggles Must (like a checklist); only a Must shows its star, so nothing reads as "favourite".
    const label = task.must ? 'Must. Tap to unmark' : 'Mark as Must';
    const toggle = () => api.run(d => setMust(d, task.id, !task.must), task.must ? 'No longer a Must' : 'Marked Must');
    const row = button('', toggle, 'wr-must-row' + (task.must ? ' on' : ''));
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', String(!!task.must));
    row.setAttribute('aria-label', `${label}: ${task.title ?? task.raw}`);
    row.dataset.key = 'must:' + task.id;
    const star = el('span', 'wr-star');
    if (task.must) star.append(Object.assign(icon('star', true), {className: 'ms fill must'}));
    // The title, then its day on its own quiet line, so a time never wraps away from its day.
    const when = whenText(task, now);
    const text = el('span', 'wr-must-text');
    text.append(el('span', 'wr-must-title', task.title ?? task.raw));
    if (when) text.append(el('span', 'wr-must-when tnum' + (when.overdue ? ' overdue' : ''), when.text));
    row.append(star, text, el('span', 'wr-must-min tnum', task.minutes == null ? '–' : duration(task.minutes)));
    box.append(row);
  }
  return box;
}
