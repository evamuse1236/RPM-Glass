/** The task sheet: every field the browser may change is one command; the Result and Purpose say why it matters. */
import {h, icon, iconButton, swap} from './dom.mjs';
import {markFor, resolution} from './rows.mjs';
import {blockOf} from '../core/model.mjs';
import {timeValue} from '../../../android-companion/planner/format.mjs';
import {localDay} from '../../../android-companion/planner-state.mjs';

const MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
const minutesLabel = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

export function createSheet(getCtx) {
  const dialog = h('dialog.sheet', {'aria-labelledby': 'sheet-title'});
  let taskId = null, fields = null;
  const ctx = () => getCtx();
  const task = () => ctx().snap?.tasks.find(t => t.id === taskId) ?? null;
  const act = (type, args, label) => ctx().control.act(type, {taskId, ...args}, label);

  function build(focusTitle) {
    const t = task();
    const title = h('textarea.sheet-title', {id: 'sheet-title', rows: 1, 'aria-label': 'Task title', value: t.title});
    const commitTitle = () => {
      const value = title.value.replace(/\s+/g, ' ').trim();
      if (value && value !== task().title) act('edit', {fields: {title: value.slice(0, 200)}}, 'Title changed');
      else title.value = task().title;
    };
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
      if (e.key === 'Escape') { title.value = task().title; }
    });
    title.addEventListener('blur', commitTitle);

    const date = h('input', {type: 'date', 'aria-label': 'Day'});
    const time = h('input', {type: 'time', 'aria-label': 'Time', step: 900});
    const schedule = () => {
      if (!date.value) return act('reschedule', {time: null, day: null}, 'Date cleared');
      if (time.value) return act('reschedule', {time: new Date(`${date.value}T${time.value}`).toISOString(), day: null}, 'Rescheduled');
      act('reschedule', {time: null, day: date.value}, 'Rescheduled');
    };
    date.addEventListener('change', schedule);
    time.addEventListener('change', () => { if (!date.value) date.value = localDay(ctx().now); schedule(); });

    const minutes = h('select', {'aria-label': 'How long', onchange: e => act('edit', {fields: {minutes: e.target.value ? Number(e.target.value) : null}}, 'Duration changed')});
    const block = h('select', {'aria-label': 'Block', onchange: e => act('move-to-block', {blockId: e.target.value || null}, e.target.value ? 'Moved to Block' : 'Moved to Inbox')});
    const alerts = h('div.chips', {role: 'group', 'aria-label': 'Alert'});
    const notes = h('textarea.sheet-notes', {'aria-label': 'Notes', placeholder: 'Add notes'});
    notes.addEventListener('blur', () => { if (notes.value !== (task().notes ?? '')) act('edit', {fields: {notes: notes.value}}, 'Notes saved'); });
    const why = h('div.why-slot');
    const mark = h('div.sheet-mark');
    const foot = h('div.sheet-foot');
    fields = {title, date, time, minutes, block, alerts, notes, why, mark, foot};
    swap(dialog,
      h('div.sheet-head', title, iconButton('close', 'Close', () => dialog.close())),
      mark,
      h('div.sheet-body',
        why,
        h('div.sheet-section', h('small', 'When'), h('div.field-row', date, time,
          h('button.text-btn', {type: 'button', onclick: () => act('reschedule', {time: null, day: null}, 'Date cleared')}, 'No date'))),
        h('div.sheet-section', h('small', 'How long'), h('div.field-row', minutes)),
        h('div.sheet-section', h('small', 'Alert'), alerts),
        h('div.sheet-section', h('small', 'Block'), h('div.field-row', block)),
        h('div.sheet-section', h('small', 'Notes'), notes)),
      foot);
    refresh();
    if (focusTitle) title.focus();
  }

  function refresh() {
    if (!dialog.open || !fields) return;
    const t = task(), c = ctx();
    if (!t) return dialog.close();
    const f = fields, active = document.activeElement;
    if (active !== f.title) f.title.value = t.title;
    if (active !== f.notes) f.notes.value = t.notes ?? '';
    if (active !== f.date) f.date.value = t.planned ? localDay(t.planned) : t.plannedDate ?? '';
    if (active !== f.time) f.time.value = t.planned ? timeValue(t.planned) : '';
    const options = [...new Set([...MINUTES, ...(t.minutes ? [t.minutes] : [])])].sort((a, b) => a - b);
    if (active !== f.minutes) swap(f.minutes, h('option', {value: ''}, 'No estimate'), ...options.map(m => h('option', {value: m, selected: t.minutes === m}, minutesLabel(m))));
    const blocks = c.snap.blocks.filter(b => !b.archived || b.id === t.blockId);
    if (active !== f.block) swap(f.block, h('option', {value: ''}, 'Inbox (no Block)'), ...blocks.map(b => h('option', {value: b.id, selected: b.id === t.blockId}, b.title)));
    swap(f.alerts, ...[['off', 'No alert', 'notifications_off'], ['reminder', 'Reminder', 'notifications'], ['alarm', 'Alarm', 'alarm']].map(([value, label, symbol]) =>
      h('button.chip', {type: 'button', 'aria-pressed': String((t.alert ?? 'off') === value), disabled: !t.planned && value !== 'off',
        title: !t.planned && value !== 'off' ? 'Set a time first' : null, onclick: () => act('edit', {fields: {alert: value}}, 'Alert changed')}, icon(symbol), label)));
    const b = blockOf(c.snap, t);
    swap(f.why, b ? h('div.why', {'data-tone': null}, h('b', b.title), b.purpose ? h('span', b.purpose) : null)
      : h('div.why', h('b', 'No Block yet'), h('span', 'Choose one below so this task serves a Result.')),
    t.must ? h('p.quiet', {style: {display: 'flex', gap: '6px', alignItems: 'center'}}, icon('star', {fill: true, cls: 'must-mark'}), 'Must today') : null,
    t.raw && t.raw !== t.title ? h('p.raw-words', `Your words: “${t.raw}”`) : null);
    swap(f.mark, ...[markFor(c, t.id), resolution(c, t.id)].filter(Boolean));
    swap(f.foot,
      t.archived ? h('button.text-btn', {type: 'button', onclick: () => act('restore', {}, 'Restored')}, icon('restore'), 'Restore')
        : h('button.text-btn.danger', {type: 'button', onclick: () => { act('archive', {}, 'Moved to Trash'); dialog.close(); }}, icon('delete'), 'Move to Trash'),
      h('button.filled-btn', {type: 'button', onclick: () => act(t.done ? 'uncomplete' : 'complete', {}, t.done ? 'Task reopened' : 'Task completed')},
        icon(t.done ? 'undo' : 'check'), t.done ? 'Reopen' : 'Complete'));
  }

  return {
    node: dialog,
    get openId() { return dialog.open ? taskId : null; },
    open(id, {focusTitle = false} = {}) {
      taskId = id;
      if (!task()) return;
      if (!dialog.open) dialog.showModal();
      build(focusTitle);
    },
    refresh,
    close: () => dialog.close(),
  };
}
