import {el, glyph, text, button, control, accent} from './notch-parts.mjs';
import {alertLook, alertName} from './notch-scene.mjs';

const MARK = {water: ['notch_ic_water', '#7CACF8'], done: ['ic_check', 'rgb(255 255 255 / .87)'], reminder: ['ic_notification', 'rgb(255 255 255 / .87)'],
  alarm: ['ic_clock', '#F2B8B5'], off: ['notch_ic_alert_off', 'rgb(255 255 255 / .87)']};

/** What NotchReceipt says first, while the change saves. */
export function receiptFor(change, {water, title}) {
  if (change === 'drink') {
    const count = water?.count ?? 0, goal = Math.max(1, water?.goal ?? 8);
    return {mark: 'water', title: 'Glass logged', detail: `${count + 1} of ${goal} today`, from: count / goal, to: Math.min(1, (count + 1) / goal), undo: true};
  }
  if (change === 'done') return {mark: 'done', title: 'Done', detail: title, from: 0, to: 1, undo: true};
  return {mark: change, title: change === 'off' ? 'Alert off' : alertName(change) + ' set', detail: title, from: 1, to: 1, undo: true};
}

/** "Reminder at 4:30 PM for Group call. Opens its controls." A reminder never says alarm. */
export const alertSpoken = (alert, title, at) => `${alertName(alert)} at ${at} for ${title}. Opens its controls.`;

/** The alert's bell or clock and its time on a dim pill; a button of its own only where it is not inside a row. */
export function alertChip(alert, at, spoken, action) {
  const chip = action ? button('notch-alert-chip', spoken, action) : el('span', 'notch-alert-chip');
  const g = glyph(alertLook(alert));
  g.style.color = accent(alertLook(alert));
  chip.append(g, text(at, 13, 'rgb(255 255 255 / .87)', 500));
  return chip;
}

export function receiptFace(r, actions) {
  const face = el('div', 'island-face island-receipt', {role: 'status'});
  const [icon, color] = MARK[r.mark] ?? MARK.done;
  const mark = el('span', 'receipt-mark');
  mark.style.setProperty('--mark', color);
  mark.style.setProperty('--from', String(1 - r.from));
  mark.style.setProperty('--to', String(1 - r.to));
  mark.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="receipt-track" cx="20" cy="20" r="18.5"/>'
    + '<circle class="receipt-ring" cx="20" cy="20" r="18.5" pathLength="1"/></svg>';
  const g = glyph(null, icon);
  g.style.color = color;
  mark.append(g);
  const words = el('span', 'receipt-words');
  words.append(text(r.title, 16, '#fff', 600, 'notch-text receipt-title'), text(r.detail, 13, r.problem ? '#F2B8B5' : 'rgb(255 255 255 / .7)', 400));
  face.append(mark, words);
  if (r.undo) {
    const undo = button('receipt-undo', `Undo: ${r.title}`, actions.undo);
    undo.textContent = 'Undo';
    face.append(undo);
  }
  return face;
}

/** The task and its alert, then Turn off, Reminder or Alarm, Done and Open. */
export function manageFace(m, actions) {
  const face = el('div', 'island-face island-open island-manage');
  const look = alertLook(m.alert), alarm = m.alert === 'alarm';
  const hero = el('div', 'notch-hero');
  const tile = el('span', 'notch-tile');
  tile.style.background = alarm ? '#260302' : '#3C3C3C';
  const g = glyph(look);
  g.style.color = accent(look);
  tile.append(g);
  const words = el('div', 'notch-words');
  words.append(text(m.title, 17, '#fff', 600), text(`${alertName(m.alert)} · ${m.at}`, 14, accent(look), 400, 'notch-text notch-sub'));
  hero.append(tile, words);
  const controls = el('div', 'notch-controls manage-controls');
  controls.append(control('notch_ic_alert_off', 'Turn off', `Turn off the alert for ${m.title}`, true, () => actions.setAlert('off')),
    control(alarm ? 'ic_notification' : 'ic_clock', alarm ? 'Reminder' : 'Alarm', alarm ? 'Make it a reminder instead' : 'Make it a ringing alarm instead',
      true, () => actions.setAlert(alarm ? 'reminder' : 'alarm')),
    control('notch_ic_done', 'Done', `Done: ${m.title}`, true, actions.doneManaged),
    control('ic_open', 'Open', `Open ${m.title} in the plan`, true, actions.openManaged));
  face.append(hero, controls);
  return face;
}
