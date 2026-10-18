/** History: meals, water and routine runs by day, newest first. A meal opens its sheet to edit or delete it. */
import {historyDays, estimateText, timesText, clockText, SLOT_NAMES} from '../body-state.mjs';
import {el, listItem, sectionHeader, emptyState, icon} from './dom.mjs';
import {relativeDay} from './format.mjs';
import {openMealSheet} from './meals.mjs';

function row(app, body, item) {
  const node = build(app, body, item);
  node.querySelector('.list-supporting')?.classList.add('tnum');
  return node;
}

function build(app, body, item) {
  if (item.kind === 'meal') {
    const {meal} = item;
    const supporting = [SLOT_NAMES[meal.slot], clockText(meal.at), estimateText(meal.estimate, {short: true})].filter(Boolean).join(' · ');
    const node = listItem({leading: 'restaurant', headline: meal.name, supporting, onClick: () => openMealSheet(app, body, {mealId: meal.id}),
      cls: 'history-row'});
    node.dataset.key = 'meal:' + meal.id;
    return node;
  }
  if (item.kind === 'water') {
    return listItem({leading: 'water_drop', headline: `Water · ${item.count} of ${item.goal} glasses`, supporting: timesText(item.times),
      cls: 'history-row'});
  }
  return listItem({leading: icon('checklist', {fill: item.text === 'Done', cls: 'leading'}), headline: item.routine.name,
    supporting: item.text, cls: 'history-row'});
}

export function renderHistory(app, body, page) {
  page.append(el('h1', 'history-title', 'History'));
  const days = historyDays({meals: body.meals(), glasses: body.water().glasses, runs: body.runs(), routines: body.routines(),
    goal: body.water().settings?.goal}, body.now());
  if (!days.length) {
    page.append(emptyState({symbol: 'history', title: 'Nothing logged yet', body: 'Meals, water and routines you log appear here.'}));
    return;
  }
  for (const {day, rows} of days) {
    const section = el('section', 'history-day');
    section.append(sectionHeader(relativeDay(day)), ...rows.map(item => row(app, body, item)));
    page.append(section);
  }
}
