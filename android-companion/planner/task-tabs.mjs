/**
 * The task sheet's four tabs under its header: When, Alert, Repeat and Block, each showing its value. When is open
 * first. Every choice is handed straight back through `pick`, which saves it with Undo; nothing here saves.
 */
import {localDay} from '../planner-state.mjs';
import {reducedMotion} from '../surface-motion.mjs';
import {el, icon, button} from './dom.mjs';
import {duration} from './format.mjs';
import {progressRing} from './blocks.mjs';
import {chip, chipRow, pickerChip, markChips, settleChip, revealChip} from './fact-rows.mjs';
import {dayChips, repeatShort, repeatDaysOf, REPEAT_DAYS, ALERT_LEADS, leadLabel} from './task-values.mjs';
import {TABS, stepTab, ALERT_KINDS, REPEAT_PRESETS, whenShort, alertShort, blockShort, lengthChoices, presetOf, blockChoices} from './task-tabs-model.mjs';
import {timeRuler} from './time-ruler.mjs';

const SEARCH_FROM = 7;

function errorSlot() {
  const slot = el('p', 'field-error');
  slot.setAttribute('role', 'alert');
  slot.hidden = true;
  return slot;
}

function refill(host, key, build) {
  if (host.dataset.values === key) return;
  host.dataset.values = key;
  host.replaceChildren(...build());
}

function pressed(node, on) {
  if (node.getAttribute('aria-pressed') !== String(on)) node.setAttribute('aria-pressed', String(on));
}

/**
 * `get()` returns the sheet's current values: {day, time, minutes, alert, lead, repeating, task, busy, blockId, blocks,
 * statusOf, toneOf, suggested, recent}. `pick` holds day, time, minutes, alert, lead, repeatDay, repeatPreset and
 * block, each saving at once. Returns {node, paint(now), select(tab), error(name, message), clash, focus(what)}.
 */
export function taskTabs({get, pick, tick = () => {}}) {
  const node = el('div', 'task-tabs');
  const row = el('div', 'tab-row');
  row.setAttribute('role', 'tablist');
  row.setAttribute('aria-label', 'Task details');
  const tabs = {}, panels = {};
  let current = 'when';

  const select = (key, {moved = false, focus = false} = {}) => {
    const changed = key !== current;
    current = key;
    for (const [name, tab] of Object.entries(tabs)) {
      const on = name === key;
      tab.node.setAttribute('aria-selected', String(on));
      tab.node.tabIndex = on ? 0 : -1;
      panels[name].hidden = !on;
    }
    if (focus) tabs[key].node.focus({preventScroll: true});
    if (moved && changed && !reducedMotion()) {
      panels[key].animate([{opacity: 0, translate: '0 8px'}, {opacity: 1, translate: '0 0'}],
        {duration: 200, easing: 'cubic-bezier(.05,.7,.1,1)'});
    }
  };

  for (const [key, name] of TABS) {
    const tab = button('', () => select(key, {moved: true}), 'tab-btn');
    tab.id = 'task-tab-' + key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'task-panel-' + key);
    const glyph = icon('schedule', {cls: 'tab-icon'});
    const value = el('span', 'tab-value tnum');
    tab.append(glyph, value);
    tabs[key] = {node: tab, glyph, value, name};
    row.append(tab);
    const panel = el('section', 'tab-panel');
    panel.id = 'task-panel-' + key;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panels[key] = panel;
  }
  row.addEventListener('keydown', event => {
    const step = {ArrowLeft: -1, ArrowRight: 1}[event.key];
    if (!step) return;
    event.preventDefault();
    const from = event.target.closest('[role=tab]')?.id.replace('task-tab-', '') ?? current;
    select(stepTab(from, step), {moved: true, focus: true});
  });

  const when = whenPanel(panels.when, pick, tick);
  const alert = alertPanel(panels.alert, pick);
  const repeat = repeatPanel(panels.repeat, pick);
  const block = blockPanel(panels.block, pick, get);
  node.append(row, ...Object.values(panels));
  select('when');

  const setTab = (key, text, symbol) => {
    const tab = tabs[key];
    if (tab.value.textContent !== text) tab.value.textContent = text;
    if (tab.glyph.textContent !== symbol) tab.glyph.textContent = symbol;
    tab.node.setAttribute('aria-label', `${tab.name}, ${text}`);
  };

  const paint = now => {
    const shownAlert = alertShort(now);
    setTab('when', whenShort(now), 'schedule');
    setTab('alert', shownAlert.text, shownAlert.symbol);
    setTab('repeat', repeatShort(now.task), 'repeat');
    setTab('block', blockShort(now.blocks.find(b => b.id === now.blockId)?.title), 'stacks');
    when.paint(now);
    alert.paint(now);
    repeat.paint(now);
    block.paint(now);
  };

  const errors = {day: when.error, repeat: repeat.error};
  const error = (name, message) => {
    errors[name].textContent = message ?? '';
    errors[name].hidden = !message;
  };

  /** `focus('date')` or `focus('length')` puts focus on that choice in When. */
  const focus = what => {
    select('when');
    const target = what === 'date' ? when.days.querySelector('[aria-pressed=true]') ?? when.dayPicker
      : when.lengths.querySelector('button.chip[aria-pressed=true]') ?? when.lengths.querySelector('button.chip');
    target?.focus({preventScroll: true});
  };
  return {node, paint, select, error, clash: when.clash, focus, reveal: () => when.reveal()};
}

