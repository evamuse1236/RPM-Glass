import {el, glyph, button, control} from './notch-parts.mjs';

function circle(icon) {
  const c = el('span', 'alert-circle');
  c.append(glyph(null, icon));
  return c;
}

function stack(alert) {
  const words = el('span', 'alert-stack');
  words.append(el('span', 'alert-title', {textContent: alert.title}), el('span', 'alert-line', {textContent: alert.line}));
  return words;
}

/** Bell, the title over "Reminder · 5:30 PM", then Done, Snooze 10 min and Open. A reminder never says alarm. */
function reminder(alert, actions) {
  const main = button('alert-main', alert.spoken, actions.openAlert);
  main.append(circle('ic_notification'), stack(alert));
  const controls = el('div', 'notch-controls alert-controls');
  controls.append(control('notch_ic_done', 'Done', `Done: ${alert.title}`, true, actions.doneAlert),
    control('notch_ic_snooze', 'Snooze 10 min', `Snooze ${alert.title} for 10 minutes`, true, actions.snoozeAlert),
    control('ic_open', 'Open', `Open ${alert.title} in the plan`, true, actions.openAlert));
  return [main, controls];
}

function alarm(alert, actions) {
  const words = button('alert-main alert-words', `${alert.spoken}. Opens the task.`, actions.openAlert);
  words.append(circle('ic_clock'), stack(alert));
  const snooze = button('alert-button alert-snooze', `Snooze ${alert.title} for 10 minutes`, actions.snoozeAlert);
  snooze.append(glyph(null, 'notch_ic_snooze'));
  const done = button('alert-button alert-snooze', `Done: stop the alarm and tick ${alert.title}`, actions.doneAlert);
  done.append(glyph(null, 'ic_check'));
  const stop = button('alert-button alert-stop', `Stop the alarm for ${alert.title}`, actions.stopAlert);
  stop.append(el('span', 'alert-stop-glyph', {ariaHidden: 'true'}));
  const buttons = el('span', 'alert-buttons');
  buttons.append(snooze, done, stop);
  const row = el('div', 'alert-row');
  row.append(words, buttons);
  return [row];
}

export function alertFace(alert, actions) {
  const face = el('div', `island-face island-alert island-${alert.type}`, {role: 'group'});
  face.setAttribute('aria-label', alert.type === 'alarm' ? 'Alarm' : 'Reminder');
  face.append(...(alert.type === 'alarm' ? alarm : reminder)(alert, actions));
  return face;
}
