/**
 * The water and meal editors: bottom sheets in the task sheet's row grammar (icon, then a slider, a picker, a switch
 * or a time). Each change saves at once through the body store with Undo; a slider saves when it is let go.
 */
import {WATER_DEFAULTS, WATER_STEPS, GLASS_SIZES, stepWater, everyText, clockText, atMinutes, minutesOf, SLOT_NAMES,
  waterStatus} from '../body-state.mjs';
import {el, icon, button, iconButton} from './dom.mjs';
import {openSheet, closeSheet, isSheetOpen} from './sheet.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {factRow, switchButton, slider, moreButton, pickButton, timeButton, textRow} from './fact-rows.mjs';
import {drink} from './water.mjs';

const glassesText = n => `${n} ${n === 1 ? 'glass' : 'glasses'}`;
const timeWords = hhmm => clockText(atMinutes('2000-01-01', minutesOf(hhmm)));
const waterSettings = body => ({...WATER_DEFAULTS, ...body.water().settings});
const onGrid = (key, onValue) => v => onValue(stepWater(key, v, 0));
/** A slider being dragged keeps its own value; a repaint would yank it. */
const sliding = content => content.contains(document.activeElement) && document.activeElement.type === 'range';

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

/** The sheet header's way back to what opened the editor, by the arrow or Android Back. Every habit sheet keeps its
 * Close at the end, so back sits at the start and Close at the end on every level. */
function backTo(app, header, content, back, label) {
  if (!back) return;
  header.prepend(iconButton('arrow_back', label, back, {cls: 'sheet-back'}));
  app.sheet.onBack = () => {
    if (!content.isConnected || !isSheetOpen(app)) return false;
    back();
    return true;
  };
}

/** Water: today's count over its meter with a one-tap log, then the goal, the glass size and a Reminders row that
 * opens its own sheet. */
export function openWaterEditor(app, body, {back = null, backLabel = 'Back to Habits', motion = 'forward'} = {}) {
  const {body: content, header} = openSheet(app, 'Water', {variant: 'choice habit-editor', motion});
  backTo(app, header, content, back, backLabel);
  const count = el('span', 'water-count tnum');
  const goal = slider({label: 'Daily goal', ...WATER_STEPS.goal, format: glassesText,
    onChange: onGrid('goal', v => saved(app, () => body.setWater('goal', v), `Daily goal: ${glassesText(v)}`))});
  const size = pickButton('Glass size', value => saved(app, () => body.setWater('glassMl', Number(value)), `Glass size: ${value} ml`));
  const again = () => openWaterEditor(app, body, {back, backLabel, motion: 'back'});
  const reminders = moreButton('Reminders', () => openWaterReminders(app, body, again));
  const meter = el('span', 'water-track');
  meter.setAttribute('aria-hidden', 'true');
  const log = button('', () => drink(app, body), 'tonal-btn water-log');
  log.append(icon('add'), el('span', '', '1 glass'));
  log.setAttribute('aria-label', 'Log a glass');
  const today = el('section', 'water-today');
  today.setAttribute('aria-label', 'Today');
  const progress = el('div', 'water-progress');
  progress.append(count, meter);
  today.append(progress, log);
  content.append(today, factRow('water_drop', goal, {cls: 'slider-row'}), factRow('local_drink', size),
    factRow('notifications', reminders));

  const paint = () => {
    const s = waterSettings(body);
    const status = waterStatus({...body.water(), settings: s, now: body.now()});
    count.textContent = `${status.count} of ${glassesText(status.goal)}`;
    if (meter.childElementCount !== status.goal) meter.replaceChildren(...Array.from({length: status.goal}, () => el('i')));
    [...meter.children].forEach((glass, i) => glass.classList.toggle('on', i < status.count));
    if (!sliding(content)) goal.set(s.goal);
    const offered = [...new Set([...GLASS_SIZES, s.glassMl])].sort((a, b) => a - b);
    size.set(offered.map(ml => ({value: String(ml), words: `${ml} ml`})), String(s.glassMl));
    reminders.set(s.reminders === false ? 'Off' : `Every ${everyText(s.intervalMinutes)}`);
  };
  paint();
  app.sheetRefresh = () => { if (content.isConnected) paint(); };
}

/** Water reminders: the switch, then how often and between which times; those dim and lock while reminders are off. */
function openWaterReminders(app, body, back) {
  const {body: content, header} = openSheet(app, 'Water reminders', {variant: 'choice habit-editor', motion: 'forward'});
  backTo(app, header, content, back, 'Back to Water');
  const reminders = switchButton('Reminders', on => {
    reminders.set(on);
    paintOff(!on);
    saved(app, () => body.setWater('reminders', on), on ? 'Water reminders on' : 'Water reminders off');
  });
  const every = slider({label: 'Every', ...WATER_STEPS.intervalMinutes, format: everyText,
    onChange: onGrid('intervalMinutes', v => saved(app, () => body.setWater('intervalMinutes', v), `Reminders every ${everyText(v)}`))});
  const from = timeButton('From', value => saved(app, () => body.setWater('from', value), `Reminders from ${timeWords(value)}`));
  const until = timeButton('Until', value => saved(app, () => body.setWater('until', value), `Reminders until ${timeWords(value)}`));
  const dependent = [factRow('timer', every, {cls: 'slider-row'}), factRow('wb_sunny', from), factRow('bedtime', until)];
  const paintOff = off => {
    for (const row of dependent) {
      row.classList.toggle('is-off', off);
      row.inert = off;
    }
  };
  content.append(factRow('notifications', reminders), ...dependent);
  const paint = () => {
    const s = waterSettings(body);
    if (!sliding(content)) every.set(s.intervalMinutes);
    reminders.set(s.reminders !== false);
    paintOff(s.reminders === false);
    from.set(s.from, timeWords(s.from));
    until.set(s.until, timeWords(s.until));
  };
  paint();
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