function whenPanel(host, pick, tick) {
  const days = el('div', 'when-days');
  days.setAttribute('role', 'group');
  days.setAttribute('aria-label', 'Day');
  const error = errorSlot();
  const ruler = timeRuler({save: time => pick.time(time), tick});
  const clash = el('p', 'field-alert');
  clash.hidden = true;
  const lengths = chipRow('Length');
  const more = chipRow('More choices');
  const dayPicker = pickerChip('date', 'edit_calendar', 'Pick a date', 'Pick a date', value => pick.day(value));
  const timePicker = pickerChip('time', 'keyboard', 'Pick a time', 'Pick a time', value => pick.time(value));
  const otherLength = pickerChip('number', 'timer', 'Other', 'Other length', value => {
    const n = Math.round(Number(value));
    if (n >= 1 && n <= 1440) pick.minutes(n);
  });
  Object.assign(otherLength.input, {min: 1, max: 1440});
  const noTime = chip('No time', 'no-time', () => pick.time(''));
  const noDate = chip('No date', 'no-date', () => pick.day(''));
  const noLength = chip('No length', 'no-length', () => pick.minutes(null));
  more.append(dayPicker.node, timePicker.node, otherLength.node, noTime, noDate, noLength);
  host.append(days, error, ruler.node, clash, lengths, more);

  const paint = now => {
    const offered = dayChips(localDay(), now.day);
    refill(days, offered.map(c => c.day).join(), () => offered.map(c => {
      const date = new Date(c.day + 'T12:00');
      const dot = button('', () => {
        for (const other of days.children) pressed(other, other === dot);
        pick.day(c.day);
      }, 'when-day');
      dot.dataset.value = c.day;
      dot.classList.toggle('is-today', c.label === 'Today');
      dot.setAttribute('aria-label', c.aria || c.label);
      dot.append(el('span', 'when-day-name', date.toLocaleDateString([], {weekday: 'short'})),
        el('span', 'when-day-number tnum', String(date.getDate())));
      return dot;
    }));
    for (const dot of days.children) pressed(dot, dot.dataset.value === now.day);
    ruler.paint({day: now.day, time: now.time, minutes: now.minutes, busy: now.busy, off: !now.day});
    refill(lengths, lengthChoices(now.minutes).join(), () => lengthChoices(now.minutes).map(n =>
      chip(duration(n), String(n), (value, chosen) => {
        settleChip(lengths, markChips(lengths, value) ?? chosen);
        pick.minutes(Number(value));
      })));
    markChips(lengths, now.minutes == null ? '' : String(now.minutes));
    pressed(noTime, !!now.day && !now.time);
    pressed(noDate, !now.day);
    pressed(noLength, now.minutes == null);
    noTime.hidden = now.repeating;
    timePicker.node.classList.toggle('is-off', !now.day);
    timePicker.input.disabled = !now.day;
    noTime.setAttribute('aria-disabled', String(!now.day));
    dayPicker.input.value = now.day;
    timePicker.input.value = now.time;
    otherLength.input.value = now.minutes != null && !lengthChoices(null).includes(now.minutes) ? now.minutes : '';
  };
  const reveal = () => revealChip(lengths, lengths.querySelector('button.chip[aria-pressed=true]'));
  return {paint, error, clash, days, lengths, dayPicker: dayPicker.input, reveal};
}

