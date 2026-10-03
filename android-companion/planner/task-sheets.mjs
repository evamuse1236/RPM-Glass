/**
 * The task sheet edits in place: every row unfolds its choices under itself and a choice saves at once (Undo in the
 * snackbar), so there is no separate editor. Quick add uses the same choices. Also the task-level actions (move,
 * order, duplicate, archive, delete, restore) and the Inbox.
 */
import {tasks, blockTasks, localDay, conflicts} from '../planner-state.mjs';
import {repeats, nextOccurrence, occurrences} from '../planner-recurrence.mjs';
import {calendarLabel, calendarRisk, calendarRows} from '../planner-calendar.mjs';
import {rankResults} from '../review-state.mjs';
import {el, icon, button, iconButton, labelButton, emptyState} from './dom.mjs';
import {clock, duration, timeRange, dateText} from './format.mjs';
import {animateRerender, reducedMotion, slideScroll, EASE, DURATION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen, discardDraft, rememberValue} from './sheet.mjs';
import {openMenu, closeMenu} from './menu.mjs';
import {taskRow, toggleDone} from './task-row.mjs';
import {
  whenOf, whenFields, whenLabel, clockOf, dayPresets, timePresets, repeatValue, repeatLabel, parseWhen,
  schedulePresets, blockMatches, hashToken, hashTag, withoutTag,
  foldGroup, fold, foldFor, fieldRow, choiceChip, markChips, chipRow,
  dateChooser, durationChooser, repeatChooser, alertChooser, blockChooser, recentBlock, rememberBlock,
} from './task-fields.mjs';

const findTask = (app, id) => tasks(app.data()).find(task => task.id === id);
const NEEDS_TIME = 'A repeating task needs a date and time.';
const SNACKBAR_ROOM = 68; // a docked one-line snackbar: 48dp, 8dp above the actions, 12dp above the content

/** Saves one after another, so a choice made while another save is still in flight is never dropped. */
function saver(app) {
  let chain = Promise.resolve();
  const idle = async () => { while (app.saving) await new Promise(done => setTimeout(done, 16)); };
  return (op, label) => {
    const run = chain.then(idle).then(() => app.commit(op, {keepSheet: true, label}));
    chain = run.catch(() => {});
    return run.catch(() => undefined);
  };
}

/** A borderless field that grows with its text and saves when it loses focus. */
function inlineText(host, symbol, label, value, onSave, cls = '') {
  const wrap = el('label', 'detail-row detail-field ' + cls);
  const input = el('textarea');
  input.rows = 1;
  input.placeholder = label;
  input.value = value ?? '';
  input.setAttribute('aria-label', label);
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  };
  input.addEventListener('input', grow);
  requestAnimationFrame(grow);
  input.addEventListener('change', () => onSave(input.value));
  input.grow = grow;
  wrap.append(icon(symbol), input);
  host.append(wrap);
  return input;
}

/** Put a saved value back into a text field, unless the user is typing in it. */
function syncText(input, value) {
  if (document.activeElement === input || input.value === (value ?? '')) return;
  input.value = value ?? '';
  input.grow?.();
}

/** The Block this task's words point to (the weekly review's suggestion), or null. */
function suggestBlock(app, task, exclude = null) {
  if (!task?.title?.trim()) return null;
  const candidates = app.activeBlocks().filter(b => b.id !== exclude).map(b => ({...b, blockId: b.id}));
  if (!candidates.length) return null;
  return rankResults(app.data(), task, candidates).suggested;
}

/** Calendar and Plan clashes for a task's time. Never blocks a save: the sheet says it in words. */
async function scheduleCheck(app, id, fields) {
  const existing = id ? findTask(app, id) : null;
  const candidate = {...existing, ...fields};
  const planned = candidate.planned;
  const minutes = candidate.minutes ?? 30;
  if (!planned) return {clashes: [], risk: null};
  const anchor = repeats(candidate) ? nextOccurrence(candidate) : planned;
  const copy = await app.api.native('calendarRead', {anchor: Date.parse(anchor)});
  app.state.calendar = calendarRows(copy);
  app.state.calendarState = calendarLabel(copy);
  const start = Date.parse(anchor);
  const risk = calendarRisk(copy, start, start + minutes * 60000);
  const window = start + (repeats(candidate) ? 21 * 86400000 : 1);
  const clashes = occurrences(candidate, start, window)
    .flatMap(o => conflicts(app.data(), o.start, minutes, app.state.calendar, id))
    .filter((e, i, all) => all.findIndex(x => x.id === e.id && x.start === e.start) === i);
  return {clashes, risk};
}

function clashText(clashes) {
  const names = clashes.slice(0, 2).map(c => `${c.title} (${dateText(c.start)}, ${timeRange(c.start, c.end)})`);
  const more = clashes.length > 2 ? ` and ${clashes.length - 2} more` : '';
  return `Clashes with ${names.join(' and ')}${more}`;
}

/** The task's place in the plan: its Result and Purpose, opening the Block. */
function partOf(app, task) {
  const context = app.context(task);
  const panel = button('', () => app.openBlock(context.block.id), 'part-of');
  panel.dataset.tone = app.tone(context.area);
  panel.append(el('span', 'overline', 'Part of'), el('strong', 'part-result', context.block.title));
  panel.append(el('span', 'part-purpose', context.block.purpose || 'Add a Purpose to this Block'));
  const crumbs = [context.area?.title, context.project?.title].filter(Boolean).join(' › ');
  if (crumbs) panel.append(el('span', 'part-crumbs', crumbs));
  panel.setAttribute('aria-label', `Part of ${context.block.title}. Purpose: ${context.block.purpose || 'none yet'}. Open Block`);
  return panel;
}

/**
 * Task sheet. Title, date and time, estimate, repeat, alert, Must, Block, notes: each edits where it is and saves
 * at once. `occurrence` is the repeat being looked at; `focus` opens one row's choices ('date', 'block').
 */
