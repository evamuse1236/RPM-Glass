/** Menus and dialogs: schedule, move to Block, search, keyboard shortcuts, settings, and logging a meal. */
import {h, icon, swap} from './dom.mjs';
import {localDay, shiftDay} from '../../../android-companion/planner-state.mjs';
import {dayName} from '../../../android-companion/planner/format.mjs';
import {findTasks} from '../core/model.mjs';
import {whenText} from './rows.mjs';

export function createOverlays(getCtx) {
  const menu = h('div.menu', {popover: 'auto', role: 'menu'});
  const dialog = h('dialog.dialog');
  const ctx = () => getCtx();

  function openMenu(anchor, title, items) {
    swap(menu, h('h3', title), ...items.map(item => h('button.menu-item', {type: 'button', role: 'menuitem',
      onclick: () => { menu.hidePopover(); item.run(); }}, icon(item.symbol), h('span', item.label), item.note ? h('small', item.note) : null)));
    try { menu.showPopover({source: anchor}); } catch { menu.showPopover(); }
    menu.querySelector('.menu-item')?.focus();
  }

  function moveTo(task, day) {
    const c = ctx();
    if (day == null) return c.control.act('reschedule', {taskId: task.id, time: null, day: null}, 'Date cleared');
    if (task.planned) {
      const at = new Date(task.planned), next = new Date(day + 'T00:00');
      next.setHours(at.getHours(), at.getMinutes(), 0, 0);
      return c.control.act('reschedule', {taskId: task.id, time: next.toISOString(), day: null}, `Moved to ${dayName(day, {today: true}) || 'that day'}`);
    }
    c.control.act('reschedule', {taskId: task.id, time: null, day}, `Moved to ${dayName(day, {today: true}) || 'that day'}`);
  }

  function scheduleMenu(task, anchor) {
    const today = localDay(ctx().now), toMonday = (8 - new Date(today + 'T12:00').getDay()) % 7 || 7;
    const saturday = shiftDay(today, (6 - new Date(today + 'T12:00').getDay() + 7) % 7 || 7);
    openMenu(anchor, `Schedule “${task.title}”`, [
      {symbol: 'today', label: 'Today', run: () => moveTo(task, today)},
      {symbol: 'event', label: 'Tomorrow', run: () => moveTo(task, shiftDay(today, 1))},
      {symbol: 'weekend', label: 'This weekend', note: dayName(saturday), run: () => moveTo(task, saturday)},
      {symbol: 'next_week', label: 'Next week', note: dayName(shiftDay(today, toMonday)) || 'Mon', run: () => moveTo(task, shiftDay(today, toMonday))},
      {symbol: 'event_busy', label: 'No date', run: () => moveTo(task, null)},
    ]);
  }

  function moveMenu(task, anchor) {
    const c = ctx();
    openMenu(anchor, `Move “${task.title}”`, [
      {symbol: 'inbox', label: 'Inbox', run: () => c.control.act('move-to-block', {taskId: task.id, blockId: null}, 'Moved to Inbox')},
      ...c.snap.blocks.filter(b => !b.archived && b.id !== task.blockId).map(b => ({symbol: 'stacks', label: b.title,
        run: () => c.control.act('move-to-block', {taskId: task.id, blockId: b.id}, 'Moved to Block')})),
    ]);
  }

  function showDialog(...children) {
    swap(dialog, h('div.dialog-body', ...children));
    if (!dialog.open) dialog.showModal();
  }
  const close = () => dialog.close();
  const closeButton = (label = 'Close') => h('div.dialog-actions', h('button.text-btn', {type: 'button', onclick: close}, label));

  function shortcuts() {
    const keys = [['c', 'Open or close Capture'], ['/', 'Search tasks'], ['1–4', 'Today, Week, Blocks, Inbox'], ['j / k', 'Next or previous row'],
      ['Enter', 'Open the task'], ['x', 'Complete or reopen'], ['s', 'Schedule'], ['m', 'Move to a Block'], ['e', 'Edit the title'],
      ['u', 'Undo the last change'], ['Esc', 'Close'], ['Ctrl+Enter', 'Send a capture'], ['?', 'These shortcuts']];
    showDialog(h('h2', 'Keyboard shortcuts'), h('div.keys', keys.flatMap(([k, what]) => [h('kbd', k), h('span', what)])), closeButton());
  }

  function search() {
    const input = h('input.search-input', {type: 'search', placeholder: 'Search tasks', 'aria-label': 'Search tasks'});
    const results = h('div.search-results', {role: 'listbox'});
    const show = () => {
      const c = ctx(), rows = findTasks(c.snap.tasks.filter(t => !t.archived), input.value).slice(0, 12);
      swap(results, ...rows.map(t => h('button.menu-item', {type: 'button', role: 'option', onclick: () => { close(); c.open(t.id); }},
        icon(t.done ? 'check_circle' : 'radio_button_unchecked'), h('span', t.title), h('small', whenText(t) || (t.blockId ? '' : 'Inbox')))),
      input.value.trim() && !rows.length ? h('p.quiet', 'No task starts with those words.') : null);
    };
    input.addEventListener('input', show);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') results.querySelector('button')?.click(); });
    showDialog(h('h2', 'Search'), input, results, closeButton());
    input.focus();
  }

  function settings() {
    const c = ctx();
    const theme = h('select.chip', {'aria-label': 'Theme', onchange: e => c.setTheme(e.target.value)},
      [['system', 'Match the system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', {value: v, selected: c.theme === v}, l)));
    showDialog(h('h2', 'This browser'),
      h('p.settings-meta', c.phone.savedAt ? `Your phone last saved the plan ${new Date(c.phone.savedAt).toLocaleString([], {dateStyle: 'full', timeStyle: 'short'})}.` : 'No plan from your phone yet.'),
      h('p.settings-meta', c.demo ? 'Demo data: a pretend phone answers, so nothing reaches your real plan.' : 'Changes go to your phone, which applies them.'),
      h('div.setting-row', h('span', 'Theme'), theme),
      h('div.setting-row', h('span', 'Keyboard shortcuts'), h('button.text-btn', {type: 'button', onclick: shortcuts}, 'Show')),
      h('div.setting-row', h('span', 'Unlink this browser'), h('button.text-btn.danger', {type: 'button', onclick: () => { close(); c.unlink(); }}, 'Unlink')),
      closeButton('Done'));
  }

  function logMeal(slot, at) {
    const c = ctx();
    const name = h('input.search-input', {type: 'text', placeholder: 'What did you eat?', 'aria-label': 'Meal', maxLength: 200});
    const save = () => {
      if (!name.value.trim()) return name.focus();
      close();
      c.control.act('log-meal', {name: name.value.trim(), slot, at: new Date(Math.min(c.now, at ?? c.now)).toISOString()}, 'Meal logged');
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    showDialog(h('h2', `Log ${slot}`), name,
      h('div.dialog-actions', h('button.text-btn', {type: 'button', onclick: close}, 'Cancel'), h('button.filled-btn', {type: 'button', onclick: save}, 'Log it')));
    name.focus();
  }

  return {nodes: [menu, dialog], scheduleMenu, moveMenu, shortcuts, search, settings, logMeal, moveTo,
    get open() { return dialog.open || menu.matches(':popover-open'); }};
}
