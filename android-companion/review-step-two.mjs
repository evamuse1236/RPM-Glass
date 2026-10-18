import {inboxTasks, addInboxTask} from './review-state.mjs';
import {planner} from './planner-state.mjs';
import {areaTone} from './planner-ux.mjs';
import {areaDot} from './planner/dom.mjs';
import {attachTaskSwipe} from './task-swipe.mjs';
import {el, icon, button, iconButton, whenText, heading, sectionHead} from './review-ui.mjs';

/* ---------- step 2: capture ---------- */
export function stepTwo(api, ctx) {
  const inbox = inboxTasks(api.data());
  const now = api.now();
  const clashIds = new Set(api.clashes().map(c => c.task?.id).filter(Boolean));
  const parts = heading('Empty your head', 'Every idea, want and to-do, in your own words. Sorting comes next.');
  parts.push(quickAdd(api), ...lenses(api));
  parts.push(sectionHead('Inbox', inbox.length, button('Open Capture', () => ctx.openCapture(), 'wr-btn-text', 'edit_note')));
  if (!inbox.length) {
    parts.push(el('p', 'wr-quiet', 'Nothing in the Inbox. Type anything still on your mind above.'));
    return parts;
  }
  const list = el('ul', 'wr-list');
  list.setAttribute('aria-label', 'Inbox');
  for (const task of inbox) {
    const item = el('li', 'wr-list-item');
    // Tap to edit (the planner's task sheet, with Delete in its menu); swipe as in every task list.
    const text = button('', ctx.openTask ? () => ctx.openTask(task.id) : null, 'wr-list-text');
    text.dataset.key = 'inbox:' + task.id;
    text.append(el('span', 'wr-list-title', task.title ?? task.raw));
    const when = whenText(task, now);
    const clash = clashIds.has(task.id);
    if (when || task.must || clash) {
      const meta = el('span', 'wr-list-meta');
      if (task.must) {
        const must = el('span', 'wr-must-tag');
        must.append(icon('star', true));
        must.setAttribute('role', 'img');
        must.setAttribute('aria-label', 'Must');
        meta.append(must);
      }
      if (when) meta.append(el('span', when.overdue ? 'overdue' : when.soon ? 'soon' : '', when.text));
      if (clash) meta.append(el('span', '', 'Calendar clash · you decide it in step 4'));
      text.append(meta);
    }
    item.append(text);
    if (ctx.deleteTask) {
      item.classList.add('swipe-task');
      attachTaskSwipe(item, {schedule: ctx.scheduleTask ? () => ctx.scheduleTask(task, item) : null, remove: () => ctx.deleteTask(task)});
    }
    list.append(item);
  }
  parts.push(list);
  if (ctx.openTask) parts.push(el('p', 'wr-section-note wr-hint', 'Tap a task to edit it. Swipe right to schedule it, left to delete it.'));
  return parts;
}

/** Type a thought and press Enter: it lands in the Inbox in your own words, with Undo, and you stay here. */
function quickAdd(api) {
  const {ui} = api;
  const form = el('form', 'wr-add');
  form.noValidate = true;
  const input = el('input', 'wr-add-input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = ui.lens ? `${ui.lens}: anything due, stuck or wanted?` : 'Ideas, wants, to-dos';
  input.value = ui.draft;
  input.enterKeyHint = 'enter';
  input.dataset.key = 'quick-add';
  input.setAttribute('aria-label', 'Add to the Inbox');
  const send = iconButton('arrow_upward', 'Add to Inbox', null, 'wr-icon-btn wr-add-send');
  send.type = 'submit';
  const sync = () => { send.disabled = !input.value.trim(); };
  input.addEventListener('input', () => { ui.draft = input.value; sync(); });
  sync();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const words = input.value.trim();
    if (!words) return;
    ui.draft = '';
    input.value = '';
    sync();
    api.run(d => addInboxTask(d, words, api.now()), 'Added to Inbox');
  });
  form.append(icon('add'), input, send);
  return form;
}

/** RPM's lenses: walking through each Area surfaces what a blank field doesn't. A prompt, not a filter: a tap asks
 * that Area's question in the field and nothing else changes. */
function lenses(api) {
  const {ui} = api;
  const areas = planner(api.data()).areas.filter(a => !a.archived);
  if (!areas.length) return [];
  const row = el('div', 'wr-lenses');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Prompts, one per Area');
  for (const area of areas) {
    const chip = button('', () => {
      ui.lens = area.title;
      api.render();
      document.querySelector('.wr-add-input')?.focus({preventScroll: true});
    }, 'wr-chip wr-lens');
    chip.setAttribute('aria-label', `Prompt: ${area.title}, anything due, stuck or wanted?`);
    chip.dataset.key = 'lens:' + area.id;
    chip.append(areaDot(areaTone(area, planner(api.data()).areas)), el('span', 'wr-label', area.title + '?'));
    row.append(chip);
  }
  return [el('p', 'wr-lens-head', 'Stuck? Ask yourself about each Area'), row];
}
