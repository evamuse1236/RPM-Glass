// Copy of NotchAlertViews: the band holds the bell or the pulsing clock, and the alert's time.
import {face, title, line, pill, controls, button, INK} from './notch-parts.mjs';

function words(alert, color, actions) {
  const w = button('notch-words', alert.spoken, actions.openAlert);
  w.append(title(alert.title), line(alert.line, color));
  return w;
}

const snooze = (alert, color, actions) => pill(null, 'Snooze 10 min', `Snooze ${alert.title} for 10 minutes`, color, false, actions.snoozeAlert);

/** Bell and time in the band, the title over "Reminder · 5:30 PM", then Done and Snooze 10 min. A reminder never says alarm. */
function reminder(alert, actions) {
  return face('island-alert island-reminder', words(alert, INK.W70, actions),
    controls(pill('ic_check', 'Done', `Done: ${alert.title}`, INK.TASK, true, actions.doneAlert), snooze(alert, INK.TASK, actions)));
}

/** Pulsing clock and time in the band, the title over "Ringing", then Stop across the width over Snooze 10 min and Done. */
function alarm(alert, actions) {
  return face('island-alert island-alarm', words(alert, INK.ALARM, actions),
    controls(pill('notch_ic_stop', 'Stop', `Stop the alarm for ${alert.title}`, INK.ALARM, true, actions.stopAlert)),
    controls(snooze(alert, INK.ALARM, actions), pill('ic_check', 'Done', `Done: stop the alarm and tick ${alert.title}`, INK.ALARM, false, actions.doneAlert)));
}

export function alertFace(alert, actions) {
  const f = (alert.type === 'alarm' ? alarm : reminder)(alert, actions);
  f.setAttribute('role', 'group');
  f.setAttribute('aria-label', alert.type === 'alarm' ? 'Alarm' : 'Reminder');
  return f;
}
