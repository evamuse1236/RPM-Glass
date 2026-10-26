import {localDay, conflicts} from '../planner-state.mjs';
import {repeats, nextOccurrence} from '../planner-recurrence.mjs';
import {resultStatus} from '../review-state.mjs';
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button, iconButton} from './dom.mjs';
import {duration} from './format.mjs';
import {openSheet, closeSheet, isSheetOpen} from './sheet.mjs';
import {toggleDone} from './task-row.mjs';
import {whenOf, whenFields, whenLabel, repeatLabel, startNowValue, clockOf, leadLabel} from './task-values.mjs';
import {NEEDS_TIME, alertText, clashText, findTask, saver, scheduleCheck, suggestBlock, syncText} from './sheet-parts.mjs';
import {archiveTask, deleteTask, duplicateTask, undoLastCompletion} from './task-actions.mjs';
import {RETURN_FADE, RETURN_HOLD, inboxShowing, markReturned, showInbox} from './task-lists.mjs';
import {recentBlock, rememberBlock} from './task-fields.mjs';
import {taskHead} from './task-head.mjs';
import {taskTabs} from './task-tabs.mjs';
import {presetFields, toggleRepeatDay} from './task-tabs-model.mjs';
import {busySpans} from './time-ruler.mjs';
import {factRow, textRow} from './fact-rows.mjs';

/** The ring's pop and the struck title hold this long before the sheet leaves. */
const COMPLETE_HOLD = 300;
const idle = async app => { while (app.saving) await new Promise(done => setTimeout(done, 16)); };

/** A footer action: a 24dp icon over its caption. */
function tool(symbol, label, onClick, cls = '') {
  const node = button('', onClick, ('tool-btn ' + cls).trim());
  node.append(icon(symbol), el('span', 'tool-label', label));
  return node;
}

