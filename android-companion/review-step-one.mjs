import {reviewSummary, leftoverChoice} from './review-state.mjs';
import {plural} from './planner/format.mjs';
import {VERDICT_RECEIPTS, CHOICES, el, icon, button, dueChip, heading, emptyState, sectionHead, factsLine, dueFact, mustFact} from './review-ui.mjs';
import {openMenu} from './planner/menu.mjs';
import {focusCheck, setFocus} from './review-focus.mjs';
import {DECK_VERDICTS, deckOf, deckTally, resultDeck} from './review-deck.mjs';

/* ---------- step 1: last week's Results ---------- */
export function stepOne(api) {
  const summary = reviewSummary(api.data(), api.week, api.now());
  const judged = summary.results.filter(r => !r.running);
  const running = summary.results.filter(r => r.running);
  const parts = heading("How did last week's Results go?");
  if (!summary.results.length) {
    const body = "Once you choose this week's Results in step 4, next week's review starts here.";
    parts.push(emptyState('history', 'Nothing to look back on yet', body));
    return parts;
  }
  if (judged.length) {
    const deck = deckOf(judged);
    const wins = judged.filter(r => r.verdict === 'achieved');
    parts.push(deckTally(judged));
    if (deck.length) parts.push(...resultDeck(api, summary, judged));
    else {
      if (wins.length) parts.push(winsCard(wins));
      parts.push(sectionHead('Your verdicts', judged.length));
      for (const result of judged) parts.push(resultCard(api, summary, result));
    }
  }
  if (running.length) parts.push(...runningList(api, running));
  return parts;
}

/** A decided Result once the deck is done: its verdict (changeable), evidence for a win, Carry and the leftover tasks. */
function resultCard(api, summary, result) {
  const win = result.verdict === 'achieved';
  const card = el('article', 'wr-card wr-result');
  card.append(el('h3', 'wr-card-title', result.title));
  if (result.purpose) card.append(el('p', 'wr-card-purpose', result.purpose));
  card.append(progressMeta(result, win ? null : result.due, api.now()));
  card.append(verdictControl(api, summary, result));
  if (win) card.append(evidenceField(api, summary, result));
  if (result.verdict === 'partly' || result.verdict === 'notyet') card.append(carryRow(api, result), leftoverList(api, result));
  else if (win && result.leftovers.length) {
    card.append(el('p', 'wr-card-note', `${plural(result.leftovers.length, 'open task')} stay with this Result.`));
  }
  return card;
}

/** "2 of 7 tasks done" with a thin bar, so 5 of 5 reads differently from 1 of 3, and the deadline if it has one. */
function progressMeta(result, due, now) {
  const row = el('div', 'wr-progress-row');
  if (result.total) {
    const bar = el('span', 'wr-mini-bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('span');
    fill.style.setProperty('--value', String(result.done / result.total));
    bar.append(fill);
    row.append(bar);
  }
  row.append(el('span', 'wr-progress-text tnum', result.total ? `${result.done} of ${plural(result.total, 'task')} done` : 'No tasks'));
  const chip = due && dueChip(due, now);
  if (chip) row.append(chip);
  return row;
}

/** One segmented button per Result, in the deck's order (Not yet, Partly, Achieved). The chosen one carries the tint. */
function verdictControl(api, summary, result) {
  const group = el('div', 'wr-seg wr-verdicts');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', `Did "${result.title}" happen?`);
  for (const [value, label] of DECK_VERDICTS) {
    const selected = result.verdict === value;
    const option = button('', () => {
      if (selected) return;
      const achieved = value === 'achieved';
      api.run({type: 'markAchieved', id: result.blockId, achieved, week: summary.lastWeek, verdict: value}, VERDICT_RECEIPTS[value]);
    }, 'wr-seg-btn' + (selected ? ' sel' : ''));
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(selected));
    option.dataset.key = `verdict:${result.blockId}:${value}`;
    option.append(el('span', 'wr-label', label));
    group.append(option);
  }
  return group;
}

