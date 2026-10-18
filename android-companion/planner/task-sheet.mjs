import {localDay} from '../planner-state.mjs';
import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {el, icon, button, iconButton, labelButton} from './dom.mjs';
import {duration} from './format.mjs';
import {reducedMotion, slideScroll, waitMotion, DURATION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {toggleDone} from './task-row.mjs';
import {whenOf, whenFields, whenLabel, repeatValue, repeatLabel, foldGroup, fold, fieldRow, repeatChooser} from './task-fields.mjs';
import {NEEDS_TIME, SNACKBAR_ROOM, alertText, clashText, findTask, inlineText, saver, scheduleCheck, syncText} from './sheet-parts.mjs';
import {scheduleMenu, taskMenu} from './task-actions.mjs';
import {RETURN_FADE, RETURN_HOLD, inboxShowing, markReturned, showInbox} from './task-lists.mjs';
import {whenCard} from './task-when.mjs';
import {blockField} from './block-face.mjs';

/** True when anything kept under "More details" has words or a setting, so the sheet opens with it shown. */
export const hasMoreDetails = (task, inBlock) => !!(repeats(task) || task.notes || task.leverage || (!inBlock && task.purpose));

/**
 * Task sheet: the title, one When card (day, time, length, alert), Must, the Block, and More details (repeat, details,
 * why, who could help, the original words). Each edits where it is and saves at once. `occurrence` is the repeat being
 * looked at; `focus` opens one part's choices ('date', 'block').
 */
export function openTask(app, id, occurrence, {focus = null} = {}) {
  const task = findTask(app, id);
  if (!task) {
    app.notice('This task is no longer available.');
    return;
  }
  const fromInbox = inboxShowing(app);
  app.state.focusedTaskId = id;
  app.state.focusedBlockId = task.blockId ?? null;
  const anchor = task.planned;
  const live = () => findTask(app, id);
  const when = t => (repeats(t) ? (occurrence && t.planned === anchor ? occurrence : nextOccurrence(t)) : t.planned);
  const {body, actions, header, sheet} = openSheet(app, 'Task', {variant: 'detail sheet-task'});
  sheet.style.removeProperty('--sheet-pin');
  sheet.style.removeProperty('height');
  const save = saver(app);
  const commit = (fields, label) => save({type: 'saveTask', id, fields}, label);
  const group = foldGroup(body);

  const more = iconButton('more_vert', 'More task options', () => openMenu(more, taskMenu(app, live() ?? task, {
    move: () => group.open(block.row),
    helper: () => { showMore(true); leverage.focus(); },
    schedule: () => scheduleMenu(app, live() ?? task, more, {occurrence}),
    afterRemove: fromInbox ? () => showInbox(app, {motion: 'back'}) : null,
  })));
  header.querySelector('.sheet-close').before(more);
  const goBack = () => {
    if (body.contains(document.activeElement)) document.activeElement.blur();
    showInbox(app, {motion: 'back'});
    const row = app.dom.sheet.querySelector(`.task-row[data-task-id="${id}"]`);
    row?.querySelector('.task-main')?.focus({preventScroll: true});
    const total = RETURN_HOLD + RETURN_FADE;
    const clock = reducedMotion() ? null : document.createElement('i').animate([{}, {}], {duration: total});
    app.sheet.returned = {id, elapsed: () => (clock ? Number(clock.currentTime ?? total) : total)};
    if (row) markReturned(row, 0);
  };
  if (fromInbox) header.prepend(iconButton('arrow_back', 'Back to Inbox', goBack, {cls: 'sheet-back'}));

  const titleRow = el('div', 'detail-title-row');
  const check = button('', () => toggleDone(app, live() ?? task, when(live() ?? task)), 'task-check large');
  check.setAttribute('role', 'checkbox');
  const ring = el('span', 'check-ring');
  check.append(ring);
  const title = el('textarea', 'detail-title');
  title.rows = 1;
  title.value = task.title;
  title.maxLength = 200;
  title.setAttribute('aria-label', 'Task title');
  title.enterKeyHint = 'next';
  const grow = () => {
    title.style.height = 'auto';
    title.style.height = title.scrollHeight + 'px';
  };
  title.grow = grow;
  title.addEventListener('input', grow);
  let caretPlaced = false;
  title.addEventListener('mousedown', event => {
    if (caretPlaced || event.button > 0 || document.activeElement === title) return;
    caretPlaced = true;
    event.preventDefault();
    title.focus({preventScroll: true});
    title.setSelectionRange(title.value.length, title.value.length);
  });
  title.addEventListener('focus', () => { caretPlaced = true; });
  title.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    showMore(true);
    notes.focus({preventScroll: true});
    notes.setSelectionRange(notes.value.length, notes.value.length);
    const row = notes.closest('.detail-row');
    const hidden = row ? row.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 8 : 0;
    if (hidden > 0) slideScroll(body, Math.ceil(hidden));
  });
  requestAnimationFrame(grow);
  title.addEventListener('change', () => {
    const value = title.value.trim();
    if (!value) {
      title.value = live()?.title ?? task.title;
      return;
    }
    if (value !== live()?.title) commit({title: value}, 'Title saved');
  });
  titleRow.append(check, title);
  body.append(titleRow);

  const error = (row, message) => {
    let slot = row.inner.querySelector('.field-error');
    if (!slot) {
      slot = el('p', 'field-error');
      slot.setAttribute('role', 'alert');
      row.inner.prepend(slot);
    }
    slot.textContent = message;
  };
  const clearError = row => row.inner.querySelector('.field-error')?.remove();
  const clash = fold('clash-fold');
  const clashLine = el('p', 'field-alert');
  clash.inner.append(clashLine);
  let checkToken = 0;
  let checkedSlot = null;
  const recheck = async () => {
    const token = ++checkToken;
    try {
      const t = live();
      checkedSlot = t && `${t.planned}|${t.minutes}|${t.recurrence}|${t.repeatAfterDays}`;
      const {clashes, risk} = t?.planned ? await scheduleCheck(app, id, {}) : {clashes: [], risk: null};
      if (token !== checkToken || !body.isConnected) return;
      clashLine.replaceChildren(icon(clashes.length ? 'event_busy' : 'info'),
        el('span', '', clashes.length ? clashText(clashes) : risk ?? ''));
      clashLine.classList.toggle('is-clash', !!clashes.length);
      clash.node.setOpen(!!(clashes.length || risk));
    } catch {}
  };

  const now = t => ({...whenOf(t, when(t)), minutes: t.minutes ?? null, alert: t.alertIntent?.type ?? 'off', repeating: repeats(t)});
  const setWhen = (value, label) => {
    const t = live();
    if (!t) return;
    if (repeats(t) && !(value.day && value.time)) {
      error(whenRow, NEEDS_TIME + ' Turn off Repeat first.');
      return;
    }
    clearError(whenRow);
    whenRow.paint({...now(t), ...value});
    commit(whenFields(value), label).then(saved => { if (saved !== undefined) recheck(); });
  };
  const whenRow = whenCard(group, {
    get: () => now(live() ?? task),
    pickDay: day => {
      if (!day) return setWhen({day: '', time: ''}, 'Date removed');
      const value = {day, time: whenOf(live(), when(live())).time};
      setWhen(value, 'Moved to ' + whenLabel(value));
    },
    pickTime: time => {
      const value = {day: whenOf(live(), when(live())).day || localDay(), time};
      setWhen(value, time ? 'Moved to ' + whenLabel(value) : 'Time removed');
    },
    pickMinutes: minutes => commit({minutes}, minutes == null ? 'Length removed' : 'Length ' + duration(minutes))
      .then(saved => { if (saved !== undefined && live()?.planned) recheck(); }),
    pickAlert: value => commit({alert: value}, value === 'off' ? 'Alert off' : alertText(value, live()) + ' set'),
  });

  const must = button('', () => {
    const on = !(live() ?? task).must;
    paintMust(on);
    commit({must: on}, on ? 'Marked Must' : 'Must removed');
  }, 'detail-row must-row must-switch');
  must.setAttribute('role', 'switch');
  must.setAttribute('aria-label', 'Must');
  const mustIcon = icon('star');
  const track = el('span', 'switch-track');
  track.append(el('span', 'switch-thumb'));
  must.append(mustIcon, el('span', 'detail-text', 'Must'), track);
  const paintMust = on => {
    must.classList.toggle('must-on', on);
    mustIcon.classList.toggle('fill', on);
    must.setAttribute('aria-checked', String(on));
  };

  const block = blockField(app, group, {id, live, save});

  const repeatRow = fieldRow(group, {symbol: 'repeat', label: 'Repeat', build: inner => repeatChooser(inner, {
    get: () => ({value: repeatValue(live()), every: live()?.repeatAfterDays}),
    pick: (value, every) => {
      const t = live();
      if (value && !t?.planned) {
        error(repeatRow, NEEDS_TIME + ' Choose them under When first.');
        return;
      }
      clearError(repeatRow);
      const fields = {recurrence: value === 'after' ? null : value || null, repeatAfterDays: value === 'after' ? every : null};
      repeatRow.set(repeatLabel(fields), {muted: !value});
      if (value !== 'after') group.close();
      commit(fields, value ? 'Repeats: ' + repeatLabel(fields).toLowerCase() : 'Repeat turned off');
    },
  })});
  const moreToggle = button('', () => {
    const open = !moreFold.node.classList.contains('open');
    showMore(open);
    if (open) waitMotion(DURATION.medium1).then(() => {
      const below = moreToggle.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
      if (below > 0) slideScroll(body, Math.ceil(below));
    });
  }, 'detail-row more-toggle');
  const moreText = el('span', 'detail-text');
  moreToggle.append(icon('expand_more', {cls: 'more-caret'}), moreText);
  const moreFold = fold('more-fold');
  moreFold.node.id = `task-more-${id}`;
  moreToggle.setAttribute('aria-controls', moreFold.node.id);
  const showMore = open => {
    moreFold.node.setOpen(open);
    moreToggle.setAttribute('aria-expanded', String(open));
    moreToggle.classList.toggle('is-open', open);
    moreText.textContent = open ? 'Fewer details' : 'More details';
  };
  moreFold.inner.append(repeatRow.wrap);
  const notes = inlineText(moreFold.inner, 'notes', 'Add details', task.notes, value => commit({notes: value}, 'Details saved'));
  const why = inlineText(moreFold.inner, 'favorite', 'Why? (optional)', task.purpose, value => commit({purpose: value}, 'Why saved'));
  const leverage = inlineText(moreFold.inner, 'group', 'Who or what could help? (optional)', task.leverage,
    value => commit({leverage: value}, 'Saved'));
  if (task.raw && task.raw !== task.title) {
    const raw = el('details', 'original-capture');
    raw.append(el('summary', '', 'Original words'), el('p', '', task.raw));
    moreFold.inner.append(raw);
  }

  body.append(whenRow.wrap, clash.node, must, block.wrap, moreToggle, moreFold.node);
  const done = labelButton('check', 'Mark complete', () => toggleDone(app, live() ?? task, when(live() ?? task)), 'filled-btn grow');
  actions.append(done);

  const paint = t => {
    syncText(title, t.title);
    check.setAttribute('aria-checked', String(!!t.done));
    check.setAttribute('aria-label', `Mark ${t.title} ${t.done ? 'incomplete' : 'complete'}`);
    ring.replaceChildren(...(t.done ? [icon('check')] : []));
    whenRow.paint(now(t));
    repeatRow.set(repeatLabel(t), {muted: !repeats(t)});
    paintMust(!!t.must);
    block.paint(t);
    syncText(notes, t.notes);
    syncText(why, t.purpose);
    why.closest('.detail-row').hidden = !!app.context(t).block;
    syncText(leverage, t.leverage);
    if (done.dataset.done !== String(!!t.done)) {
      done.dataset.done = String(!!t.done);
      done.replaceChildren(icon(t.done ? 'undo' : 'check'), el('span', '', t.done ? 'Mark incomplete' : 'Mark complete'));
    }
  };
  showMore(hasMoreDetails(task, !!app.context(task).block));
  paint(task);
  for (const field of [title, notes, why, leverage]) field.grow();
  const cap = Math.min(innerHeight * 0.92, parseFloat(document.documentElement.style.getPropertyValue('--visual-height')) || innerHeight);
  sheet.style.setProperty('--sheet-pin', Math.min(cap, sheet.offsetHeight + SNACKBAR_ROOM) + 'px');

  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!app.sheet.live()) return false;
    const t = live();
    if (!t) return false;
    app.sheet.version = app.data().version;
    paint(t);
    group.current?.refresh();
    const slot = `${t.planned}|${t.minutes}|${t.recurrence}|${t.repeatAfterDays}`;
    if (slot !== checkedSlot && clash.node.classList.contains('open')) recheck();
    return true;
  };
  app.sheet.onBack = () => {
    if (!app.sheet.live()) return false;
    if (group.onBack()) return true;
    if (fromInbox) {
      goBack();
      return true;
    }
    if (body.contains(document.activeElement)) document.activeElement.blur();
    return false;
  };
  if (focus === 'date') group.open(whenRow);
  else if (focus === 'block') group.open(block.row);
}