/**
 * Task sheet. The header holds the icon pill, the title, the Must star and the ring; then four tabs (When, Alert,
 * Repeat, Block) with When open; then Purpose, notes and who could help; and a footer of actions. Every change saves
 * at once with Undo. `occurrence` is the repeat being looked at; `focus: 'date'` or `'length'` puts focus on that choice.
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
  const slotOf = t => `${t.planned}|${t.minutes}|${t.recurrence}|${t.repeatDays}|${t.repeatAfterDays}`;
  const recheck = async () => {
    const token = ++checkToken;
    try {
      const t = live();
      checkedSlot = t && slotOf(t);
      const {clashes, risk} = t?.planned ? await scheduleCheck(app, id, {}) : {clashes: [], risk: null};
      if (token !== checkToken || !body.isConnected) return;
      tabs.clash.replaceChildren(icon(clashes.length ? 'event_busy' : 'info'), el('span', '', clashes.length ? clashText(clashes) : risk ?? ''));
      tabs.clash.classList.toggle('is-clash', !!clashes.length);
      tabs.clash.hidden = !(clashes.length || risk);
      paint(live() ?? t);
    } catch {}
  };

  const recent = recentBlock();
  const suggested = suggestBlock(app, task, task.blockId)?.id ?? null;
  const busyOn = day => {
    if (!day) return [];
    try {
      return busySpans(conflicts(app.data(), new Date(`${day}T00:00`).toISOString(), 24 * 60, app.state.calendar ?? [], id), day);
    } catch {
      return [];
    }
  };
  const now = t => {
    const at = whenOf(t, when(t));
    return {...at, minutes: t.minutes ?? null, alert: t.alertIntent?.type ?? 'off', lead: t.alertIntent?.lead ?? 0,
      repeating: repeats(t), task: t, busy: busyOn(at.day), blockId: t.blockId ?? null, blocks: app.activeBlocks(),
      statusOf: blockId => resultStatus(app.data(), blockId),
      toneOf: blockId => (blockId ? app.tone(app.blockArea(app.p().blocks.find(b => b.id === blockId))) : null),
      suggested, recent};
  };
  const setWhen = (value, label) => {
    const t = live();
    if (!t) return;
    if (repeats(t) && !(value.day && value.time)) {
      tabs.error('day', NEEDS_TIME + ' Turn off Repeat first.');
      tabs.paint(now(t));
      return;
    }
    tabs.error('day', '');
    tabs.paint({...now(t), ...value, busy: busyOn(value.day)});
    commit(whenFields(value), label).then(saved => { if (saved !== undefined) recheck(); });
  };
  const setRepeat = fields => {
    const t = live();
    if ((fields.recurrence || fields.repeatAfterDays) && !t?.planned) {
      tabs.error('repeat', NEEDS_TIME + ' Choose them in When first.');
      tabs.paint(now(t));
      return;
    }
    tabs.error('repeat', '');
    const words = repeatLabel(fields);
    commit(fields, fields.recurrence || fields.repeatAfterDays
      ? 'Repeats: ' + (fields.recurrence === 'days' ? words : words.toLowerCase()) : 'Repeat turned off');
  };
  const current = () => whenOf(live(), when(live()));
  const tabs = taskTabs({
    remote: !!app.api.getPhone().remote,
    get: () => now(live() ?? task),
    tick: () => app.api.native('haptic', {kind: 'tick'}).catch(() => {}),
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
        tabs.paint({...now(live()), minutes});
        commit({minutes}, minutes == null ? 'Length removed' : 'Length ' + duration(minutes))
          .then(saved => { if (saved !== undefined && live()?.planned) recheck(); });
      },
      alert: value => commit({alert: value}, value === 'off' ? 'Alert off' : alertText(value, live()) + ' set'),
      lead: minutes => commit({alertLead: minutes}, 'Alert ' + leadLabel(minutes).toLowerCase()),
      repeatDay: day => setRepeat(toggleRepeatDay(live(), day)),
      repeatPreset: (preset, every) => setRepeat(presetFields(preset, live(), every)),
      block: (blockId, title) => {
        rememberBlock(blockId);
        save({type: 'moveTask', id, blockId}, blockId ? 'Moved to ' + title : 'Moved to Inbox');
      },
    },
  });

  const notes = textRow(body, 'notes', 'Notes', task.notes, value => commit({notes: value}, 'Notes saved'));
  const helper = textRow(body, 'group', 'Who could help', task.leverage, value => commit({leverage: value}, 'Saved'));
  const why = textRow(body, 'favorite', 'Why', task.purpose, value => commit({purpose: value}, 'Why saved'));
  const details = el('div', 'task-details');
  details.append(why.closest('.edit-row'), notes.closest('.edit-row'), helper.closest('.edit-row'));
  if (task.raw && task.raw !== task.title) {
    details.append(factRow('format_quote', el('p', 'original-words', task.raw), {cls: 'original-row'}));
  }
  body.replaceChildren(tabs.node, details);

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
    const {area} = app.context(t);
    for (const host of [head.row, tabs.node]) {
      if (area) host.dataset.tone = app.tone(area);
      else delete host.dataset.tone;
    }
    start.hidden = completing || !startable(t);
    tabs.paint(now(t));
    syncText(notes, t.notes);
    syncText(helper, t.leverage);
    syncText(why, t.purpose);
    why.closest('.edit-row').hidden = !!app.context(t).block || (!t.purpose && document.activeElement !== why);
    undoLast.hidden = !(t.completions?.length && repeats(t));
  };
  paint(task);
  tabs.reveal();
  for (const field of [notes, helper, why]) field.grow();
  if (focus) tabs.focus(focus);
  if (task.planned) recheck();

  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!app.sheet.live()) return false;
    const t = live();
    if (!t) return false;
    app.sheet.version = app.data().version;
    paint(t);
    if (slotOf(t) !== checkedSlot && !tabs.clash.hidden) recheck();
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
