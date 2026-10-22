/** Step 1's deck (prototype round4 r1): each undecided Result is one large card. A swipe right is Achieved and a swipe
 * left Not yet; Not yet, Partly and Achieved below do the same. Each verdict saves with Undo, which brings the card back. */
import {planner} from './planner-state.mjs';
import {areaTone} from './planner-ux.mjs';
import {lockAxis, releaseSide, nearEdge, vibrate, SWIPE_COMMIT} from './task-swipe.mjs';
import {reducedMotion} from './motion-core.mjs';
import {segmentRing} from './planner/rings.mjs';
import {plural} from './planner/format.mjs';
import {VERDICT_RECEIPTS, el, icon, button, dueChip} from './review-ui.mjs';

export const SWIPE_VERDICTS = Object.freeze({right: 'achieved', left: 'notyet'});
export const DECK_VERDICTS = [['notyet', 'Not yet', 'schedule'], ['partly', 'Partly', 'contrast'], ['achieved', 'Achieved', 'check']];
const WORDS = {achieved: 'Achieved', notyet: 'Not yet'};
const SETTLE = 200, CARRY = 150;

export const deckOf = judged => judged.filter(result => !result.verdict);

/** The verdict a horizontal drag let go at `dx` gives, or null when it springs back. */
export function swipeVerdict(dx) {
  const side = releaseSide(dx, {right: true, left: true});
  return side ? SWIPE_VERDICTS[side] : null;
}

export function judge(api, summary, result, verdict) {
  api.ui.deckEnter = true;
  return api.run({type: 'markAchieved', id: result.blockId, achieved: verdict === 'achieved', week: summary.lastWeek, verdict},
    VERDICT_RECEIPTS[verdict]);
}

function resultArea(data, blockId) {
  const p = planner(data);
  const project = p.projects.find(pr => pr.id === p.blocks.find(b => b.id === blockId)?.projectId);
  const goal = p.goals.find(g => g.id === project?.goalId);
  const area = p.areas.find(a => a.id === goal?.areaId);
  return {area, tone: areaTone(area, p.areas)};
}

/** The card follows the finger once the drag locks to the x axis (8px, as task rows do); past SWIPE_COMMIT it flies off. */
export function attachDeckSwipe(card, onVerdict, haptic = vibrate) {
  const stamp = card.querySelector('.wr-deck-stamp');
  const after = (ms, fn) => (reducedMotion() ? fn() : setTimeout(fn, ms));
  let start = null, axis = null, armed = false;
  const pose = dx => {
    card.style.translate = `${dx}px 0`;
    card.style.rotate = `${(dx / 24).toFixed(2)}deg`;
    const verdict = dx > 0 ? 'achieved' : 'notyet';
    stamp.dataset.verdict = verdict;
    stamp.textContent = WORDS[verdict];
    card.style.setProperty('--stamp', String(Math.min(1, Math.abs(dx) / SWIPE_COMMIT)));
    const now = Math.abs(dx) >= SWIPE_COMMIT;
    if (now && !armed) haptic();
    armed = now;
  };
  const rest = () => {
    card.classList.add('settling');
    card.style.translate = '';
    card.style.rotate = '';
    card.style.setProperty('--stamp', '0');
    after(SETTLE, () => card.classList.remove('settling'));
  };
  card.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || event.button > 0 || event.target.closest('button,a,input')) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId, edge: nearEdge(event.clientX, innerWidth)};
    axis = null;
    armed = false;
  });
  card.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!axis) {
      axis = lockAxis(dx, dy);
      if (!axis) return;
      if (axis === 'y' || start.edge) { start = null; return; }
      try { card.setPointerCapture(event.pointerId); } catch {}
      card.classList.remove('settling');
      card.classList.add('dragging');
    }
    pose(dx);
  });
  card.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dragged = axis === 'x';
    start = null;
    if (!dragged) return;
    card.classList.remove('dragging');
    const verdict = swipeVerdict(dx);
    if (!verdict) return rest();
    card.classList.add('leaving');
    card.style.translate = `${Math.sign(dx) * (card.offsetWidth + 48)}px 0`;
    after(CARRY, () => onVerdict(verdict));
  });
  card.addEventListener('pointercancel', () => {
    if (axis === 'x') { card.classList.remove('dragging'); rest(); }
    start = null;
  });
}

function deckCard(api, summary, result, position, count) {
  const card = el('article', 'wr-deck-card');
  card.dataset.key = 'deck:' + result.blockId;
  const {area, tone} = resultArea(api.data(), result.blockId);
  card.dataset.tone = tone;
  if (api.ui.deckEnter && !reducedMotion()) card.classList.add('enter');
  const stamp = el('span', 'wr-deck-stamp');
  stamp.setAttribute('aria-hidden', 'true');
  card.append(stamp, el('span', 'wr-deck-count tnum', [area?.title, `Result ${position} of ${count}`].filter(Boolean).join(' · ')), el('h3', 'wr-deck-title', result.title));
  if (result.purpose) card.append(el('p', 'wr-deck-purpose', result.purpose));
  if (result.total && result.done === result.total) card.append(el('p', 'wr-ask', 'Every task is ticked. Did the Result itself happen?'));
  const meta = el('div', 'wr-deck-meta');
  const words = `${result.done} of ${plural(result.total, 'task')} done`;
  const done = el('span', 'wr-deck-done tnum');
  done.append(el('b', '', result.total ? `${result.done}/${result.total}` : '0'), el('span', '', result.total ? 'tasks done' : 'No tasks'));
  meta.append(segmentRing(result.done, result.total, {label: words}), done);
  const chip = result.due && dueChip(result.due, api.now());
  if (chip) meta.append(chip);
  card.append(meta);
  attachDeckSwipe(card, verdict => judge(api, summary, result, verdict));
  return card;
}

function verdictButtons(api, summary, result) {
  const group = el('div', 'wr-deck-verdicts');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `Did "${result.title}" happen?`);
  for (const [value, label, symbol] of DECK_VERDICTS) {
    const option = button(label, () => judge(api, summary, result, value), 'wr-deck-verdict', symbol);
    option.dataset.key = 'deck-verdict:' + value;
    option.dataset.verdict = value;
    group.append(option);
  }
  return group;
}

/** "2 of 4 decided" and the count of each verdict so far, each named in words for screen readers. */
export function deckTally(judged) {
  const decided = judged.filter(r => r.verdict).length;
  const tally = el('p', 'wr-tally tnum');
  tally.setAttribute('aria-live', 'polite');
  tally.append(el('span', '', decided === judged.length ? `All ${judged.length} decided` : `${decided} of ${judged.length} decided`));
  for (const [value, label, symbol] of [...DECK_VERDICTS].reverse()) {
    const n = judged.filter(r => r.verdict === value).length;
    const count = el('span', 'wr-tally-count');
    count.dataset.verdict = value;
    count.setAttribute('aria-label', `${n} ${label.toLowerCase()}`);
    count.append(icon(symbol), el('span', '', String(n)));
    tally.append(count);
  }
  return tally;
}

export function resultDeck(api, summary, judged) {
  const deck = deckOf(judged);
  const stack = el('div', 'wr-deck');
  for (let depth = Math.min(deck.length - 1, 2); depth >= 1; depth--) {
    const layer = el('div', 'wr-deck-layer');
    layer.dataset.depth = String(depth);
    layer.setAttribute('aria-hidden', 'true');
    stack.append(layer);
  }
  stack.append(deckCard(api, summary, deck[0], judged.length - deck.length + 1, judged.length));
  api.ui.deckEnter = false;
  return [stack, verdictButtons(api, summary, deck[0])];
}
