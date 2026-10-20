import {localDay} from '../planner-state.mjs';
import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button, iconButton} from './dom.mjs';
import {duration} from './format.mjs';
import {openSheet, closeSheet, isSheetOpen} from './sheet.mjs';
import {toggleDone} from './task-row.mjs';
import {whenOf, whenFields, whenLabel, repeatValue, repeatLabel, startNowValue, clockOf} from './task-values.mjs';
import {NEEDS_TIME, alertText, clashText, findTask, saver, scheduleCheck, syncText} from './sheet-parts.mjs';
import {archiveTask, deleteTask, duplicateTask, undoLastCompletion, movePicker} from './task-actions.mjs';
import {RETURN_FADE, RETURN_HOLD, inboxShowing, markReturned, showInbox} from './task-lists.mjs';
import {taskHead} from './task-head.mjs';
import {taskFacts} from './task-facts.mjs';
import {factRow, textRow} from './fact-rows.mjs';

/** The ring's pop and the struck title hold this long before the sheet leaves. */
const COMPLETE_HOLD = 300;
const idle = async app => { while (app.saving) await new Promise(done => setTimeout(done, 16)); };

/** "Part of <Result>" with its Area hue and Purpose; it opens Move to Block over the sheet. */
function blockRow(app, onOpen) {
  const node = button('', onOpen, 'block-row');
  const copy = el('span', 'block-copy');
  const result = el('span', 'block-result');
  const purpose = el('span', 'block-purpose');
  copy.append(result, purpose);
  node.append(icon('target', {cls: 'block-icon'}), copy, icon('chevron_right', {cls: 'block-chevron'}));
  node.paint = t => {
    const {block, area} = app.context(t);
    if (block) node.dataset.tone = app.tone(area);
    else delete node.dataset.tone;
    result.textContent = block ? block.title : 'No block';
    purpose.textContent = block ? block.purpose || 'Add a Purpose to this Block' : 'Choose a Block';
    node.setAttribute('aria-label', block ? `Part of ${block.title}. Change Block` : 'No block. Choose a Block');
  };
  return node;
}

/** A footer action: a 24dp icon over its caption. */
function tool(symbol, label, onClick, cls = '') {
  const node = button('', onClick, ('tool-btn ' + cls).trim());
  node.append(icon(symbol), el('span', 'tool-label', label));
  return node;
}

/**
 * Task sheet: one level, nothing folded. The header holds the ring, the title and the Must star; then a row each for
 * the day, time, length, alert and repeat; the Block; notes and who could help; and a footer of actions. Every change
 * saves at once with Undo. `occurrence` is the repeat being looked at; `focus: 'date'` or `'length'` puts focus on that row's chosen chip.
 */
