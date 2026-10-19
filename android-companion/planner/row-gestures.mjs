/** Task row gestures: swipe right = Done, swipe left = Schedule (Move to Block in the Inbox), hold = quick menu.
 * Each has a tap route: the ring, and the task sheet's Day and Time rows, Block row, Delete and Must star. */
import {attachSwipe} from '../task-swipe.mjs';
import {openMenu} from './menu.mjs';

/** Must, Move to Block and Delete, anchored to the held row. */
export function quickMenu(app, task, anchor) {
  const must = !task.must;
  openMenu(anchor, [
    {label: must ? 'Mark as Must' : 'Remove Must', icon: 'star', onClick: () =>
      app.commit({type: 'saveTask', id: task.id, fields: {must}}, {label: must ? 'Marked Must' : 'Must removed'}).catch(() => {})},
    {label: 'Move to Block', icon: 'drive_file_move', onClick: () => app.actions.movePicker(task)},
    {divider: true},
    {label: 'Delete', icon: 'delete', danger: true, onClick: () => app.actions.deleteTask(task)},
  ], 'Quick actions for ' + task.title);
}

/**
 * complete(row): marks the task done and resolves false when it was not saved. `leave` carries the row off before it
 * collapses (lists that move done rows away); a row that stays on screen springs back and shows its tick. `inbox`
 * turns swipe left into Move to Block. `hold: false` leaves the long press to the Plan's reorder.
 */
export function attachRowGestures(app, row, task, {complete, leave = true, inbox = false, hold = true}) {
  attachSwipe(row, {
    right: {kind: 'done', leave, run: complete},
    left: inbox ? {kind: 'move', run: () => app.actions.movePicker(task)}
      : {kind: 'schedule', run: () => app.actions.scheduleTask(task, row)},
    hold: hold ? () => quickMenu(app, task, row) : null,
    haptic: () => app.api.native('haptic').catch(() => {}),
  });
}