export function openTask(app, id, occurrence, {focus = null} = {}) {
  const task = findTask(app, id);
  if (!task) {
    app.notice('This task is no longer available.');
    return;
  }
  // Opened from the Inbox: Back (the arrow, Android Back, Escape) returns to it; X closes everything.
  const fromInbox = inboxShowing(app);
  app.state.focusedTaskId = id;
  app.state.focusedBlockId = task.blockId ?? null;
  const anchor = task.planned;
  const live = () => findTask(app, id);
  const when = t => (repeats(t) ? (occurrence && t.planned === anchor ? occurrence : nextOccurrence(t)) : t.planned);
  const {body, actions, header, sheet} = openSheet(app, 'Task', {variant: 'detail sheet-task'});
  sheet.style.removeProperty('--sheet-pin');
  sheet.style.removeProperty('height'); // a leaving sheet's frozen height (planner.mjs) is not this one's
  const save = saver(app);
  const commit = (fields, label) => save({type: 'saveTask', id, fields}, label);
  const group = foldGroup(body);

  const more = iconButton('more_vert', 'More task options', () => openMenu(more, taskMenu(app, live() ?? task, {
    move: () => group.open(blockRow),
    helper: () => { leverage.closest('.detail-row').hidden = false; leverage.focus(); },
    schedule: () => scheduleMenu(app, live() ?? task, more, {occurrence}),
    afterRemove: fromInbox ? () => showInbox(app, {motion: 'back'}) : null,
  })));
  header.querySelector('.sheet-close').before(more);
  const goBack = () => {
    if (body.contains(document.activeElement)) document.activeElement.blur();
    showInbox(app, {motion: 'back'});
    // Focus returns to the row the task was opened from, which shows a soft rounded highlight that fades (a keyboard
    // user gets the focus ring instead).
    const row = app.dom.sheet.querySelector(`.task-row[data-task-id="${id}"]`);
    row?.querySelector('.task-main')?.focus({preventScroll: true});
    if (row) {
      // It holds while the Inbox slides back in (300ms), then fades out over 200ms (standard), never snapping off.
      row.classList.add('returned');
      const clear = () => row.classList.remove('returned');
      if (reducedMotion()) setTimeout(clear, 600);
      else {
        row.animate([{opacity: 1}, {opacity: 1, offset: .6, easing: EASE.standard}, {opacity: 0}],
          {duration: 500, pseudoElement: '::after', fill: 'forwards'}).finished.then(clear, clear);
      }
    }
  };
  if (fromInbox) header.prepend(iconButton('arrow_back', 'Back to Inbox', goBack, {cls: 'sheet-back'}));

  // Title and completion
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
  // The first tap into the title puts the caret at the end of the words (to add to them or rename), not wherever the
  // finger landed mid-word; later taps place it normally.
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
    if (event.key === 'Enter') {
      // Next goes on to the details (the title saves as it loses focus); Enter in the details is a new line.
      event.preventDefault();
      notes.focus({preventScroll: true});
      notes.setSelectionRange(notes.value.length, notes.value.length);
      // Only if the details would be out of sight does the body move, and then as one short slide.
      const row = notes.closest('.detail-row');
      const hidden = row ? row.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 8 : 0;
      if (hidden > 0) slideScroll(body, Math.ceil(hidden));
    }
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

  // Date and time, with any clash said under it
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
  const setWhen = (value, label, {close = false} = {}) => {
    const t = live();
    if (!t) return;
    if (repeats(t) && !(value.day && value.time)) {
      error(dateRow, NEEDS_TIME + ' Turn off Repeat first.');
      return;
    }
    clearError(dateRow);
    dateRow.set(whenLabel(value), {muted: !value.day});
    if (close) group.close();
    commit(whenFields(value), label).then(saved => { if (saved !== undefined) recheck(); });
  };
  const dateRow = fieldRow(group, {symbol: 'schedule', label: 'Date', cls: 'date-field', build: inner => dateChooser(inner, {
    presets: false,
    noDate: true,
    get: () => whenOf(live() ?? task, when(live() ?? task)),
    pickDay: day => {
      const current = whenOf(live(), when(live()));
      if (!day) return setWhen({day: '', time: ''}, 'Date removed', {close: true});
      const value = {day, time: current.time};
      // A day keeps the chooser open for the time; one already set stays, as most planners keep it.
      setWhen(value, 'Moved to ' + whenLabel(value), {close: false});
      dateRow.refresh();
    },
    pickTime,
  })});

  // The likeliest days sit on the date row itself: one tap saves the day (keeping its time), then the time chips
  // unfold in place for an optional second tap. The row's own tap still unfolds every choice.
  const pickTime = time => {
    const current = whenOf(live(), when(live()));
    const value = {day: current.day || localDay(), time};
    setWhen(value, time ? 'Moved to ' + whenLabel(value) : 'Time removed', {close: true});
  };
  const quickDays = chipRow('date-quick');
  quickDays.setAttribute('role', 'group');
  quickDays.setAttribute('aria-label', 'Day');
  for (const [label, day, aria] of dayPresets()) {
    quickDays.append(choiceChip(label, day, () => {
      const t = live();
      if (!t) return;
      const value = {day, time: whenOf(t, when(t)).time};
      setWhen(value, 'Moved to ' + whenLabel(value));
      group.open(timesRow);
      timesRow.refresh();
    }, {aria}));
  }
  const times = fold('time-fold');
  const timeChips = chipRow('time-chips');
  timeChips.setAttribute('role', 'group');
  timeChips.setAttribute('aria-label', 'Time');
  times.inner.append(timeChips);
  const drawTimes = () => {
    const t = live() ?? task;
    const {day, time} = whenOf(t, when(t));
    timeChips.replaceChildren(...timePresets(time).map(value => choiceChip(clockOf(day, value), value, pickTime)),
      ...(repeats(t) ? [] : [choiceChip('No time', '', pickTime)]));
    markChips(timeChips, time);
  };
  const timesRow = {
    node: times.node, inner: times.inner,
    get isOpen() { return times.node.classList.contains('open'); },
    open() { drawTimes(); times.node.setOpen(true); },
    close() {
      const hadFocus = times.node.contains(document.activeElement);
      times.node.setOpen(false);
      if (hadFocus) dateRow.head.focus({preventScroll: true});
    },
    refresh: drawTimes,
  };
  dateRow.wrap.insertBefore(quickDays, dateRow.node);
  dateRow.wrap.insertBefore(times.node, dateRow.node);

  const pickMinutes = minutes => {
    durationRow.set(duration(minutes), {muted: minutes == null});
    markChips(quickMinutes, minutes == null ? '' : String(minutes));
    group.close();
    commit({minutes}, minutes == null ? 'Estimate removed' : 'Estimate ' + duration(minutes))
      .then(saved => { if (saved !== undefined && live()?.planned) recheck(); });
  };
  const durationRow = fieldRow(group, {symbol: 'timer', label: 'Estimate', build: inner => durationChooser(inner, {
    get: () => live()?.minutes ?? null,
    pick: pickMinutes,
  })});
  // As on the date row, the likeliest estimates sit on the row itself (one tap saves); the row's tap unfolds the rest.
  const quickMinutes = chipRow('date-quick estimate-quick');
  quickMinutes.setAttribute('role', 'group');
  quickMinutes.setAttribute('aria-label', 'Estimate');
  for (const n of [15, 30, 60]) {
    quickMinutes.append(choiceChip(duration(n), String(n), value => pickMinutes(Number(value)), {aria: 'Estimate ' + duration(n)}));
  }
  durationRow.wrap.insertBefore(quickMinutes, durationRow.node);

  const repeatRow = fieldRow(group, {symbol: 'repeat', label: 'Repeat', build: inner => repeatChooser(inner, {
    get: () => ({value: repeatValue(live()), every: live()?.repeatAfterDays}),
    pick: (value, every) => {
      const t = live();
      if (value && !t?.planned) {
        error(repeatRow, NEEDS_TIME + ' Choose them above first.');
        return;
      }
      clearError(repeatRow);
      const fields = {recurrence: value === 'after' ? null : value || null, repeatAfterDays: value === 'after' ? every : null};
      repeatRow.set(repeatLabel(fields), {muted: !value});
      if (value !== 'after') group.close();
      commit(fields, value ? 'Repeats: ' + repeatLabel(fields).toLowerCase() : 'Repeat turned off');
    },
  })});

  const alertRow = fieldRow(group, {symbol: 'notifications', label: 'Alert', build: inner => alertChooser(inner, {
    get: () => live()?.alertIntent?.type ?? 'off',
    pick: value => {
      alertRow.set(alertText(value, live()), {muted: value === 'off'});
      group.close();
      commit({alert: value}, value === 'off' ? 'Alert off' : alertText(value, live()) + ' set');
    },
  })});

  const must = button('', () => {
    const on = !(live() ?? task).must;
    paintMust(on);
    commit({must: on}, on ? 'Marked Must' : 'Must removed');
  }, 'detail-row must-row');
  const mustIcon = icon('star');
  const mustText = el('span', 'detail-text');
  must.append(mustIcon, mustText);
  const paintMust = on => {
    must.classList.toggle('must-on', on);
    mustIcon.classList.toggle('fill', on);
    mustText.textContent = on ? 'Must' : 'Mark as Must';
    must.setAttribute('aria-pressed', String(on));
    must.setAttribute('aria-label', 'Must');
  };

  // Block: the Part of panel when there is one (its Change button unfolds the list), otherwise a row with the
  // suggested Block one tap away.
  const pickBlock = (blockId, blockTitle) => {
    group.close();
    rememberBlock(blockId);
    save({type: 'moveTask', id, blockId}, blockId ? 'Moved to ' + blockTitle : 'Moved to No block');
  };
  const blockRow = fieldRow(group, {symbol: 'stacks', label: 'Block', cls: 'block-field', build: inner => blockChooser(inner, {
    blocks: () => app.activeBlocks(),
    get: () => live()?.blockId ?? null,
    pick: pickBlock,
    recent: recentBlock(),
    suggested: suggestBlock(app, live(), live()?.blockId)?.id ?? null,
  })});
  const panelSlot = el('div', 'part-of-slot');
  const suggestSlot = el('div', 'suggest-slot');
  // The row, the Part of card and the suggestion share one face, whose height animates when the Block changes.
  const face = el('div', 'block-face');
  blockRow.wrap.insertBefore(face, blockRow.node);
  face.append(blockRow.head, panelSlot, suggestSlot);
  let panelKey = null;
  let faceMotion = [];
  // Choosing a Block is one continuous change, a container transform: the face's box grows from the row's height to
  // the card's (250ms emphasized) and the card's fill opens from the row's box, while the content fades through (the
  // row's words out in 90ms, then the card's in over 160ms, so the two never overlap). Removing the Block runs the
  // same the other way.
  const paintBlock = t => {
    const context = app.context(t);
    const key = context.block ? `${context.block.id}|${context.block.title}|${context.block.purpose}` : '';
    const animate = panelKey !== null && key !== panelKey && !reducedMotion() && face.isConnected
      && !!face.getClientRects().length;
    const from = animate ? face.getBoundingClientRect().height : 0;
    let ghost = null;
    if (animate) {
      ghost = el('div', 'block-face-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      for (const part of face.children) if (!part.classList.contains('block-face-ghost')) ghost.append(part.cloneNode(true));
    }
    blockRow.head.hidden = !!context.block && !blockRow.isOpen;
    blockRow.set(context.block ? context.block.title : 'No block · Choose a Block', {aria: context.block ? context.block.title : 'No block'});
    if (key !== panelKey) {
      panelKey = key;
      panelSlot.replaceChildren();
      if (context.block) {
        const change = iconButton('edit', 'Change Block', () => group.toggle(blockRow), {cls: 'part-change'});
        panelSlot.append(partOf(app, t), change);
      }
    }
    const suggested = context.block ? null : suggestBlock(app, t);
    const suggestKey = suggested?.id ?? '';
    if (suggestSlot.dataset.key !== suggestKey) {
      suggestSlot.dataset.key = suggestKey;
      suggestSlot.replaceChildren();
      if (suggested) {
        const chip = button('', () => pickBlock(suggested.id, suggested.title), 'assist-chip suggest-chip');
        chip.append(icon('auto_awesome'), el('span', 'chip-label', suggested.title));
        chip.setAttribute('aria-label', `Suggested Block ${suggested.title}`);
        suggestSlot.append(chip);
      }
    }
    if (!animate) return;
    for (const motion of faceMotion) motion.cancel();
    face.querySelectorAll(':scope > .block-face-ghost').forEach(n => n.remove());
    const to = face.getBoundingClientRect().height;
    face.append(ghost);
    face.classList.add('resizing');
    face.dataset.toHeight = String(to);
    const motions = [
      face.animate([{height: from + 'px'}, {height: to + 'px'}], {duration: DURATION.medium1, easing: EASE.emphasized}),
      ghost.animate([{opacity: 1}, {opacity: 0}], {duration: 90, easing: EASE.standardAccelerate, fill: 'forwards'}),
    ];
    const card = panelSlot.querySelector('.part-of');
    const fresh = card ? [...card.children, panelSlot.querySelector('.part-change')]
      : [blockRow.head, suggestSlot].filter(n => !n.hidden && n.getClientRects().length);
    for (const part of fresh.filter(Boolean)) {
      motions.push(part.animate([{opacity: 0}, {opacity: 1}],
        {duration: 160, delay: 90, easing: EASE.standardDecelerate, fill: 'backwards'}));
    }
    if (card) {
      const top = card.getBoundingClientRect().top - face.getBoundingClientRect().top;
      const hidden = Math.max(0, card.offsetHeight - Math.max(0, from - top));
      motions.push(card.animate([{clipPath: `inset(0 0 ${hidden}px 0 round 20px)`}, {clipPath: 'inset(0 0 0 0 round 20px)'}],
        {duration: DURATION.medium1, easing: EASE.emphasized}));
    }
    faceMotion = motions;
    const end = () => {
      if (faceMotion !== motions) return;
      ghost.remove();
      face.classList.remove('resizing');
      delete face.dataset.toHeight;
    };
    Promise.all(motions.map(m => m.finished)).then(end, end);
  };

  body.append(dateRow.wrap, clash.node, durationRow.wrap, repeatRow.wrap, alertRow.wrap, must, blockRow.wrap);
  const notes = inlineText(body, 'notes', 'Add details', task.notes, value => commit({notes: value}, 'Details saved'));
  const why = inlineText(body, 'favorite', 'Why? (optional)', task.purpose, value => commit({purpose: value}, 'Why saved'));
  const leverage = inlineText(body, 'group', 'Who or what could help? (optional)', task.leverage,
    value => commit({leverage: value}, 'Saved'));
  if (task.raw && task.raw !== task.title) {
    const raw = el('details', 'original-capture');
    raw.append(el('summary', '', 'Original capture'), el('p', '', task.raw));
    body.append(raw);
  }
  const done = labelButton('check', 'Mark complete', () => toggleDone(app, live() ?? task, when(live() ?? task)), 'filled-btn grow');
  actions.append(done);

  const paint = t => {
    syncText(title, t.title);
    check.setAttribute('aria-checked', String(!!t.done));
    check.setAttribute('aria-label', `Mark ${t.title} ${t.done ? 'incomplete' : 'complete'}`);
    ring.replaceChildren(...(t.done ? [icon('check')] : []));
    const value = whenOf(t, when(t));
    dateRow.set(whenLabel(value), {muted: !value.day});
    durationRow.set(duration(t.minutes), {muted: t.minutes == null});
    markChips(quickMinutes, t.minutes == null ? '' : String(t.minutes));
    repeatRow.set(repeatLabel(t), {muted: !repeats(t)});
    const alert = t.alertIntent?.type ?? 'off';
    alertRow.wrap.hidden = !t.planned && alert === 'off';
    alertRow.set(alertText(alert, t), {muted: alert === 'off'});
    paintMust(!!t.must);
    markChips(quickDays, value.day);
    paintBlock(t);
    syncText(notes, t.notes);
    syncText(why, t.purpose);
    why.closest('.detail-row').hidden = !!app.context(t).block;
    syncText(leverage, t.leverage);
    if (t.leverage) leverage.closest('.detail-row').hidden = false;
    if (done.dataset.done !== String(!!t.done)) {
      done.dataset.done = String(!!t.done);
      done.replaceChildren(icon(t.done ? 'undo' : 'check'), el('span', '', t.done ? 'Mark incomplete' : 'Mark complete'));
    }
  };
  leverage.closest('.detail-row').hidden = !task.leverage;
  paint(task);
  // The sheet keeps the height it opened at: a row's choices unfold downward inside it, so the row tapped and
  // everything above it stay where they are.
  for (const field of [title, notes, why, leverage]) field.grow();
  // It also keeps room under its rows for the snackbar a save raises (48dp and its gaps), so the bar docks without
  // moving anything.
  const cap = Math.min(innerHeight * 0.92, parseFloat(document.documentElement.style.getPropertyValue('--visual-height')) || innerHeight);
  sheet.style.setProperty('--sheet-pin', Math.min(cap, sheet.offsetHeight + SNACKBAR_ROOM) + 'px');

  // Saves, Undo and outside changes re-render the shell, which calls sync: the rows update where they are.
  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!app.sheet.live()) return false;
    const t = live();
    if (!t) return false;
    app.sheet.version = app.data().version;
    paint(t);
    group.current?.refresh();
    // A clash shown for a time that Undo (or another change) has replaced is checked again.
    const slot = `${t.planned}|${t.minutes}|${t.recurrence}|${t.repeatAfterDays}`;
    if (slot !== checkedSlot && clash.node.classList.contains('open')) recheck();
    return true;
  };
  // Back closes an open chooser first; otherwise typing in a field is saved before the sheet goes.
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
  if (focus === 'date') group.open(dateRow);
  else if (focus === 'block') group.open(blockRow);
}

