/**
 * The water and meal editors: bottom sheets in the task sheet's row grammar (icon, then a stepper, chips, a switch or
 * a time). Each change saves at once through the body store with Undo; a stepper saves once the presses stop.
 */
import {WATER_DEFAULTS, WATER_STEPS, GLASS_SIZES, stepWater, everyText, clockText, atMinutes, minutesOf, SLOT_NAMES}
  from '../body-state.mjs';
import {el, button, iconButton} from './dom.mjs';
import {openSheet, closeSheet, isSheetOpen} from './sheet.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {factRow, chipRow, chip, markChips, settleChip, revealChip, switchButton, stepper, timeButton, textRow}
  from './fact-rows.mjs';

const STEPPER_SETTLE = 500;
const timeWords = hhmm => clockText(atMinutes('2000-01-01', minutesOf(hhmm)));

/** Saves one change and says so with Undo; a refused change says why. */
async function saved(app, run, words) {
  try {
    await run();
  } catch (error) {
    notice(app, userMessage(error, "Couldn't save that. Try again."));
    return false;
  }
  app.render();
  notice(app, words, {undo: true});
  return true;
}

/** The sheet header's way back to what opened the editor, by the arrow or Android Back. */
function backTo(app, header, content, back, label) {
  if (!back) return;
  header.prepend(iconButton('arrow_back', label, back, {cls: 'sheet-back'}));
  app.sheet.onBack = () => {
    if (!content.isConnected || !isSheetOpen(app)) return false;
    back();
    return true;
  };
}

const labelled = (text, control) => [el('span', 'edit-label', text), control];

export function openWaterEditor(app, body, {back = null, backLabel = 'Back to Habits', motion = 'forward'} = {}) {
  const {body: content, header} = openSheet(app, 'Edit water', {variant: 'choice habit-editor', motion});
  backTo(app, header, content, back, backLabel);
  const settings = () => ({...WATER_DEFAULTS, ...body.water().settings});
  const pending = {};
  const later = (key, value, words) => {
    clearTimeout(pending[key]);
    pending[key] = setTimeout(() => {
      delete pending[key];
      saved(app, () => body.setWater(key, value), words);
    }, STEPPER_SETTLE);
  };
  const goal = stepper({label: 'Glasses a day', less: 'Fewer glasses', more: 'More glasses', ...WATER_STEPS.goal,
    next: (v, d) => stepWater('goal', v, d), onChange: v => later('goal', v, `Glasses a day: ${v}`)});
  const sizes = chipRow('Glass size');
  const pickSize = value => {
    settleChip(sizes, markChips(sizes, value));
    saved(app, () => body.setWater('glassMl', Number(value)), `Glass size: ${value} ml`);
  };
  const reminders = switchButton('Reminders', on => {
    reminders.set(on);
    paintOff(!on);
    saved(app, () => body.setWater('reminders', on), on ? 'Water reminders on' : 'Water reminders off');
  });
  const every = stepper({label: 'Every', less: 'Shorter interval', more: 'Longer interval', ...WATER_STEPS.intervalMinutes,
    next: (v, d) => stepWater('intervalMinutes', v, d), format: everyText,
    onChange: v => later('intervalMinutes', v, `Reminders every ${everyText(v)}`)});
  const from = timeButton('From', value => saved(app, () => body.setWater('from', value), `Reminders from ${timeWords(value)}`));
  const until = timeButton('Until', value => saved(app, () => body.setWater('until', value), `Reminders until ${timeWords(value)}`));
  const hours = el('div', 'edit-pair');
  hours.append(factRow('wb_sunny', from), factRow('bedtime', until));
  const dependent = [factRow('timer', labelled('Every', every), {cls: 'stepper-row'}), hours];
  const paintOff = off => {
    for (const row of dependent) {
      row.classList.toggle('is-off', off);
      row.inert = off;
    }
  };
  content.append(factRow('water_drop', labelled('Glasses a day', goal), {cls: 'stepper-row'}),
    factRow('local_drink', labelled('Glass size', sizes), {cls: 'chips-row'}),
    factRow('notifications', reminders), ...dependent);

  const paint = () => {
    const s = settings();
    if (!pending.goal) goal.set(s.goal);
    if (!pending.intervalMinutes) every.set(s.intervalMinutes);
    const offered = [...new Set([...GLASS_SIZES, s.glassMl])].sort((a, b) => a - b);
    if (sizes.dataset.values !== offered.join('|')) {
      sizes.dataset.values = offered.join('|');
      sizes.replaceChildren(...offered.map(ml => chip(`${ml} ml`, String(ml), pickSize, {cls: 'tnum'})));
    }
    markChips(sizes, String(s.glassMl));
    reminders.set(s.reminders !== false);
    paintOff(s.reminders === false);
    from.set(s.from, timeWords(s.from));
    until.set(s.until, timeWords(s.until));
  };
  paint();
  revealChip(sizes, sizes.querySelector('[aria-pressed=true]'));
  app.sheetRefresh = () => { if (content.isConnected) paint(); };
}

/** A meal time's name in a sheet title: "lunch", or a snack's own name. */
export function mealTitle(slot) {
  return slot.slot === 'snack' && slot.name !== SLOT_NAMES.snack ? slot.name : SLOT_NAMES[slot.slot].toLowerCase();
}

export function openMealEditor(app, body, slotName, {back = null, backLabel = 'Back to Habits', motion = 'forward'} = {}) {
  const find = () => body.mealTimes().find(s => s.slot === slotName);
  const start = find();
  if (!start) return;
  const {body: content, header} = openSheet(app, `Edit ${mealTitle(start)}`, {variant: 'choice habit-editor', motion});
  backTo(app, header, content, back, backLabel);
  const name = () => find()?.name ?? SLOT_NAMES[slotName];
  const time = timeButton('Time', value => saved(app, () => body.setMealSlot(slotName, {at: value}), `${name()} at ${timeWords(value)}`));
  const show = switchButton('Show on Today', on => {
    show.set(on);
    saved(app, () => body.setMealSlot(slotName, {on}), on ? `${name()} shows on Today` : `${name()} hidden from Today`);
  });
  content.append(factRow('schedule', time), factRow('visibility', show));
  let label = null;
  if (slotName === 'snack') {
    label = textRow(content, 'label', 'Name', start.name, words => saved(app, () => body.setMealSlot('snack', {name: words}), 'Name saved'));
    const remove = button('Remove snack', () => saved(app, () => body.removeMealSlot('snack'), 'Snack time removed')
      .then(ok => { if (ok) (back ?? (() => closeSheet(app)))(); }), 'text-btn danger remove-snack');
    content.append(remove);
  }
  const paint = () => {
    const slot = find();
    if (!slot) return;
    time.set(slot.at, timeWords(slot.at));
    show.set(slot.on);
    if (label && document.activeElement !== label && label.value !== slot.name) label.value = slot.name;
  };
  paint();
  label?.grow();
  app.sheetRefresh = () => { if (content.isConnected) paint(); };
}
