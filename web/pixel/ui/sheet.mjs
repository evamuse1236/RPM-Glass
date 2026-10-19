import {h, key, fill} from './dom.mjs';
import {icon} from './icons.mjs';
import {toggleDone} from './plate.mjs';
import {logMeal} from './today-room.mjs';
import {localDay, shiftDay, inboxTasks, openBlocks, moveArgs} from '../model/plan.mjs';
import {clock, duration, dayName} from '../../../android-companion/planner/format.mjs';
import {scheduleText} from '../../../android-companion/capture-content.mjs';

export function createSheet(ctx) {
  const panel = h('div.sheet', {id: 'sheet', popover: 'auto', role: 'dialog', 'aria-labelledby': 'sheet-title'});
  let opener = null;
  panel.addEventListener('toggle', event => {
    if (event.newState === 'closed' && opener?.isConnected) opener.focus();
  });
  document.body.append(panel);

  function show(title, ...body) {
    opener = document.activeElement;
    fill(panel, 
      h('h2.sheet-title', {id: 'sheet-title'}, title),
      ...body,
      h('div.sheet-close', {}, key('Close', () => panel.hidePopover(), {hint: 'Esc'})));
    if (!panel.matches(':popover-open')) panel.showPopover();
    panel.querySelector('.sheet-body button, .sheet-keys button')?.focus();
  }
  const close = () => panel.hidePopover();

  function move(task, day, words) {
    ctx.act('reschedule', moveArgs(task, day), `Moved: ${task.title} → ${words}`);
    close();
  }

  function moveList(task) {
    const today = localDay(ctx.now());
    const days = Array.from({length: 7}, (_, i) => shiftDay(today, i));
    const results = openBlocks(ctx.view.snapshot).filter(b => b.id !== task.blockId);
    show(`Move “${task.title}”`,
      h('div.sheet-body', {},
        h('h3.section-sign', {}, 'To a day'),
        h('div.sheet-keys', {}, days.map(d => key(dayName(d, {today: true}), () => move(task, d, dayName(d, {today: true})), {cls: 'small'})),
          key('No date', () => move(task, null, 'no date'), {cls: 'small'})),
        h('h3.section-sign', {}, 'To a Result'),
        h('div.sheet-keys.column', {}, task.blockId ? key('Inbox (no Result)', () => {
          ctx.act('move-to-block', {taskId: task.id, blockId: null}, `Moved: ${task.title} → Inbox`); close();
        }, {cls: 'small'}) : null,
        results.map(b => key(b.title, () => {
          ctx.act('move-to-block', {taskId: task.id, blockId: b.id}, `Moved: ${task.title} → ${b.title}`); close();
        }, {cls: 'small wrap'})))));
  }

  function openTask(task) {
    const block = ctx.view.snapshot.blocks.find(b => b.id === task.blockId);
    const when = task.start ? scheduleText({planned: new Date(task.start).toISOString()})
      : scheduleText(task.planned ? {planned: task.planned} : task.plannedDate ? {plannedDate: task.plannedDate} : null);
    show(task.title,
      h('div.sheet-facts', {},
        task.raw && task.raw !== task.title ? h('p', {}, h('span.soft', {}, 'You said: '), `“${task.raw}”`) : null,
        h('p', {}, [when ?? 'No date', task.minutes ? duration(task.minutes) : null].filter(Boolean).join(' · ')),
        h('p', {}, block ? `Result: ${block.title}` : 'Inbox'),
        task.must ? h('p.must', {}, icon('star'), 'Must') : null,
        task.notes ? h('p.notes', {}, task.notes) : null),
      h('div.sheet-keys', {},
        key(task.done ? 'Not done' : 'Done', () => { toggleDone(ctx, task, !!task.done); close(); }, {cls: 'filled', hint: 'Space'}),
        key('Move to…', () => moveList(task)),
        key('Trash', () => { ctx.act('archive', {taskId: task.id}, `Trash: ${task.title}`); close(); })));
  }

  function fillGap(gap) {
    const at = new Date(Math.ceil(gap.at / 300000) * 300000);
    const tasks = inboxTasks(ctx.view.snapshot);
    show(`Free from ${clock(at)}`,
      h('p.sheet-lead', {}, tasks.length ? `${duration(gap.minutes)} free. Put an Inbox task here:` : 'The Inbox is empty. Capture something first.'),
      h('div.sheet-body.sheet-keys.column', {}, tasks.map(t => key(t.title, () => {
        ctx.act('reschedule', {taskId: t.id, time: at.toISOString(), day: null}, `Moved: ${t.title} → ${clock(at)}`); close();
      }, {cls: 'small wrap'}))));
  }

  function openMeal(meal) {
    const name = meal.label.split(' · ')[0];
    if (meal.meal) return show(`${name} logged`, h('p.sheet-lead', {}, `${meal.meal.name} at ${clock(meal.meal.at)}.`));
    show(`Log ${name.toLowerCase()}?`, h('div.sheet-keys', {}, key(`Log ${name.toLowerCase()}`, () => { logMeal(ctx, meal); close(); }, {cls: 'filled'})));
  }

  function openDraft(draft) {
    show(draft.title || 'Draft from Capture',
      h('ul.receipt-lines', {}, draft.receipt.map(r => h('li', {}, icon('check'), h('span', {}, r.text)))),
      h('p.sheet-lead', {}, draft.reply || 'Accept it or leave it out on the phone.'),
      h('p.soft', {}, 'Drafts are accepted or left out on the phone for now.'));
  }

  function keyList() {
    const rows = [['← ↑ → ↓ or WASD', 'Walk between rooms'], ['Tab', 'Next plate or key'], ['Enter', 'Open the task'],
      ['Space', 'Tick the task done'], ['C', 'Write in Capture'], ['Ctrl + Enter', 'Send the capture'],
      ['Z', 'Undo the last change'], ['Esc', 'Close this'], ['?', 'This list']];
    show('Keys', h('dl.key-list', {}, rows.flatMap(([k, what]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, what)])));
  }

  return {openTask, moveList, fillGap, openMeal, openDraft, keyList, close, panel};
}