function alertText(type, task) {
  const at = task?.planned ? ' at ' + clock(task.planned) : '';
  if (type === 'reminder') return 'Reminder' + at;
  if (type === 'alarm') return 'Ringing alarm' + at;
  return 'No alert';
}

function taskMenu(app, task, inline = {}) {
  const items = [
    {label: 'Schedule', icon: 'event_upcoming', onClick: () => (inline.schedule ? inline.schedule() : scheduleMenu(app, task, null))},
    {label: 'Ask Capture', icon: 'mic', onClick: () => app.capture()},
    {label: 'Move to Block', icon: 'drive_file_move', onClick: () => (inline.move ? inline.move() : movePicker(app, task))},
  ];
  if (inline.helper && !task.leverage) items.push({label: 'Add who could help', icon: 'group', onClick: inline.helper});
  if (task.blockId != null || blockTasks(app.data(), null).length > 1) {
    items.push({label: 'Change Plan order', icon: 'swap_vert', onClick: () => planOrder(app, task)});
  }
  items.push({label: 'Duplicate', icon: 'content_copy', onClick: () => duplicate(app, task)});
  if (task.completions?.length && repeats(task)) {
    items.push({label: 'Undo last completion', icon: 'undo', onClick: () =>
      app.commit({type: 'reopenTask', id: task.id}, {label: 'Completion undone'}).catch(() => {})});
  }
  const after = ok => { if (ok && inline.afterRemove) inline.afterRemove(); };
  items.push({label: 'Archive', icon: 'archive', onClick: () => archiveTask(app, task).then(after)});
  items.push({divider: true}, {label: 'Delete', icon: 'delete', danger: true,
    onClick: () => deleteTask(app, task, {keepSheet: false}).then(after)});
  return items;
}

