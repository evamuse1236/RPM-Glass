/** Every Routine, including those not running today: each opens its editor, and "New routine" starts one. */
import {rangeText, daysText} from '../body-state.mjs';
import {button, listItem, emptyState} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {openRoutineEditor} from './routine-editor.mjs';

export function openRoutineList(app, body) {
  const {body: content, actions} = openSheet(app, 'Routines', {variant: 'choice'});
  const routines = [...body.routines()].sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!routines.length) {
    content.append(emptyState({symbol: 'checklist', title: 'No routines yet',
      body: 'A routine is a short list of steps you run in a set window, like a morning routine.'}));
  }
  for (const routine of routines) {
    const row = listItem({leading: 'checklist', headline: routine.name,
      supporting: `${rangeText(routine.start, routine.end)} · ${daysText(routine.days)}`,
      onClick: () => openRoutineEditor(app, body, routine.id)});
    row.querySelector('.list-supporting')?.classList.add('tnum');
    content.append(row);
  }
  actions.append(button('New routine', () => openRoutineEditor(app, body), 'filled-btn'));
}