function evidenceField(api, summary, result) {
  const wrap = el('label', 'wr-field');
  wrap.append(el('span', 'wr-field-label', 'What made it work? (optional)'));
  const input = el('input', 'wr-input');
  input.type = 'text';
  input.maxLength = 300;
  input.value = result.evidence;
  input.placeholder = 'One line to remember next time';
  input.enterKeyHint = 'done';
  input.dataset.key = 'evidence:' + result.blockId;
  const save = () => {
    const evidence = input.value.trim();
    if (evidence === result.evidence) return;
    api.run({type: 'markAchieved', id: result.blockId, achieved: true, evidence, week: summary.lastWeek}, 'Saved with the win');
  };
  input.addEventListener('change', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  wrap.append(input);
  return wrap;
}

function carryRow(api, result) {
  const row = focusCheck(api, result.blockId, result.title, 'wr-check-row');
  row.setAttribute('aria-label', `Carry "${result.title}" into this week`);
  row.append(el('span', 'wr-label', 'Carry into this week'));
  return row;
}

/** Results whose deadline is still ahead: nothing to judge yet, only whether to carry them (one tap for all). */
function runningList(api, running) {
  const now = api.now();
  const list = el('ul', 'wr-list wr-running');
  list.setAttribute('aria-label', 'Still running');
  for (const r of running) {
    const item = el('li');
    const row = focusCheck(api, r.blockId, r.title, 'wr-check-row wr-run');
    row.setAttribute('aria-label', `Carry "${r.title}" into this week`);
    const text = el('span', 'wr-run-text');
    text.append(el('span', 'wr-run-title', r.title));
    const meta = el('span', 'wr-facts tnum');
    meta.append(...factsLine([dueFact(r.due, now), mustFact(r.mustMinutes, 'No Must set')]));
    text.append(meta);
    row.append(text);
    item.append(row);
    list.append(item);
  }
  const left = running.filter(r => !api.ui.focus.includes(r.blockId));
  const all = running.length > 1 && left.length
    ? button(running.length === 2 ? 'Carry both' : `Carry all ${running.length}`, () => setFocus(api, [...api.ui.focus, ...left.map(r => r.blockId)]), 'wr-btn-tonal', 'redo')
    : null;
  return [sectionHead('Still running', running.length, all), list];
}

/** The open tasks of a Partly or Not yet Result: one menu per row, and one Carry for all that are not carried yet. */
function leftoverList(api, result) {
  const box = el('div', 'wr-left');
  const tasks = result.leftovers.map(id => api.data().entries.find(t => t.id === id)).filter(Boolean);
  if (!tasks.length) {
    box.append(el('p', 'wr-card-note', 'No open tasks left.'));
    return box;
  }
  const head = el('div', 'wr-left-head');
  head.append(el('h4', '', 'Unfinished tasks'));
  const open = tasks.filter(task => leftoverChoice(task, api.week) !== 'carry');
  if (tasks.length > 1 && open.length) {
    const label = open.length < tasks.length ? 'Carry the rest' : 'Carry all';
    const ops = open.map(task => ({type: 'reviewTask', id: task.id, choice: 'carry', week: api.week}));
    head.append(button(label, () => api.run({type: 'batch', ops}, 'Carried into this week'), 'wr-btn-text'));
  }
  box.append(head);
  for (const task of tasks) box.append(leftoverRow(api, task));
  return box;
}

const CHOICE_ICONS = {carry: 'redo', defer: 'event_upcoming', drop: 'archive'};
function leftoverRow(api, task) {
  const row = el('div', 'wr-left-row');
  const current = leftoverChoice(task, api.week);
  const title = task.title ?? task.raw ?? 'Task';
  row.append(el('span', 'wr-left-title' + (current === 'drop' ? ' dropped' : ''), title));
  const label = CHOICES.find(([value]) => value === current)?.[1];
  const pick = button(label ?? 'Choose', () => openMenu(pick, CHOICES.map(([value, word]) => ({
    label: word,
    icon: value === current ? 'check' : CHOICE_ICONS[value],
    onClick: () => { if (value !== current) api.run({type: 'reviewTask', id: task.id, choice: value, week: api.week}, decisionLabel(value)); },
  })), `What to do with "${title}"`), 'wr-left-pick' + (current ? ' set' : ''));
  pick.append(icon('arrow_drop_down'));
  pick.setAttribute('aria-haspopup', 'menu');
  pick.setAttribute('aria-label', `What to do with "${title}": ${label ?? 'not decided'}`);
  pick.dataset.key = 'left:' + task.id;
  row.append(pick);
  return row;
}
const decisionLabel = value => ({carry: 'Carried into this week', defer: 'Deferred', drop: 'Dropped. It stays in Archive'})[value];

/** The moment to notice what went right, before planning more. */
function winsCard(wins) {
  const box = el('section', 'wr-wins');
  box.setAttribute('role', 'status');
  const head = el('div', 'wr-wins-head');
  head.append(icon('celebration'), el('h3', '', wins.length === 1 ? 'A win last week' : `${wins.length} wins last week`));
  box.append(head);
  const list = el('ul', 'wr-wins-list');
  for (const win of wins) {
    const item = el('li');
    item.append(icon('check'), el('span', '', win.title));
    list.append(item);
  }
  box.append(list, el('p', 'wr-wins-note', 'Take a moment to enjoy that before planning more.'));
  return box;
}
