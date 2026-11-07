import {inboxTasks} from './review-state.mjs';
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
  const parts = heading('Empty your head');
  parts.push(quickAdd(api, ctx), ...lenses(api));
  if (!inbox.length) {
    parts.push(el('p', 'wr-quiet', 'Nothing in the Inbox. Type anything still on your mind above.'));
    return parts;
  }
  // The newest few show at once, so what was just added is in view; the rest wait behind one row.
  const newest = [...inbox].sort((a, b) => Number(b.id) - Number(a.id));
  const shown = api.ui.inboxOpen ? newest : newest.slice(0, INBOX_PREVIEW);
  parts.push(sectionHead('Inbox', inbox.length));
  const list = el('ul', 'wr-list');
  list.setAttribute('aria-label', 'Inbox');
  for (const task of shown) {
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
      if (when) meta.append(el('span', when.overdue ? 'overdue' : '', when.text));
      if (clash) {
        const tag = el('span', 'wr-clash-tag');
        tag.append(icon('event_busy'), el('span', '', 'Clash'));
        tag.setAttribute('role', 'img');
        tag.setAttribute('aria-label', 'Calendar clash, decided in step 4');
        meta.append(tag);
      }
      text.append(meta);
    }
    item.append(text);
    if (ctx.deleteTask) {
      item.classList.add('swipe-task');
      attachTaskSwipe(item, {schedule: ctx.scheduleTask ? () => ctx.scheduleTask(task, item) : null, remove: () => ctx.deleteTask(task)});
    }
    list.append(item);
  }
  if (inbox.length > INBOX_PREVIEW) {
    const more = el('li', 'wr-list-more');
    more.append(inboxToggle(api, inbox.length));
    list.append(more);
  }
  parts.push(list);
  return parts;
}

const INBOX_PREVIEW = 4;

/** The list's last row: the rest of the Inbox, or back to the newest. */
function inboxToggle(api, count) {
  const open = Boolean(api.ui.inboxOpen);
  const toggle = button(open ? 'Show fewer' : `Show all ${count}`, () => { api.ui.inboxOpen = !open; api.render(); }, 'wr-idle-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.dataset.key = 'inbox-toggle';
  toggle.append(icon(open ? 'expand_less' : 'expand_more'));
  return toggle;
}

/** Type a thought and press Enter: it lands in the Inbox in your own words, with Undo, and you stay here. An empty
 * field offers Capture (voice and the full composer) in the same place Send takes once there is text. */
function quickAdd(api, ctx) {
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
  const capture = iconButton('mic', 'Open Capture', () => ctx.openCapture(), 'wr-icon-btn wr-add-capture');
  const sync = () => {
    const empty = !input.value.trim();
    send.hidden = empty;
    capture.hidden = !empty;
  };
  input.addEventListener('input', () => { ui.draft = input.value; sync(); });
  sync();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const words = input.value.trim();
    if (!words) return;
    ui.draft = '';
    input.value = '';
    sync();
    api.run({type: 'saveTask', fields: {title: words}}, 'Added to Inbox');
  });
  form.append(icon('add'), input, capture, send);
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
    chip.append(areaDot(areaTone(area, planner(api.data()).areas)), el('span', 'wr-label', area.title));
    row.append(chip);
  }
  return [row];
}
