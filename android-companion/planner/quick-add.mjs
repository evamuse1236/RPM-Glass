import {localDay} from '../planner-state.mjs';
import {el, icon, button, labelButton} from './dom.mjs';
import {quickOptions} from './quick-options.mjs';
import {reducedMotion, EASE, DURATION, MOTION} from '../surface-motion.mjs';
import {openSheet, isSheetOpen, discardDraft, rememberValue} from './sheet.mjs';
import {whenOf, whenFields, whenLabel, clockOf, dayPresets, parseWhen, blockMatches, hashToken, hashTag, withoutTag, foldGroup, fold, foldFor, choiceChip, markChips, chipRow, dateChooser, blockChooser, recentBlock, rememberBlock} from './task-fields.mjs';
import {readLabel, NEEDS_TIME, saver, scheduleCheck, suggestBlock} from './sheet-parts.mjs';
import {openTask} from './task-sheet.mjs';

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
  const {body, actions, sheet} = openSheet(app, 'New task', {draftKey: DRAFT, variant: 'form sheet-quick', enter: MOTION.navigate});
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

  // The title wraps onto as many lines as the words need, so the user's words are always all in view. The words the
  // sheet read (a day, a #Block) are highlighted where they are, by a copy of the text drawn behind the field.
  const name = el('textarea', 'quick-input');
  name.rows = 1;
  name.maxLength = 200;
  name.placeholder = 'New task';
  name.enterKeyHint = 'done';
  name.value = draft.Task ?? '';
  name.setAttribute('aria-label', 'Task');
  const mirror = el('div', 'quick-mirror');
  mirror.setAttribute('aria-hidden', 'true');
  const nameWrap = el('label', 'quick-title');
  nameWrap.append(mirror, name);
  let lastHeight = 0;
  const grow = () => {
    name.style.height = 'auto';
    const to = name.scrollHeight;
    name.style.height = to + 'px';
    // A new line opens smoothly (the sheet's top follows), never in one jump.
    if (lastHeight && Math.abs(to - lastHeight) > 1 && !reducedMotion() && name.isConnected) {
      // The first line stays where it is while the field opens below it: the field would otherwise scroll to the caret
      // on the new line while it is still one line high, clipping the line above for a few frames.
      const growing = name.animate([{height: lastHeight + 'px'}, {height: to + 'px'}],
        {duration: DURATION.short3, easing: EASE.standard});
      name.scrollTop = 0;
      name.dataset.growing = 'true';
      growing.finished.then(() => {}, () => {}).then(() => { delete name.dataset.growing; });
    }
    lastHeight = to;
  };
  name.addEventListener('scroll', () => { if (name.dataset.growing) name.scrollTop = 0; });

  // A day written in the title is used as the date: its chip is marked and its words highlighted; tapping the marked
  // chip removes it (the words stay).
  let parsed = null, dismissed = null, before = null;
  // A #word naming exactly one Block chooses it as typed (the Block chip marked, the #word highlighted); the #word
  // leaves the title when the task is added. Several matches offer chips under the title instead.
  let tag = null, tagDismissed = null, tagBefore = null;
  const paintMirror = () => {
    const value = name.value;
    const marks = [parsed, tag].filter(Boolean).filter(m => value.slice(m.start, m.end).toLowerCase() === m.match.toLowerCase())
      .sort((a, b) => a.start - b.start);
    const parts = [];
    let at = 0;
    for (const m of marks) {
      if (m.start < at) continue;
      parts.push(value.slice(at, m.start), el('mark', '', value.slice(m.start, m.end)));
      at = m.end;
    }
    parts.push(value.slice(at) + '\u200b');
    mirror.replaceChildren(...parts);
  };
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
  const whenChips = chipRow('quick-row quick-days');
  for (const [label, day, aria] of dayPresets()) whenChips.append(choiceChip(label, day, value => pickDay(value), {aria}));
  const timeChip = button('', null, 'assist-chip');
  timeChip.append(icon('schedule'), el('span', 'chip-label'));
  const whenFold = foldFor(group, timeChip, inner => dateChooser(inner, {
    presets: false,
    noDate: true,
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
    // Tapping the marked Block chip again takes the task out of it (as the day chips do).
    s.blockId = id && id === s.blockId && !blockFold.isOpen ? null : id || null;
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
      // With a Block chip showing, the full list's chip says "Other", so the row stays on one line and stays labelled.
      listChip.querySelector('.chip-label').textContent = ids.length ? 'Other' : 'Choose Block';
      listChip.setAttribute('aria-label', ids.length ? 'Other Blocks' : 'Choose a Block');
    }
    markChips(blockChips, s.blockId ?? '');
  };

  const timeChips = chipRow('quick-row quick-times');
  timeChips.append(timeChip);
  const more = quickOptions(s, {body, group, changed: () => changed(), remember: () => remember()});

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
        grow();
        name.focus({preventScroll: true});
      }, 'assist-chip hash-chip');
      // Keep the keyboard up: the title keeps focus while a chip is tapped.
      chip.addEventListener('pointerdown', event => event.preventDefault());
      chip.append(icon('stacks'), el('span', 'chip-label', block.title));
      chip.setAttribute('aria-label', 'Put in Block ' + block.title);
      return chip;
    }));
  };

  const error = el('p', 'sheet-error');
  error.setAttribute('role', 'alert');
  body.append(nameWrap, hashFold.node, whenChips, timeChips, whenFold.node, blockChips, blockFold.node, more.row, more.node, error);

  const paint = () => {
    markChips(whenChips, s.day);
    const preset = dayPresets().some(([, day]) => day === s.day);
    timeChip.querySelector('.chip-label').textContent = s.day && !preset ? whenLabel(s) : s.time ? clockOf(s.day, s.time) : 'Time';
    timeChip.classList.toggle('on', !!s.time || (!!s.day && !preset));
    timeChip.setAttribute('aria-label', timeChip.classList.contains('on') ? 'Time: ' + timeChip.textContent.trim() : 'Time');
    paintBlocks();
    more.paint();
    // What the words set says so on its chip (marked, and named as read from the words), once.
    for (const chip of whenChips.querySelectorAll('.choice-chip')) {
      const read = !!parsed && chip.dataset.value === s.day;
      chip.classList.toggle('from-words', read);
      readLabel(chip, read && `, read from “${parsed.match}”. Tap to remove`);
    }
    if (parsed && !whenChips.querySelector('.from-words')) {
      timeChip.setAttribute('aria-label', `${timeChip.getAttribute('aria-label')}, read from “${parsed.match}”`);
    }
    for (const chip of blockChips.querySelectorAll('.choice-chip')) {
      const read = !!tag && chip.dataset.value === String(tag.block.id) && s.blockId === tag.block.id;
      chip.classList.toggle('from-words', read);
      readLabel(chip, read && `, read from “${tag.match}”. Tap to remove`);
    }
    paintMirror();
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
    // One line of words: a pasted line break becomes a space (Enter adds the task).
    if (/[\r\n]/.test(name.value)) {
      const caret = name.selectionStart;
      name.value = name.value.replace(/[\r\n]+/g, ' ');
      name.setSelectionRange(caret, caret);
    }
    readTitle();
    changed();
    grow();
  });
  name.addEventListener('scroll', () => { mirror.scrollTop = name.scrollTop; });
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
    more.close();
    group.close();
    changed();
    grow();
    name.focus({preventScroll: true});
  };
  const add = button('Add', () => submit(), 'filled-btn');
  actions.append(labelButton('mic', 'Capture', () => app.capture(), 'text-btn'), el('span', 'spacer'), add);
  readTitle();
  paint();
  requestAnimationFrame(grow);

  app.sheet.live = () => body.isConnected && isSheetOpen(app);
  app.sheet.sync = () => {
    if (!app.sheet.live()) return false;
    app.sheet.version = app.data().version;
    if (!leaving) paint();
    return true;
  };
  app.sheet.onBack = () => app.sheet.live() && (more.close() || group.onBack());
  requestAnimationFrame(() => {
    name.focus();
    app.api.native('keyboard', {field: 'Task'}).catch(() => {});
  });
}
