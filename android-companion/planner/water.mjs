/** Water on Today: the row with Drank it, the small counter sheet, and the reminder's notification words. */
import {waterStatus, waterRowParts, timesText, WATER_DEFAULTS} from '../body-state.mjs';
import {el, button, iconButton, progress} from './dom.mjs';
import {openSheet, closeSheet} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {listRow, phraseNodes} from './today-row.mjs';
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

export function waterRow(app, body) {
  const {parts, filled} = waterRowParts(statusOf(body));
  const node = listRow({symbol: 'water_drop', headline: 'Water', lines: [phraseNodes(parts)], action: 'Drank it',
    onAction: () => drink(app, body), open: () => openWaterSheet(app, body)});
  node.dataset.key = 'water';
  if (filled) node.querySelector('.leading').classList.add('fill');
  node.querySelector('.today-row-action').setAttribute('aria-label', 'Drank a glass of water');
  return node;
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
    }));
  }
  markChips(row, String(current));
  content.append(row);
  app.sheetRefresh = null;
}

export function openWaterSheet(app, body, {motion = 'forward'} = {}) {
  const {body: content, actions, header} = openSheet(app, 'Water', {variant: 'water', motion});
  const more = iconButton('more_vert', 'More options', () => openMenu(more, [
    {label: 'Change interval', icon: 'timer', onClick: () => settingSheet(app, body, 'Reminder interval', 'intervalMinutes',
      [60, 90, 120], v => `Every ${v} min`)},
    {label: 'Change glass size', icon: 'local_drink', onClick: () => settingSheet(app, body, 'Glass size', 'glassMl',
      [200, 250, 300], v => `${v} ml`)},
  ]));
  header.querySelector('.sheet-close').before(more);
  const count = el('p', 'body-count tnum');
  const bar = progress(0, 1, 'Glasses today');
  const times = el('p', 'body-times tnum');
  const history = button('See history', () => { closeSheet(app); app.openHistory(); }, 'text-btn body-history-link');
  content.append(count, bar, times, history);
  const drank = button('Drank it', () => drink(app, body), 'filled-btn');
  const snooze = button('Snooze 15 min', async () => {
    try {
      await body.snooze();
    } catch {
      notice(app, "Couldn't save that. Try again.");
      return;
    }
    app.render();
  }, 'text-btn');
  actions.append(snooze, drank);
  const paint = () => {
    const status = statusOf(body);
    const snoozeMinutes = body.water().settings?.snoozeMinutes ?? WATER_DEFAULTS.snoozeMinutes;
    count.textContent = `${status.count} of ${status.goal} glasses`;
    const percent = Math.min(100, Math.round(status.count / status.goal * 100));
    bar.firstChild.style.setProperty('--value', String(percent / 100));
    bar.setAttribute('aria-valuenow', String(percent));
    times.textContent = timesText(status.times);
    times.hidden = !status.count;
    snooze.textContent = `Snooze ${snoozeMinutes} min`;
    snooze.hidden = !status.pending;
  };
  paint();
  app.sheetRefresh = paint;
}