export function openTask(app, id, occurrence, {focus = null, motion = 'forward', fromInbox = inboxShowing(app)} = {}) {
  const task = findTask(app, id);
  if (!task) {
    app.notice('This task is no longer available.');
    return;
  }
  app.state.focusedTaskId = id;
  app.state.focusedBlockId = task.blockId ?? null;
  const anchor = task.planned;
  const live = () => findTask(app, id);
  const when = t => (repeats(t) ? (occurrence && t.planned === anchor ? occurrence : nextOccurrence(t)) : t.planned);
  const {body, actions, header} = openSheet(app, 'Task', {variant: 'detail sheet-task', showTitle: false, motion});
  const save = saver(app);
  const commit = (fields, label) => save({type: 'saveTask', id, fields}, label);
  const reopen = () => openTask(app, id, occurrence, {motion: 'back', fromInbox});

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
  const leave = () => (fromInbox ? goBack() : closeSheet(app));

  let completing = false;
  const toggle = async () => {
    const t = live() ?? task;
    if (t.done) return toggleDone(app, t, when(t), {keepSheet: true});
    if (completing) return undefined;
    completing = true;
    const tapped = performance.now();
    head.showDone();
    await idle(app);
    const ok = await toggleDone(app, t, when(t), {keepSheet: true});
    if (!ok) {
      completing = false;
      paint(live() ?? t);
      return undefined;
    }
    setTimeout(() => { if (body.isConnected && isSheetOpen(app)) leave(); }, Math.max(0, COMPLETE_HOLD - (performance.now() - tapped)));
    return undefined;
  };

  const head = taskHead({
    task,
    onToggle: toggle,
    onMust: on => {
      head.setMust(on);
      commit({must: on}, on ? 'Marked Must' : 'Must removed');
    },
    onTitle: words => { if (words !== live()?.title) commit({title: words}, 'Title saved'); },
    onEnter: () => {
      notes.focus({preventScroll: true});
      notes.setSelectionRange(notes.value.length, notes.value.length);
    },
  });
  header.querySelector('.sheet-close').before(head.row);
  const startable = t => startNowValue(t, {repeating: repeats(t)});
  const start = button('', () => {
    const value = startable(live());
    if (value) setWhen(value, 'Started at ' + clockOf(value.day, value.time));
  }, 'assist-chip task-start');
  start.append(icon('play_arrow'), el('span', 'chip-label', 'Start now'));
  head.row.append(start);
  if (fromInbox) header.prepend(iconButton('arrow_back', 'Back to Inbox', goBack, {cls: 'sheet-back'}));

  let checkToken = 0;
  let checkedSlot = null;
  const slotOf = t => `${t.planned}|${t.minutes}|${t.recurrence}|${t.repeatAfterDays}`;
  const recheck = async () => {
    const token = ++checkToken;
    try {
      const t = live();
      checkedSlot = t && slotOf(t);
      const {clashes, risk} = t?.planned ? await scheduleCheck(app, id, {}) : {clashes: [], risk: null};
      if (token !== checkToken || !body.isConnected) return;
      facts.clash.replaceChildren(icon(clashes.length ? 'event_busy' : 'info'), el('span', '', clashes.length ? clashText(clashes) : risk ?? ''));
      facts.clash.classList.toggle('is-clash', !!clashes.length);
      facts.clash.hidden = !(clashes.length || risk);
    } catch {}
  };

  const now = t => ({...whenOf(t, when(t)), minutes: t.minutes ?? null, alert: t.alertIntent?.type ?? 'off',
    repeat: repeatValue(t), every: t.repeatAfterDays ?? null, repeating: repeats(t)});
  const setWhen = (value, label) => {
    const t = live();
    if (!t) return;
    if (repeats(t) && !(value.day && value.time)) {
      facts.error('day', NEEDS_TIME + ' Turn off Repeat first.');
      facts.paint(now(t));
      return;
    }
    facts.error('day', '');
    facts.paint({...now(t), ...value});
    commit(whenFields(value), label).then(saved => { if (saved !== undefined) recheck(); });
  };
  const current = () => whenOf(live(), when(live()));
  const facts = taskFacts({
    get: () => now(live() ?? task),
    pick: {
      day: day => {
        if (!day) return setWhen({day: '', time: ''}, 'Date removed');
        const value = {day, time: current().time};
        return setWhen(value, 'Moved to ' + whenLabel(value));
      },
      time: time => {
        const value = {day: current().day || localDay(), time};
        setWhen(value, time ? 'Moved to ' + whenLabel(value) : 'Time removed');
      },
      minutes: minutes => {
        facts.paint({...now(live()), minutes});
        commit({minutes}, minutes == null ? 'Length removed' : 'Length ' + duration(minutes))
          .then(saved => { if (saved !== undefined && live()?.planned) recheck(); });
      },
      alert: value => commit({alert: value}, value === 'off' ? 'Alert off' : alertText(value, live()) + ' set'),
      repeat: (value, every) => {
        const t = live();
        if (value && !t?.planned) {
          facts.error('repeat', NEEDS_TIME + ' Choose them above first.');
          facts.paint(now(t));
          return;
        }
        facts.error('repeat', '');
        const fields = {recurrence: value === 'after' ? null : value || null, repeatAfterDays: value === 'after' ? every : null};
        commit(fields, value ? 'Repeats: ' + repeatLabel(fields).toLowerCase() : 'Repeat turned off');
      },
    },
  });

  const block = blockRow(app, () => movePicker(app, live() ?? task, {back: reopen}));
  const notes = textRow(body, 'notes', 'Notes', task.notes, value => commit({notes: value}, 'Notes saved'));
  const helper = textRow(body, 'group', 'Who could help', task.leverage, value => commit({leverage: value}, 'Saved'));
  const why = textRow(body, 'favorite', 'Why', task.purpose, value => commit({purpose: value}, 'Why saved'));
  const fields = [...body.children];
  const facets = el('div', 'task-facts');
  facets.append(...facts.rows);
  body.replaceChildren(facets, block, ...fields);
  if (task.raw && task.raw !== task.title) {
    body.append(factRow('format_quote', el('p', 'original-words', task.raw), {cls: 'original-row'}));
  }

  actions.setAttribute('role', 'toolbar');
  actions.setAttribute('aria-label', 'Task actions');
  const after = ok => { if (ok && fromInbox) showInbox(app, {motion: 'back'}); };
  const undoLast = tool('undo', 'Undo last completion', () => undoLastCompletion(app, live() ?? task));
  actions.append(
    tool('auto_awesome', 'Ask Capture', () => app.capture()),
    tool('content_copy', 'Duplicate', () => duplicateTask(app, live() ?? task)),
    tool('archive', 'Archive', () => archiveTask(app, live() ?? task).then(after)),
    tool('delete', 'Delete', () => deleteTask(app, live() ?? task, {keepSheet: false}).then(after), 'danger'),
    undoLast,
  );

  const paint = t => {
    if (!completing) head.paint(t);
    start.hidden = completing || !startable(t);
    facts.paint(now(t));
    block.paint(t);
    syncText(notes, t.notes);
    syncText(helper, t.leverage);
    syncText(why, t.purpose);
    why.closest('.edit-row').hidden = !!app.context(t).block || (!t.purpose && document.activeElement !== why);
    undoLast.hidden = !(t.completions?.length && repeats(t));
  };
  paint(task);
  facts.reveal();
  for (const field of [notes, helper, why]) field.grow();
  const focusRow = {date: 'Day', length: 'Length'}[focus];
  if (focusRow) body.querySelector(`[aria-label=${focusRow}] button.chip[aria-pressed=true]`)?.focus({preventScroll: true});

  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!app.sheet.live()) return false;
    const t = live();
    if (!t) return false;
    app.sheet.version = app.data().version;
    paint(t);
    if (slotOf(t) !== checkedSlot && !facts.clash.hidden) recheck();
    return true;
  };
  app.sheet.onBack = () => {
    if (!app.sheet.live()) return false;
    if (fromInbox) {
      goBack();
      return true;
    }
    if (body.contains(document.activeElement)) document.activeElement.blur();
    return false;
  };
}
