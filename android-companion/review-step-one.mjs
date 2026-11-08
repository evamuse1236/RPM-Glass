import {reviewSummary, leftoverChoice} from './review-state.mjs';
import {plural} from './planner/format.mjs';
import {VERDICT_RECEIPTS, CHOICES, el, icon, button, heading, emptyState, sectionHead, factsLine, dueFact, mustFact, split} from './review-ui.mjs';
import {openMenu} from './planner/menu.mjs';
import {focusCheck, setFocus} from './review-focus.mjs';
import {DECK_VERDICTS, deckOf, deckTally, resultDeck, resultRing} from './review-deck.mjs';

/* ---------- step 1: last week's Results ---------- */
/** True while step 1 still has a Result card to judge, so the footer's Next stays tonal until every verdict is in. */
export function deckWaiting(api) {
  const summary = reviewSummary(api.data(), api.week, api.now());
  return deckOf(summary.results.filter(r => !r.running)).length > 0;
}

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
  const deck = deckOf(judged);
  const main = [];
  if (judged.length) {
    main.push(deckTally(judged));
    if (deck.length) main.push(...resultDeck(api, summary, judged));
    else {
      const wins = judged.filter(r => r.verdict === 'achieved');
      const rest = judged.filter(r => r.verdict !== 'achieved');
      if (wins.length) main.push(winsCard(api, summary, wins));
      if (rest.length) main.push(decidedList(api, summary, rest));
    }
  }
  const side = deck.length ? notDueYet(api, running) : carryList(api, judged, running);
  parts.push(...split(main, side));
  return parts;
}

/** While the deck is open: the Results still running, which wait for a later review. The tally above the card counts
 * the ones left to judge, so the card keeps the one action. Progress first, then the deadline: one line each; the
 * Must time waits for step 4, where it is planned. */
function notDueYet(api, running) {
  if (!running.length) return [];
  const list = el('ul', 'wr-queue');
  list.setAttribute('aria-label', 'Not due yet');
  for (const result of running) {
    const item = el('li', 'wr-queue-row');
    item.dataset.key = 'queue:' + result.blockId;
    const {ring, words} = resultRing(result);
    const text = el('span', 'wr-decided-text');
    const meta = el('span', 'wr-facts tnum');
    meta.append(...factsLine([words, dueFact(result.due, api.now())]));
    text.append(el('span', 'wr-decided-title', result.title), meta);
    item.append(ring, text);
    list.append(item);
  }
  return [sectionHead('Not due yet', running.length), list];
}

/** A verdict's icon in its colour: the same three the deck's buttons use. */
function verdictIcon(verdict) {
  const [, , symbol] = DECK_VERDICTS.find(([value]) => value === verdict);
  const node = icon(symbol);
  node.classList.add('wr-verdict-icon');
  node.dataset.verdict = verdict;
  return node;
}

/** A tap on a decided Result reopens its three verdicts in a menu; the current one carries the check. */
function changeVerdict(api, summary, result, anchor) {
  openMenu(anchor, DECK_VERDICTS.map(([value, label, symbol]) => ({
    label,
    icon: value === result.verdict ? 'check' : symbol,
    onClick: () => {
      if (value === result.verdict) return;
      api.run({type: 'markAchieved', id: result.blockId, achieved: value === 'achieved', week: summary.lastWeek, verdict: value}, VERDICT_RECEIPTS[value]);
    },
  })), `Did "${result.title}" happen?`);
}

function verdictRow(api, summary, result, facts) {
  const label = DECK_VERDICTS.find(([value]) => value === result.verdict)[1];
  const row = button('', () => changeVerdict(api, summary, result, row), 'wr-decided-row');
  row.setAttribute('aria-haspopup', 'menu');
  row.setAttribute('aria-label', `"${result.title}": ${label}. Change`);
  row.dataset.key = 'verdict:' + result.blockId;
  const text = el('span', 'wr-decided-text');
  text.append(el('span', 'wr-decided-title', result.title));
  const meta = el('span', 'wr-facts tnum');
  meta.append(...factsLine(facts));
  text.append(meta);
  row.append(verdictIcon(result.verdict), text, icon('chevron_right'));
  return row;
}

const taskCount = result => (result.total ? `${result.done} of ${result.total} done` : 'No tasks');

/** Partly and Not yet, one compact row each: the coloured verdict icon, the title, and how far it got. */
function decidedList(api, summary, results) {
  const list = el('ul', 'wr-decided');
  list.setAttribute('aria-label', 'Your verdicts');
  for (const result of results) {
    const item = el('li');
    const label = DECK_VERDICTS.find(([value]) => value === result.verdict)[1];
    item.append(verdictRow(api, summary, result, [label, taskCount(result)]));
    list.append(item);
  }
  return list;
}

/** The moment to notice what went right: each win (tap to change its verdict) and one line to remember why it worked. */
function winsCard(api, summary, wins) {
  const box = el('section', 'wr-wins');
  box.setAttribute('aria-label', wins.length === 1 ? 'A win last week' : `${wins.length} wins last week`);
  const head = el('div', 'wr-wins-head');
  head.append(icon('celebration'), el('h3', '', wins.length === 1 ? 'A win last week' : `${wins.length} wins last week`));
  box.append(head);
  const list = el('ul', 'wr-wins-list');
  for (const win of wins) {
    const item = el('li');
    const facts = [taskCount(win), win.leftovers.length ? `${plural(win.leftovers.length, 'open task')} stay with it` : null];
    item.append(verdictRow(api, summary, win, facts), evidenceField(api, summary, win));
    list.append(item);
  }
  box.append(list);
  return box;
}