function alertPanel(host, pick) {
  const kinds = el('div', 'alert-kinds');
  kinds.setAttribute('role', 'group');
  kinds.setAttribute('aria-label', 'Alert');
  for (const [value, word, symbol, aria] of ALERT_KINDS) {
    const kind = button('', () => {
      if (kinds.classList.contains('is-off')) return;
      for (const other of kinds.children) pressed(other, other === kind);
      pick.alert(value);
    }, 'alert-kind');
    kind.dataset.value = value;
    kind.setAttribute('aria-label', aria);
    kind.append(icon(symbol, {cls: 'alert-kind-icon'}), el('span', 'alert-kind-label', word));
    kinds.append(kind);
  }
  const leads = chipRow('Alert time');
  for (const n of ALERT_LEADS) {
    leads.append(chip(leadLabel(n), String(n), (value, chosen) => {
      settleChip(leads, markChips(leads, value) ?? chosen);
      pick.lead(Number(value));
    }));
  }
  const note = el('p', 'field-alert', 'An alert needs a day and a time. Set them in When.');
  host.append(kinds, leads, note);
  const paint = now => {
    const off = !now.day || !now.time;
    kinds.classList.toggle('is-off', off);
    for (const kind of kinds.children) {
      pressed(kind, kind.dataset.value === now.alert);
      kind.setAttribute('aria-disabled', String(off));
    }
    leads.hidden = now.alert === 'off' || off;
    markChips(leads, String(now.lead ?? 0));
    note.hidden = !off;
  };
  return {paint};
}

function repeatPanel(host, pick) {
  const circles = el('div', 'repeat-days');
  circles.setAttribute('role', 'group');
  circles.setAttribute('aria-label', 'Repeat on');
  for (const [day, letter, name] of REPEAT_DAYS) {
    const circle = button(letter, () => pick.repeatDay(day), 'repeat-day');
    circle.dataset.value = String(day);
    circle.setAttribute('aria-label', name);
    circles.append(circle);
  }
  const presets = chipRow('Repeat');
  const every = el('input');
  for (const [value, text] of REPEAT_PRESETS) {
    presets.append(chip(text, value, (choice, chosen) => {
      settleChip(presets, markChips(presets, choice) ?? chosen);
      pick.repeatPreset(choice, Number(every.value) || 1);
    }));
  }
  const after = el('label', 'after-days');
  Object.assign(every, {type: 'number', min: 1, max: 365, inputMode: 'numeric'});
  every.setAttribute('aria-label', 'Days after completion');
  every.addEventListener('change', () => {
    const n = Math.round(Number(every.value));
    if (n >= 1 && n <= 365) pick.repeatPreset('after', n);
  });
  after.append(el('span', '', 'Repeat'), every, el('span', '', 'days after completion'));
  const error = errorSlot();
  host.append(circles, presets, after, error);
  const paint = now => {
    const on = new Set(now.task?.repeatAfterDays ? [] : repeatDaysOf(now.task));
    for (const circle of circles.children) pressed(circle, on.has(Number(circle.dataset.value)));
    circles.classList.toggle('is-after', !!now.task?.repeatAfterDays);
    markChips(presets, presetOf(now.task));
    after.hidden = !now.task?.repeatAfterDays;
    if (document.activeElement !== every) every.value = now.task?.repeatAfterDays ?? 1;
  };
  return {paint, error};
}

function blockPanel(host, pick, get) {
  const search = el('label', 'block-search');
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search Blocks';
  input.setAttribute('aria-label', 'Search Blocks');
  search.append(icon('search'), input);
  const list = el('div', 'block-list');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', 'Block');
  host.append(search, list);
  const paint = now => {
    search.hidden = now.blocks.length < SEARCH_FROM;
    const rows = blockChoices(now.blocks, now.statusOf, search.hidden ? '' : input.value);
    const key = JSON.stringify([rows, now.suggested, now.recent, rows.map(r => now.toneOf(r.id))]);
    refill(list, key, () => rows.map(choice => {
      const option = button('', () => {
        if (option.getAttribute('aria-checked') === 'true') return;
        for (const other of list.children) other.setAttribute('aria-checked', String(other === option));
        pick.block(choice.id, choice.title);
      }, 'block-choice');
      option.setAttribute('role', 'radio');
      option.dataset.value = choice.id ?? '';
      const tone = now.toneOf(choice.id);
      if (tone) option.dataset.tone = tone;
      const ring = choice.id ? progressRing(choice.done, choice.total, `${choice.done} of ${choice.total} done`) : icon('inbox', {cls: 'block-choice-inbox'});
      const copy = el('span', 'block-choice-copy');
      const title = el('span', 'block-choice-title', choice.title);
      const hint = choice.id && choice.id === now.recent ? 'Recent' : choice.id && choice.id === now.suggested ? 'Suggested' : '';
      if (hint) title.append(el('span', 'choice-hint', hint));
      copy.append(title, el('span', 'block-choice-line', choice.line));
      const mark = el('span', 'block-choice-mark');
      mark.append(icon('check'));
      option.append(ring, copy, mark);
      return option;
    }));
    for (const option of list.children) option.setAttribute('aria-checked', String((option.dataset.value || null) === (now.blockId ?? null)));
  };
  input.addEventListener('input', () => paint(get()));
  return {paint};
}
