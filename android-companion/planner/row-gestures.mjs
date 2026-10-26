/** Task row gestures: swipe right = Done, swipe left = Schedule (plus Move to Block in the Inbox), hold = quick menu.
 * Each has a tap route: the ring, and the task sheet's Day and Time rows, Block row, Delete and Must star. */
import {attachSwipe} from '../task-swipe.mjs';
import {openMenu} from './menu.mjs';

function heldActions(app, task) {
  const must = !task.must;
  return [
    {id: 'must', label: must ? 'Mark as Must' : 'Remove Must', icon: 'star', run: () =>
      app.commit({type: 'saveTask', id: task.id, fields: {must}}, {label: must ? 'Marked Must' : 'Must removed'}).catch(() => {})},
    {id: 'move', label: 'Move to Block', icon: 'drive_file_move', run: () => app.actions.movePicker(task)},
    {id: 'delete', label: 'Delete', icon: 'delete', danger: true, run: () => app.actions.deleteTask(task)},
  ];
}

/** One list of what a row can do; its swipes, its hold menu and a pointer's row tools all draw from it. */
export function rowActions(app, task, row, {tick, inbox = false}) {
  const [must, move, remove] = heldActions(app, task);
  return [
    {id: 'done', label: 'Complete', icon: 'check', run: () => tick(row)},
    {id: 'schedule', label: 'Schedule', icon: 'event_upcoming', run: () => app.actions.scheduleTask(task, row, {moveToBlock: inbox})},
    move,
    must,
    remove,
  ];
}

const menuItem = ({label, icon, danger, run}) => ({label, icon, danger, onClick: run});

/** Must, Move to Block and Delete, anchored to the held row. */
export function quickMenu(app, task, anchor) {
  const [must, move, remove] = heldActions(app, task).map(menuItem);
  openMenu(anchor, [must, move, {divider: true}, remove], 'Quick actions for ' + task.title);
}

/** Every action of the row, Delete set apart, for a pointer's secondary click. */
export function rowMenu(row, anchor) {
  const items = row.rowActions.map(menuItem);
  items.splice(-1, 0, {divider: true});
  openMenu(anchor, items, 'Actions for ' + row.rowTitle);
}

/**
 * complete(row): marks the task done and resolves false when it was not saved. `leave` carries the row off before it
 * collapses (lists that move done rows away); a row that stays on screen springs back and shows its tick. `tick` does
 * the same for a click, without the carry. `inbox` adds Move to Block under the swipe-left schedule choices, so an
 * Inbox task goes to Today or Tomorrow 9:00 AM in two taps. `hold: false` leaves the long press to the Plan's reorder.
 */
export function attachRowGestures(app, row, task, {complete, tick = complete, leave = true, inbox = false, hold = true}) {
  const actions = rowActions(app, task, row, {tick, inbox});
  row.rowActions = actions;
  row.rowTitle = task.title;
  attachSwipe(row, {
    right: {kind: 'done', leave, run: complete},
    left: {kind: 'schedule', run: actions[1].run},
    hold: hold ? () => quickMenu(app, task, row) : null,
    haptic: () => app.api.native('haptic').catch(() => {}),
  });
}
