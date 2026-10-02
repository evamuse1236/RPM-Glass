/** Debug-only component gallery: synthetic examples that never change the plan. */
import {el, button, emptyState} from './dom.mjs';
import {openSheet} from './sheet.mjs';
import {taskRow} from './task-row.mjs';
import {blockCard} from './blocks.mjs';

const STATES = [
  ['Default', {}], ['Must', {must: true}], ['Completed', {done: true}],
  ['Overdue', {planned: new Date(Date.now() - 7200000).toISOString()}], ['Now', {}],
];

export function componentGallery(app) {
  const {body} = openSheet(app, 'Component gallery');
  body.append(el('p', 'sheet-note', 'Synthetic examples. These controls do not change your plans.'));
  for (const [state, fields] of STATES) {
    body.append(el('h3', 'overline', state));
    const sample = {id: -1, title: 'Read the chapter and write three points to discuss', minutes: 30, ...fields};
    const row = taskRow(app, sample, {current: state === 'Now', swipe: false}).cloneNode(true);
    row.querySelectorAll('button').forEach(node => { node.disabled = true; });
    body.append(row);
  }
  const block = app.activeBlocks()[0];
  if (block) {
    body.append(el('h3', 'overline', 'Block card'));
    body.append(blockCard(app, block).cloneNode(true));
  }
  body.append(el('h3', 'overline', 'Empty state'));
  body.append(emptyState({symbol: 'inbox', title: 'No tasks yet', body: 'Add a task to begin.',
    action: () => app.notice('Gallery example'), label: 'Add task'}));
  body.append(button('Show snackbar', () => app.notice('Gallery example'), 'text-btn'));
}
