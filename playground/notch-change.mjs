// Copy of NotchChangeViews and NotchReceipt: the receipt keeps the band (its ring fills, Undo takes the trailing slot).
import {el, glyph, text, button, face, title, line, pill, controls, row, INK, accent} from './notch-parts.mjs';
import {alertLook, alertName} from './notch-scene.mjs';

export const MARK = {water: ['notch_ic_water', INK.WATER, INK.WATER], done: ['ic_check', INK.TASK, INK.W87], reminder: ['ic_notification', INK.TASK, INK.W87],
  alarm: ['ic_clock', INK.ALARM, INK.ALARM], off: ['notch_ic_alert_off', INK.TASK, INK.W87]};

/** What NotchReceipt says first, while the change saves. */
export function receiptFor(change, {water, title: name}) {
  const at = Date.now();
  if (change === 'drink') {
    const count = water?.count ?? 0, goal = Math.max(1, water?.goal ?? 8);
    return {mark: 'water', title: 'Glass logged', detail: `${count + 1} of ${goal} today`, from: count / goal, to: Math.min(1, (count + 1) / goal), undo: true, at};
  }
  if (change === 'done') return {mark: 'done', title: 'Done', detail: name, from: 0, to: 1, undo: true, at};
  return {mark: change, title: change === 'off' ? 'Alert off' : alertName(change) + ' set', detail: name, from: 1, to: 1, undo: true, at};
}

/** "Reminder at 4:30 PM for Group call. Opens its controls." A reminder never says alarm. */
export const alertSpoken = (alert, name, at) => `${alertName(alert)} at ${at} for ${name}. Opens its controls.`;

/** The alert's bell or clock and its time on a dim pill. */
export function alertChip(alert, at) {
  const chip = el('span', 'notch-alert-chip');
  const g = glyph(alertLook(alert));
  g.style.color = accent(alertLook(alert));
  chip.append(g, text(at, 'notch-chip-time'));
  return chip;
}

/** "Glass logged" over "4 of 8 today" under the band, and Undo in the band once the change is saved. */
export function receiptFace(r, actions) {
  const f = face('island-receipt', text(r.title, 'receipt-title'), text(r.detail, 'receipt-detail', r.problem ? INK.ALARM : INK.W70));
  f.setAttribute('role', 'status');
  if (r.undo) {
    const slot = el('div', 'notch-band-control');
    const undo = button('notch-undo', `Undo: ${r.title}`, actions.undo);
    undo.textContent = 'Undo';
    slot.append(undo);
    f.append(slot);
  }
  return f;
}

/** The task and its alert, then Turn off as the one primary, and rows to switch the alert, tick it, or open it. */
export function manageFace(m, actions) {
  const alarm = m.alert === 'alarm';
  const rows = el('div', 'notch-rows');
  rows.append(
    row(alarm ? 'ic_notification' : 'ic_clock', accent(alertLook(alarm ? 'reminder' : 'alarm')), alarm ? 'Make it a reminder' : 'Make it a ringing alarm',
      alarm ? 'Make it a reminder instead' : 'Make it a ringing alarm instead', () => actions.setAlert(alarm ? 'reminder' : 'alarm')),
    row('ic_check', INK.W60, 'Done', `Done: ${m.title}`, actions.doneManaged),
    row('ic_open', INK.W60, 'Open', `Open ${m.title} in the plan`, actions.openManaged));
  return face('island-manage', title(m.title), line(`${alertName(m.alert)} · ${m.at}`, alarm ? INK.ALARM : INK.W70),
    controls(pill('notch_ic_alert_off', 'Turn off', `Turn off the alert for ${m.title}`, alarm ? INK.ALARM : INK.TASK, true, () => actions.setAlert('off'))),
    rows);
}
