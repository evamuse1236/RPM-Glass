/** Water on Today: logging a glass, the small counter sheet and its settings (each change can be undone), and the
 * reminder's notification words. */
import {waterStatus, timesText, rangeText, WATER_DEFAULTS} from '../body-state.mjs';
import {el, button, iconButton, progress} from './dom.mjs';
import {openSheet, closeSheet, field} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {userMessage} from '../user-message.mjs';
import {choiceChip, chipRow, markChips} from './task-fields.mjs';

export {waterNotification} from '../body-state.mjs';

const statusOf = body => waterStatus({...body.water(), now: body.now()});

/** "Drank it": one glass (the set size) toward today's goal, with Undo. */
export async function drink(app, body) {
  try {
    await body.drink();
  } catch {
    notice(app, "Couldn't save the glass. Try again.");
    return;
  }
  const {count, goal} = statusOf(body);
  app.render();
  notice(app, `Glass logged · ${count} of ${goal}`, {undo: true});
}

function settingSheet(app, body, title, key, options, format) {
  const {body: content} = openSheet(app, title, {variant: 'choice'});
  const current = body.water().settings?.[key] ?? WATER_DEFAULTS[key];
  const row = chipRow();
  for (const value of options) {
    row.append(choiceChip(format(value), String(value), async () => {
      try {
        await body.setWater(key, value);
      } catch {
        notice(app, "Couldn't save that. Try again.");
        return;
      }
      app.render();
      openWaterSheet(app, body, {motion: 'back'});
      notice(app, `${title}: ${format(value)}`, {undo: true});
    }));
  }
  markChips(row, String(current));
  content.append(row);
  app.sheetRefresh = null;
}

async function toggleReminders(app, body, on) {
  try {
    await body.setWater('reminders', on);
  } catch {
    notice(app, "Couldn't save that. Try again.");
    return;
  }
  app.render();
  openWaterSheet(app, body, {motion: 'back'});
  notice(app, on ? 'Water reminders on' : 'Water reminders off', {undo: true});
}

/** The window reminders run in: the first nudge and the last, as two time fields. */
function hoursSheet(app, body) {
  const settings = {...WATER_DEFAULTS, ...body.water().settings};
  const {body: content, actions} = openSheet(app, 'Reminder hours', {variant: 'choice'});
  const times = el('div', 'time-pair');
  const from = field(app, times, 'From', settings.from, 'time');
  const until = field(app, times, 'Until', settings.until, 'time');
  const error = el('p', 'sheet-error');
  error.setAttribute('role', 'alert');
  content.append(times, error);
  actions.append(button('Save', async () => {
    error.textContent = '';
    try {
      await body.setWaterFields({from: from.value, until: until.value});
    } catch (failure) {
      error.textContent = userMessage(failure, "Couldn't save that. Try again.");
      return;
    }
    app.render();
    openWaterSheet(app, body, {motion: 'back'});
    notice(app, `Reminder hours: ${rangeText(from.value, until.value)}`, {undo: true});
  }, 'filled-btn'));
  app.sheetRefresh = null;
}

export function openWaterSheet(app, body, {motion = 'forward'} = {}) {
  const {body: content, actions, header} = openSheet(app, 'Water', {variant: 'water', motion});
  const reminders = body.water().settings?.reminders !== false;
  const more = iconButton('more_vert', 'More options', () => openMenu(more, [
    {label: 'Change daily goal', icon: 'flag', onClick: () => settingSheet(app, body, 'Glasses a day', 'goal',
      [6, 8, 10, 12], v => `${v} glasses`)},
    {label: 'Change interval', icon: 'timer', onClick: () => settingSheet(app, body, 'Reminder interval', 'intervalMinutes',
      [60, 90, 120], v => `Every ${v} min`)},
    {label: 'Change reminder hours', icon: 'schedule', onClick: () => hoursSheet(app, body)},
    {label: reminders ? 'Turn reminders off' : 'Turn reminders on', icon: reminders ? 'notifications_off' : 'notifications',
      onClick: () => toggleReminders(app, body, !reminders)},
    {label: 'Change glass size', icon: 'local_drink', onClick: () => settingSheet(app, body, 'Glass size', 'glassMl',
      [200, 250, 300], v => `${v} ml`)},
  ]));
  header.querySelector('.sheet-close').before(more);
  const count = el('p', 'body-count tnum');
  const bar = progress(0, 1, 'Glasses today');
  const times = el('p', 'body-times tnum');
  const history = button('See history', () => { closeSheet(app); app.openHistory(); }, 'text-btn body-history-link');
  const plan = el('p', 'body-helper tnum');
  content.append(count, bar, times, plan, history);
  const snoozeMinutes = () => body.water().settings?.snoozeMinutes ?? WATER_DEFAULTS.snoozeMinutes;
  const drank = button('Drank it', () => drink(app, body), 'filled-btn');
  const snooze = button('Snooze 15 min', async () => {
    try {
      await body.snooze();
    } catch {
      notice(app, "Couldn't save that. Try again.");
      return;
    }
    app.render();
    notice(app, `Water snoozed for ${snoozeMinutes()} min`, {undo: true});
  }, 'text-btn');
  actions.append(snooze, drank);
  const paint = () => {
    const status = statusOf(body);
    count.textContent = `${status.count} of ${status.goal} glasses`;
    const percent = Math.min(100, Math.round(status.count / status.goal * 100));
    bar.firstChild.style.setProperty('--value', String(percent / 100));
    bar.setAttribute('aria-valuenow', String(percent));
    times.textContent = timesText(status.times);
    times.hidden = !status.count;
    const settings = {...WATER_DEFAULTS, ...body.water().settings};
    plan.textContent = settings.reminders === false ? 'Reminders off'
      : `Reminders every ${settings.intervalMinutes} min, ${rangeText(settings.from, settings.until)}`;
    snooze.textContent = `Snooze ${snoozeMinutes()} min`;
    snooze.hidden = !status.pending;
  };
  paint();
  app.sheetRefresh = paint;
}
