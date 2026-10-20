/** Water on Today: logging a glass and the small counter sheet (each change can be undone), and the reminder's
 * notification words. Its settings live in the Edit water sheet (habit-editors.mjs). */
import {waterStatus, timesText, rangeText, everyText, WATER_DEFAULTS} from '../body-state.mjs';
import {el, button, iconButton, progress} from './dom.mjs';
import {openSheet, closeSheet} from './sheet.mjs';
import {notice} from './snackbar.mjs';
import {openWaterEditor} from './habit-editors.mjs';

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

export function openWaterSheet(app, body, {motion = 'forward'} = {}) {
  const {body: content, actions, header} = openSheet(app, 'Water', {variant: 'water', motion});
  header.querySelector('.sheet-close').before(iconButton('tune', 'Edit water',
    () => openWaterEditor(app, body, {back: () => openWaterSheet(app, body, {motion: 'back'}), backLabel: 'Back to Water'})));
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
      : `Reminders every ${everyText(settings.intervalMinutes)}, ${rangeText(settings.from, settings.until)}`;
    snooze.textContent = `Snooze ${snoozeMinutes()} min`;
    snooze.hidden = !status.pending;
  };
  paint();
  app.sheetRefresh = paint;
}
