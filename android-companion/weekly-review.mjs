/** STUB for the planner branch: a minimal two-step review so the route, the Today card
 * and commit() wiring can be exercised. The review branch's full flow replaces this file. */
import {reviewSummary, weekStart, weekFocus, setWeekFocus, markAchieved, resultStatus} from './review-state.mjs';

const make = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};
const action = (label, onClick, cls) => {
  const node = make('button', cls, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

export function mountWeeklyReview(container, ctx) {
  let step = 0;
  let destroyed = false;
  const week = weekStart(ctx.day());
  let chosen = new Set(weekFocus(ctx.getData(), week));

  function header() {
    const bar = make('div', 'review-bar');
    const close = action('', () => ctx.close(), 'icon-btn');
    close.setAttribute('aria-label', 'Close review');
    close.append(make('span', 'ms', 'close'));
    bar.append(close, make('h1', '', 'Weekly review'), make('small', '', `${step + 1} of 2`));
    return bar;
  }

  function lastWeek(page) {
    const summary = reviewSummary(ctx.getData(), week);
    page.append(make('h2', 'review-title', "How did last week's Results go?"));
    page.append(make('p', 'review-sub', "Ticking every task doesn't mean the Result happened, so decide for each."));
    if (!summary.results.length) page.append(make('p', 'review-sub', 'No Results from last week to review.'));
    for (const result of summary.results) {
      const card = make('div', 'review-card');
      card.append(make('h3', '', result.title), make('p', 'review-sub', `${result.done} of ${result.total} tasks done`));
      const label = result.achieved ? 'Achieved' : 'Mark achieved';
      card.append(action(label, () => ctx.commit(data => markAchieved(data, result.blockId,
        {achieved: !result.achieved}), 'Result updated').then(draw), 'outlined-btn'));
      page.append(card);
    }
  }

  function thisWeek(page) {
    const data = ctx.getData();
    page.append(make('h2', 'review-title', "This week's Results"), make('p', 'review-sub', 'Pick 3 to 5 Blocks.'));
    const chips = make('div', 'chip-row wrap');
    for (const block of data.planner.blocks.filter(b => !b.archived)) {
      const status = resultStatus(data, block.id);
      const chip = action(`${block.title} · ${status.done}/${status.total}`, () => {
        if (chosen.has(block.id)) chosen.delete(block.id);
        else if (chosen.size < 5) chosen.add(block.id);
        draw();
      }, 'filter-chip');
      chip.setAttribute('aria-pressed', String(chosen.has(block.id)));
      chips.append(chip);
    }
    page.append(chips);
  }

  function draw() {
    if (destroyed) return;
    const page = make('div', 'review-page');
    page.append(header());
    if (step === 0) lastWeek(page);
    else thisWeek(page);
    const next = step === 0
      ? action('Next: this week', () => { step = 1; draw(); }, 'filled-btn')
      : action('Finish', () => ctx.commit(data => setWeekFocus(data, week, [...chosen]), 'Week planned')
        .then(() => ctx.close()), 'filled-btn');
    const foot = make('div', 'review-foot');
    foot.append(next);
    page.append(foot);
    container.replaceChildren(page);
  }

  draw();
  return {
    destroy() {
      destroyed = true;
      container.replaceChildren();
    },
    refresh: draw,
    back() {
      if (step === 0) return false;
      step = 0;
      draw();
      return true;
    },
  };
}