function duplicate(app, task) {
  const fields = {
    title: task.title, blockId: task.blockId ?? null, minutes: task.minutes, must: !!task.must,
    notes: task.notes ?? '', purpose: task.purpose ?? '', leverage: task.leverage ?? '',
  };
  app.commit({type: 'saveTask', fields}, {label: 'Task duplicated'}).catch(() => {});
}

/** Resolves true once archived. */
export function archiveTask(app, task) {
  return app.commit({type: 'archiveTask', id: task.id, disposition: 'archive'},
    {label: 'Archived. Restore it from Archive.'}).then(() => true, () => false);
}

/**
 * Delete at once, with Undo (and Trash keeps it): no confirmation for something that can be undone. A row swiped in
 * the Inbox leaves the Inbox open. Resolves true once deleted.
 */
export function deleteTask(app, task, {keepSheet = inboxShowing(app)} = {}) {
  return app.commit({type: 'archiveTask', id: task.id}, {label: 'Moved to Trash', keepSheet}).then(() => true, () => false);
}

/* ---------- Schedule: the swipe-right choices ---------- */

let scheduling = null;

/** Closes the schedule choices; true when they were open (Android Back closes them first). */
export function closeSchedule({restoreFocus = true} = {}) {
  if (!scheduling) return false;
  const {menu, scrim, returnTo} = scheduling;
  scheduling = null;
  scrim.remove();
  menu.inert = true;
  const gone = () => menu.remove();
  if (reducedMotion()) gone();
  else menu.animate([{opacity: 1}, {opacity: 0}], {duration: DURATION.short2, easing: EASE.standardAccelerate, fill: 'forwards'})
    .finished.then(gone, gone);
  if (restoreFocus && returnTo?.isConnected) returnTo.focus({preventScroll: true});
  return true;
}