function evidenceField(api, summary, result) {
  const input = el('input', 'wr-evidence');
  input.type = 'text';
  input.maxLength = 300;
  input.value = result.evidence;
  input.placeholder = 'What made it work?';
  input.enterKeyHint = 'done';
  input.setAttribute('aria-label', `What made "${result.title}" work? (optional)`);
  input.dataset.key = 'evidence:' + result.blockId;
  const save = () => {
    const evidence = input.value.trim();
    if (evidence === result.evidence) return;
    api.run({type: 'markAchieved', id: result.blockId, achieved: true, evidence, week: summary.lastWeek}, 'Saved with the win');
  };
  input.addEventListener('change', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  return input;
}

/** One list of what can come into this week: the open tasks of Partly and Not yet Results, each group under its
 * Result's title, then the Results still running under one "Still running" head. Each row has one carry button;
 * one "Carry all" carries every row not carried yet. */
function carryList(api, judged, running) {
  const entries = api.data().entries;
  const groups = judged
    .filter(r => r.verdict === 'partly' || r.verdict === 'notyet')
    .map(r => ({result: r, tasks: r.leftovers.map(id => entries.find(t => t.id === id)).filter(Boolean)}))
    .filter(group => group.tasks.length);
  const tasks = groups.flatMap(group => group.tasks);
  if (!tasks.length && !running.length) return [];
  const openTasks = tasks.filter(task => !leftoverChoice(task, api.week));
  const openRunning = running.filter(r => !api.ui.focus.includes(r.blockId));
  const count = openTasks.length + openRunning.length;
  const all = tasks.length + running.length > 1 && count
    ? button('Carry all', () => carryAll(api, openTasks, openRunning), 'wr-btn-text', 'redo')
    : null;
  const list = el('ul', 'wr-carry');
  list.setAttribute('aria-label', 'Carry into this week');
  for (const {result, tasks: own} of groups) {
    list.append(carryHead(result.title));
    for (const task of own) list.append(taskRow(api, task));
  }
  if (running.length) list.append(carryHead('Still running'));
  for (const result of running) list.append(runningRow(api, result));
  return [sectionHead('Carry into this week', tasks.length + running.length, all), list];
}

/** A quiet group head inside the carry card: the Result the rows below came from, or "Still running". */
function carryHead(text) {
  const head = el('li', 'wr-carry-head');
  head.append(el('span', '', text));
  return head;
}

function carryAll(api, tasks, running) {
  if (tasks.length) {
    const ops = tasks.map(task => ({type: 'reviewTask', id: task.id, choice: 'carry', week: api.week}));
    api.run(ops.length === 1 ? ops[0] : {type: 'batch', ops}, 'Carried into this week');
  }
  if (running.length) setFocus(api, [...api.ui.focus, ...running.map(r => r.blockId)]);
}

const CHOICE_ICONS = {carry: 'redo', defer: 'event_upcoming', drop: 'archive'};
const CHOICE_WORDS = {carry: 'Carried', defer: 'Deferred', drop: 'Dropped'};
const decisionLabel = value => ({carry: 'Carried into this week', defer: 'Deferred', drop: 'Dropped. It stays in Archive'})[value];

/** A leftover task: the row opens Carry, Defer or Drop; the trailing button carries it in one tap. */
function taskRow(api, task) {
  const item = el('li', 'wr-carry-item');
  const current = leftoverChoice(task, api.week);
  const title = task.title ?? task.raw ?? 'Task';
  const choose = value => { if (value !== current) api.run({type: 'reviewTask', id: task.id, choice: value, week: api.week}, decisionLabel(value)); };
  const body = button('', () => openMenu(body, CHOICES.map(([value, word]) => ({
    label: word,
    icon: value === current ? 'check' : CHOICE_ICONS[value],
    onClick: () => choose(value),
  })), `What to do with "${title}"`), 'wr-carry-body');
  body.setAttribute('aria-haspopup', 'menu');
  body.setAttribute('aria-label', `What to do with "${title}": ${CHOICES.find(([value]) => value === current)?.[1] ?? 'not decided'}`);
  body.dataset.key = 'left:' + task.id;
  body.append(el('span', 'wr-carry-title' + (current === 'drop' ? ' dropped' : ''), title));
  if (current && current !== 'carry') body.append(el('span', 'wr-facts', CHOICE_WORDS[current]));
  const carried = current === 'carry';
  const carry = button('', () => (carried ? body.click() : choose('carry')), 'wr-carry-btn' + (carried ? ' on' : ''), 'redo');
  carry.setAttribute('aria-pressed', String(carried));
  carry.setAttribute('aria-label', `Carry "${title}" into this week`);
  carry.dataset.key = 'carry:' + task.id;
  item.append(body, carry);
  return item;
}

/** A Result whose deadline is still ahead: nothing to judge, only whether it comes into this week. */
function runningRow(api, result) {
  const item = el('li', 'wr-carry-item');
  const body = el('div', 'wr-carry-body');
  const meta = el('span', 'wr-facts tnum');
  meta.append(...factsLine([dueFact(result.due, api.now()), mustFact(result.mustMinutes)]));
  body.append(el('span', 'wr-carry-title', result.title));
  if (meta.childElementCount) body.append(meta);
  const carry = focusCheck(api, result.blockId, 'wr-carry-btn', ['redo', 'redo']);
  carry.setAttribute('aria-label', `Carry "${result.title}" into this week`);
  item.append(body, carry);
  return item;
}
