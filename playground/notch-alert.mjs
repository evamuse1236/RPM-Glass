import {el, glyph, button} from './notch-parts.mjs';

function circle(icon) {
  const c = el('span', 'alert-circle');
  c.append(glyph(null, icon));
  return c;
}

function reminder(alert, actions) {
  const main = button('alert-main', alert.spoken, actions.openAlert);
  const open = el('span', 'alert-open');
  open.append(el('span', '', {textContent: alert.action}), glyph(null, 'ic_chevron'));
  main.append(circle('ic_notification'), el('span', 'alert-title', {textContent: alert.title}), open);
  return [main];
}

function alarm(alert, actions) {
  const words = button('alert-main alert-words', `${alert.spoken}. Opens the task.`, actions.openAlert);
  const stack = el('span', 'alert-stack');
  stack.append(el('span', 'alert-title', {textContent: alert.title}), el('span', 'alert-line', {textContent: alert.line}));
  words.append(circle('ic_clock'), stack);
  const snooze = button('alert-button alert-snooze', `Snooze ${alert.title} for 10 minutes`, actions.snoozeAlert);
  snooze.append(glyph(null, 'notch_ic_snooze'));
  const stop = button('alert-button alert-stop', `Stop the alarm for ${alert.title}`, actions.stopAlert);
  stop.append(el('span', 'alert-stop-glyph', {ariaHidden: 'true'}));
  const buttons = el('span', 'alert-buttons');
  buttons.append(snooze, stop);
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