/**
 * One-tap reschedules anchored to the swiped row (or the task sheet's More button): each choice is a whole date and
 * time and saves at once with Undo. "Pick a date…" opens the task sheet with its date choices unfolded.
 */
export function scheduleMenu(app, task, anchor, {occurrence = null} = {}) {
  closeMenu();
  closeSchedule({restoreFocus: false});
  const t = findTask(app, task.id) ?? task;
  const at = repeats(t) ? (occurrence ?? nextOccurrence(t)) : t.planned;
  const presets = schedulePresets(whenOf(t, at), new Date(), {repeating: repeats(t)});
  const scrim = button('', () => closeSchedule(), 'menu-scrim');
  scrim.setAttribute('aria-label', 'Close');
  const menu = el('div', 'menu schedule-menu');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Schedule ' + t.title);
  const heading = el('p', 'schedule-title');
  heading.append(icon('event_upcoming'), el('span', '', t.title));
  menu.append(heading);
  const pick = value => {
    closeSchedule();
    const label = value.day ? 'Moved to ' + whenLabel(value) : 'Date removed';
    app.commit({type: 'saveTask', id: t.id, fields: whenFields(value)}, {label, keepSheet: isSheetOpen(app)}).catch(() => {});
  };
  for (const preset of presets) {
    const row = button('', () => pick(preset.value), 'menu-item schedule-item');
    row.setAttribute('role', 'menuitemradio');
    row.setAttribute('aria-checked', String(preset.current));
    row.setAttribute('aria-label', [preset.label, preset.hint, preset.current ? 'current' : ''].filter(Boolean).join(', '));
    row.append(icon(preset.icon), el('span', 'schedule-label', preset.label));
    if (preset.current) row.append(icon('check', {cls: 'schedule-check'}));
    else if (preset.hint) row.append(el('span', 'schedule-hint tnum', preset.hint));
    menu.append(row);
  }
  menu.append(el('hr', 'menu-divider'));
  const other = button('', () => { closeSchedule({restoreFocus: false}); openTask(app, t.id, occurrence, {focus: 'date'}); },
    'menu-item schedule-item');
  other.setAttribute('role', 'menuitem');
  other.append(icon('calendar_month'), el('span', 'schedule-label', 'Pick a date…'));
  menu.append(other);
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSchedule();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...menu.querySelectorAll('.menu-item')];
      const next = items.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
      items[(next + items.length) % items.length]?.focus();
    }
  });
  document.body.append(scrim, menu);
  // Anchored to the row: under it when it fits, otherwise above it; a narrow anchor (a button) aligns its right edge.
  const box = (anchor?.isConnected ? anchor : app.dom.sheet).getBoundingClientRect();
  const width = menu.offsetWidth, height = menu.offsetHeight;
  const narrow = box.width < 160;
  const left = Math.max(8, Math.min(innerWidth - width - 8, narrow ? box.right - width : box.left + 16));
  const above = box.bottom + 4 + height > innerHeight - 8 && box.top - height - 4 >= 8;
  const top = above ? box.top - height - 4 : Math.max(8, Math.min(innerHeight - height - 8, box.bottom + 4));
  menu.style.setProperty('--menu-left', left + 'px');
  menu.style.setProperty('--menu-top', top + 'px');
  menu.style.transformOrigin = `${narrow ? 'right' : 'left'} ${above ? 'bottom' : 'top'}`;
  scheduling = {menu, scrim, returnTo: anchor?.querySelector?.('.task-main') ?? anchor};
  menu.querySelector('.schedule-item')?.focus({preventScroll: true});
}

export function movePicker(app, task) {
  const {body} = openSheet(app, 'Move to Block');
  body.append(el('p', 'sheet-note', 'Moving keeps the task, its schedule and its details.'));
  const choices = [...app.activeBlocks(), {id: null, title: 'No block'}];
  for (const block of choices) {
    const row = button('', () => app.commit({type: 'moveTask', id: task.id, blockId: block.id},
      {label: block.id ? 'Moved to ' + block.title : 'Moved to No block'}).catch(() => {}), 'choice-row');
    const selected = (task.blockId ?? null) === block.id;
    row.setAttribute('aria-pressed', String(selected));
    row.append(icon(block.id ? 'stacks' : 'inbox'), el('span', '', block.title));
    if (selected) row.append(icon('check', {cls: 'trailing'}));
    body.append(row);
  }
}

/** Accessible alternative to dragging: move one step in the Plan. */
export function planOrder(app, task) {
  const rows = blockTasks(app.data(), task.blockId);
  const index = rows.findIndex(row => row.id === task.id);
  const {body, actions} = openSheet(app, 'Plan order');
  body.append(el('p', 'sheet-lead', task.title),
    el('p', 'sheet-note', 'Plan order is the task’s priority. It does not change the scheduled time.'));
  const move = delta => {
    const ids = rows.map(row => row.id);
    const next = index + delta;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    app.commit({type: 'reorder', blockId: task.blockId, ids}, {label: 'Plan order changed'}).catch(() => {});
  };
  const up = labelButton('arrow_upward', 'Move up', () => move(-1), 'outlined-btn');
  const down = labelButton('arrow_downward', 'Move down', () => move(1), 'outlined-btn');
  up.disabled = index === 0;
  down.disabled = index === rows.length - 1;
  actions.append(up, down);
}

export function showTrash(app, archive = false) {
  const {body} = openSheet(app, archive ? 'Archive' : 'Trash');
  if (archive) {
    for (const block of app.p().blocks.filter(b => b.archived)) {
      const row = el('div', 'list-item');
      row.append(icon('stacks', {cls: 'leading'}), el('span', 'list-copy', block.title),
        button('Restore', () => app.commit({type: 'archiveBlock', id: block.id, archived: false},
          {label: 'Block restored'}).catch(() => {}), 'text-btn'));
      body.append(row);
    }
  }
  const rows = app.data().entries.filter(e => e.archived && (e.kind ?? 'plan') === 'plan'
    && (e.archiveDisposition === 'archive') === archive);
  if (!rows.length && !(archive && app.p().blocks.some(b => b.archived))) {
    body.append(emptyState({symbol: archive ? 'archive' : 'delete', title: archive ? 'Nothing archived' : 'Trash is empty'}));
  }
  for (const task of rows) {
    const row = el('div', 'list-item');
    row.append(icon('task_alt', {cls: 'leading'}), el('span', 'list-copy', task.title),
      button('Restore', () => app.commit({type: 'restoreTask', id: task.id}, {label: 'Task restored'})
        .catch(() => {}), 'text-btn'));
    body.append(row);
  }
}

/** True while the Inbox sheet is the one showing (not on its way out or being replaced). */
function inboxShowing(app) {
  const body = app.sheet.inboxBody;
  return isSheetOpen(app) && !!body?.isConnected && !body.closest('.sheet-ghost');
}

/** Inbox: open tasks that are not in a Block yet. Rows swipe as everywhere; a save updates the rows in place. */
export function showInbox(app, {motion = 'forward'} = {}) {
  const {body, actions} = openSheet(app, 'Inbox', {motion});
  app.sheet.inboxBody = body;
  // Fills a host with the rows: the body itself at first, then a detached copy that animateRerender reconciles in by
  // key (it needs the new content returned as an element, so unchanged rows stay and the changed ones move).
  const draw = (host = el('div')) => {
    const rows = blockTasks(app.data(), null).filter(task => !task.done);
    host.replaceChildren();
    if (!rows.length) {
      host.append(emptyState({symbol: 'inbox', title: 'Inbox is empty',
        body: 'New captures land here until you give them a Block.'}));
    } else {
      const note = el('p', 'sheet-note', 'Tasks not in a Block yet. Give each one a Result, or keep it here.');
      note.dataset.key = 'inbox-note';
      const jev = labelButton('auto_awesome', 'Sort with Jev', () => app.actions.jevSort(), 'tonal-btn');
      jev.dataset.key = 'inbox-jev';
      host.append(note, jev);
    }
    for (const task of rows) host.append(taskRow(app, task));
    return host;
  };
  draw(body);
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'),
    labelButton('add', 'Add task', () => taskEditor(app, null), 'filled-btn'));
  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!inboxShowing(app) || app.sheet.inboxBody !== body) return false;
    app.sheet.version = app.data().version;
    animateRerender(body, body, () => draw());
    return true;
  };
  app.sheet.onBack = () => false;
}

const DRAFT = 'task:new';


/** Quick add (no id) or, for an existing task, the task sheet itself: there is no separate editor. */
export function taskEditor(app, id, overrides = {}) {
  if (id) return openTask(app, id);
  return quickAdd(app, overrides);
}

/**
 * Quick add: the title first, then the likeliest choices as chips that need no opening (Today, Tomorrow, the next
 * weekend or week; the suggested and recent Block; Must), the rest unfolding under their chip. A day written in the
 * title ("tomorrow", "fri 9am") is read into the date and shown, removable. Add keeps the sheet open, with the day
 * and Block kept for the next task.
 */
function quickAdd(app, overrides = {}) {
  const {body, actions, sheet} = openSheet(app, 'New task', {draftKey: DRAFT, variant: 'form sheet-quick'});
  const draft = app.sheet.draftValues;
  const planned = overrides.planned ? whenOf({}, overrides.planned) : null;
  const s = {
    day: draft.Date ?? planned?.day ?? overrides.plannedDate ?? '',
    time: draft.Time ?? planned?.time ?? '',
    minutes: draft.Minutes ?? overrides.minutes ?? null, // null keeps the planner's default estimate
    blockId: draft.Block ?? overrides.blockId ?? null,
    must: !!draft.Must,
    repeat: draft.Repeat ?? '',
    every: draft.Every ?? 1,
    notes: draft.Notes ?? '',
    why: draft.Why ?? '',
    alert: draft.Alert ?? 'off',
  };
  const save = saver(app);
  const group = foldGroup(body);

  const name = el('input', 'quick-input');
  name.type = 'text';
  name.maxLength = 200;
  name.placeholder = 'New task';
  name.enterKeyHint = 'done';
  name.value = draft.Task ?? '';
  name.setAttribute('aria-label', 'Task');
  const nameWrap = el('label', 'quick-title');
  nameWrap.append(name);

  // What the title said about the day, shown before it is used, with Remove.
  const parsedFold = fold('parsed-fold');
  let parsed = null, dismissed = null, before = null;
  // A #word naming exactly one Block chooses it as typed (shown with Remove, the Block chip marked); the #word leaves
  // the title when the task is added. Several matches offer chips under the title instead.
  const tagFold = fold('parsed-fold tag-fold');
  let tag = null, tagDismissed = null, tagBefore = null;
  const readTitle = () => {
    const found = parseWhen(name.value);
    if (found && found.match.toLowerCase() !== dismissed) {
      if (!parsed) before = {day: s.day, time: s.time};
      parsed = found;
      s.day = found.day;
      s.time = found.time;
    } else if (parsed) {
      Object.assign(s, before);
      parsed = null;
    }
    const named = hashTag(name.value, app.activeBlocks());
    if (named && named.match.toLowerCase() !== tagDismissed) {
      if (!tag) tagBefore = s.blockId;
      tag = named;
      s.blockId = named.block.id;
    } else if (tag) {
      s.blockId = tagBefore;
      tag = null;
    }
  };
  const forgetParse = () => {
    if (parsed) dismissed = parsed.match.toLowerCase();
    parsed = null;
  };
  const forgetTag = () => {
    if (tag) tagDismissed = tag.match.toLowerCase();
    tag = null;
  };

  // Day chips, and the full day and time choices under the time chip
  const pickDay = (day, exact = false) => {
    forgetParse();
    if (!exact && s.day === day) Object.assign(s, {day: '', time: ''});
    else s.day = day;
    if (!s.day) s.time = '';
    changed();
  };
  const whenChips = chipRow('quick-row');
  for (const [label, day, aria] of dayPresets()) whenChips.append(choiceChip(label, day, value => pickDay(value), {aria}));
  const timeChip = button('', null, 'assist-chip');
  timeChip.append(icon('schedule'), el('span', 'chip-label'));
  whenChips.append(timeChip);
  const whenFold = foldFor(group, timeChip, inner => dateChooser(inner, {
    presets: false,
    get: () => ({day: s.day, time: s.time}),
    pickDay: day => { pickDay(day, true); whenFold.refresh(); },
    pickTime: time => {
      forgetParse();
      s.time = time;
      if (time && !s.day) s.day = localDay();
      group.close();
      changed();
    },
  }));

  // Block chips: the chosen one, the one the words point to, the recent one, No block, then the full list.
  const blockChips = chipRow('quick-row block-chips');
  const listChip = button('', null, 'assist-chip list-chip');
  listChip.append(icon('stacks'), el('span', 'chip-label', 'Choose Block'));
  const pickBlock = id => {
    forgetTag();
    s.blockId = id || null;
    group.close();
    changed();
  };
  const blockFold = foldFor(group, listChip, inner => blockChooser(inner, {
    blocks: () => app.activeBlocks(),
    get: () => s.blockId,
    pick: pickBlock,
    recent: recentBlock(),
    suggested: suggestBlock(app, {title: name.value})?.id ?? null,
  }));
  let blockKey = null;
  const paintBlocks = () => {
    const blocks = app.activeBlocks();
    const byId = id => blocks.find(b => b.id === id);
    const suggested = suggestBlock(app, {title: name.value});
    const ids = [...new Set([s.blockId, suggested?.id, recentBlock()].filter(id => id && byId(id)))].slice(0, 2);
    const key = ids.join('|') + '|' + (suggested?.id ?? '');
    if (key !== blockKey) {
      blockKey = key;
      blockChips.replaceChildren(...ids.map(id => {
        const chip = choiceChip(byId(id).title, id, pickBlock);
        if (id === suggested?.id) {
          chip.prepend(icon('auto_awesome', {cls: 'chip-lead'}));
          chip.setAttribute('aria-label', `Suggested Block ${byId(id).title}`);
        }
        return chip;
      }), choiceChip('No block', '', pickBlock), listChip);
      // With a Block chip showing, the full list needs only its icon, so the row stays on one line.
      listChip.classList.toggle('icon-only', ids.length > 0);
      listChip.setAttribute('aria-label', 'Choose a Block');
    }
    markChips(blockChips, s.blockId ?? '');
  };

  // Estimate, Must, Repeat, Details
  const moreChips = chipRow('quick-row');
  const durationChip = button('', null, 'assist-chip');
  durationChip.append(icon('timer'), el('span', 'chip-label'));
  const mustChip = button('', () => { s.must = !s.must; changed(); }, 'assist-chip must-chip');
  mustChip.append(icon('star'), el('span', 'chip-label', 'Must'));
  const repeatChip = button('', null, 'assist-chip');
  repeatChip.append(icon('repeat'), el('span', 'chip-label'));
  const detailsChip = button('', null, 'assist-chip');
  detailsChip.append(icon('notes'), el('span', 'chip-label', 'Details'));
  moreChips.append(durationChip, mustChip, repeatChip, detailsChip);
  const durationFold = foldFor(group, durationChip, inner => durationChooser(inner, {
    get: () => s.minutes,
    pick: minutes => { s.minutes = minutes; group.close(); changed(); },
  }));
  const repeatFold = foldFor(group, repeatChip, inner => repeatChooser(inner, {
    get: () => ({value: s.repeat, every: s.every}),
    pick: (value, every) => {
      Object.assign(s, {repeat: value, every});
      if (value !== 'after') group.close();
      changed();
    },
  }));
  let notes, why, alertRow;
  const detailsFold = foldFor(group, detailsChip, inner => {
    notes = inlineText(inner, 'notes', 'Add details', s.notes, () => {});
    notes.addEventListener('input', () => { s.notes = notes.value; remember(); });
    why = inlineText(inner, 'favorite', 'Why? (optional)', s.why, () => {});
    why.addEventListener('input', () => { s.why = why.value; remember(); });
    alertRow = el('div', 'alert-choices');
    alertChooser(alertRow, {get: () => s.alert, pick: value => { s.alert = value; changed(); }});
    inner.append(alertRow);
    const refresh = () => {
      syncText(notes, s.notes);
      syncText(why, s.why);
      why.closest('.detail-row').hidden = !!s.blockId;
      alertRow.hidden = !s.time;
      markChips(alertRow, s.alert);
    };
    refresh();
    return refresh;
  });

  // "#" and part of a Block's name offers the matching Blocks as chips; choosing one takes the "#word" out of the
  // title. Not choosing leaves the words as typed.
  const hashFold = fold('hash-fold');
  const hashChips = chipRow('quick-row hash-chips');
  hashChips.setAttribute('role', 'group');
  hashChips.setAttribute('aria-label', 'Blocks matching what you typed');
  hashFold.inner.append(hashChips);
  let hashKey = null;
  const paintHash = () => {
    if (!body.isConnected || !isSheetOpen(app)) return;
    const token = document.activeElement === name ? hashToken(name.value, name.selectionStart ?? name.value.length) : null;
    const recent = recentBlock();
    const blocks = app.activeBlocks().slice().sort((a, b) => (b.id === recent) - (a.id === recent));
    // The #word already chose its Block (shown above, with Remove): no chips for it.
    const chosen = token && tag && token.start === tag.start;
    const matches = token && !chosen ? blockMatches(blocks, token.query) : [];
    const key = token ? token.query + '|' + matches.map(b => b.id).join(',') : null;
    if (key === hashKey) return;
    hashKey = key;
    hashFold.node.setOpen(matches.length > 0);
    if (!matches.length) return;
    hashChips.replaceChildren(...matches.map(block => {
      const chip = button('', () => {
        const at = hashToken(name.value, name.selectionStart ?? name.value.length) ?? token;
        const rest = (name.value.slice(0, at.start) + name.value.slice(at.end)).replace(/\s{2,}/g, ' ');
        name.value = at.start === 0 ? rest.trimStart() : rest;
        const caret = Math.min(at.start, name.value.length);
        name.setSelectionRange(caret, caret);
        s.blockId = block.id;
        hashKey = null;
        readTitle();
        changed();
        name.focus({preventScroll: true});
      }, 'assist-chip hash-chip');
      // Keep the keyboard up: the title keeps focus while a chip is tapped.
      chip.addEventListener('pointerdown', event => event.preventDefault());
      chip.append(icon('stacks'), el('span', 'chip-label', block.title));
      chip.setAttribute('aria-label', 'Put in Block ' + block.title);
      return chip;
    }));
  };

  const parsedLine = el('div', 'parsed-line');
  parsedFold.inner.append(parsedLine);
  const tagLine = el('div', 'parsed-line');
  tagFold.inner.append(tagLine);
  const error = el('p', 'sheet-error');
  error.setAttribute('role', 'alert');
  body.append(nameWrap, hashFold.node, parsedFold.node, tagFold.node, whenChips, whenFold.node, blockChips, blockFold.node, moreChips,
    durationFold.node, repeatFold.node, detailsFold.node, error);

  const paint = () => {
    markChips(whenChips, s.day);
    const preset = dayPresets().some(([, day]) => day === s.day);
    timeChip.querySelector('.chip-label').textContent = s.day && !preset ? whenLabel(s) : s.time ? clockOf(s.day, s.time) : 'Time';
    timeChip.classList.toggle('on', !!s.time || (!!s.day && !preset));
    timeChip.classList.toggle('icon-only', !timeChip.classList.contains('on'));
    timeChip.setAttribute('aria-label', timeChip.classList.contains('on') ? 'Time: ' + timeChip.textContent.trim() : 'Time');
    paintBlocks();
    durationChip.querySelector('.chip-label').textContent = s.minutes == null ? 'Estimate' : duration(s.minutes);
    durationChip.classList.toggle('on', s.minutes != null);
    mustChip.classList.toggle('on', s.must);
    mustChip.setAttribute('aria-pressed', String(s.must));
    mustChip.querySelector('.ms').classList.toggle('fill', s.must);
    repeatChip.querySelector('.chip-label').textContent = s.repeat ? repeatLabel(s.repeat === 'after'
      ? {repeatAfterDays: s.every} : {recurrence: s.repeat}) : 'Repeat';
    repeatChip.classList.toggle('on', !!s.repeat);
    repeatChip.classList.toggle('icon-only', !s.repeat);
    repeatChip.setAttribute('aria-label', s.repeat ? 'Repeat: ' + repeatChip.textContent.trim() : 'Repeat');
    detailsChip.classList.toggle('on', !!(s.notes || s.why || s.alert !== 'off'));
    parsedFold.node.setOpen(!!parsed);
    if (parsed) {
      const remove = button('Remove', () => {
        forgetParse();
        Object.assign(s, before);
        changed();
      }, 'text-btn');
      remove.setAttribute('aria-label', `Remove the date read from “${parsed.match}”`);
      parsedLine.replaceChildren(icon('auto_awesome'),
        el('span', '', `${whenLabel(s)} · from “${parsed.match}”`), remove);
    }
    tagFold.node.setOpen(!!tag);
    if (tag) {
      const remove = button('Remove', () => {
        forgetTag();
        s.blockId = tagBefore;
        changed();
      }, 'text-btn');
      remove.setAttribute('aria-label', `Remove the Block read from “${tag.match}”`);
      tagLine.replaceChildren(icon('stacks'), el('span', '', `${tag.block.title} · from “${tag.match}”`), remove);
    }
    paintHash();
    group.current?.refresh();
    add.disabled = !name.value.trim();
  };

  const remember = () => {
    if (!name.value.trim()) {
      discardDraft(app);
      app.sheet.draftKey = DRAFT;
    } else {
      Object.assign(app.sheet.draftValues, {Task: name.value, Date: s.day, Time: s.time, Minutes: s.minutes,
        Block: s.blockId, Must: s.must, Repeat: s.repeat, Every: s.every, Notes: s.notes, Why: s.why, Alert: s.alert});
      rememberValue(app, 'Task', name.value);
    }
    setTimeout(() => { sheet.dataset.dirty = String(!!name.value.trim()); });
  };
  const changed = () => {
    error.textContent = '';
    remember();
    paint();
  };
  name.addEventListener('input', () => {
    readTitle();
    changed();
  });
  name.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') paintHash(); });
  name.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== name) paintHash(); }));
  // The keyboard's Done adds and keeps the sheet for the next task; the Add button adds and closes.
  name.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit({keepOpen: true});
    }
  });

  let adding = false;
  let leaving = false;
  const submit = async ({keepOpen = false} = {}) => {
    const named = tag && s.blockId === tag.block.id ? hashTag(name.value, app.activeBlocks()) : null;
    const title = (named && named.block.id === s.blockId ? withoutTag(name.value, named) : name.value).trim();
    if (!title || adding) return;
    if (s.repeat && !(s.day && s.time)) {
      error.textContent = NEEDS_TIME + ' Choose a day and a time.';
      return;
    }
    adding = true;
    add.disabled = true;
    const fields = {title, ...whenFields(s), blockId: s.blockId, must: s.must, notes: s.notes,
      purpose: s.blockId ? '' : s.why, recurrence: s.repeat === 'after' ? null : s.repeat || null,
      repeatAfterDays: s.repeat === 'after' ? s.every : null};
    if (s.minutes != null) fields.minutes = s.minutes;
    if (s.alert !== 'off') fields.alert = s.alert;
    let clash = '';
    if (fields.planned) {
      try {
        const {clashes} = await scheduleCheck(app, null, fields);
        if (clashes.length) clash = ' · clashes with ' + clashes[0].title;
      } catch {}
    }
    const block = app.activeBlocks().find(b => b.id === s.blockId);
    const where = [s.day ? whenLabel(s) : '', block?.title ?? ''].filter(Boolean);
    // Add closes the sheet: from here nothing in it changes (no chips redrawn by the save), so it leaves as it was.
    leaving = !keepOpen;
    const saved = await save({type: 'saveTask', fields}, (where.length ? 'Added to ' + where.join(' · ') : 'Added to Inbox') + clash);
    adding = false;
    if (saved === undefined) {
      leaving = false;
      add.disabled = !name.value.trim();
      return;
    }
    rememberBlock(s.blockId);
    if (!keepOpen) {
      discardDraft(app);
      app.closeSheet();
      return;
    }
    // Ready for the next task: the day (as it was before any words set it) and the Block stay.
    if (parsed) Object.assign(s, before);
    if (tag) s.blockId = tagBefore;
    parsed = null;
    dismissed = null;
    tag = null;
    tagDismissed = null;
    Object.assign(s, {must: false, repeat: '', every: 1, notes: '', why: '', alert: 'off'});
    name.value = '';
    group.close();
    changed();
    name.focus({preventScroll: true});
  };
  const add = button('Add', () => submit(), 'filled-btn');
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'), el('span', 'spacer'), add);
  readTitle();
  paint();

  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!app.sheet.live()) return false;
    app.sheet.version = app.data().version;
    if (!leaving) paint();
    return true;
  };
  app.sheet.onBack = () => app.sheet.live() && group.onBack();
  requestAnimationFrame(() => {
    name.focus();
    app.api.native('keyboard', {field: 'Task'}).catch(() => {});
  });
}
