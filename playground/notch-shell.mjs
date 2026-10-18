import {companion, device, prefs} from './store.mjs';
import {calendarRead} from './fake-calendar.mjs';
import {parseNotchData} from './notch-day.mjs';
import {notchScene, alertScene, PillPriority, ALERT_SNOOZE_MINUTES} from './notch-scene.mjs';
import {renderNotch} from './notch-view.mjs';

const REMINDER_MS = 6_000, ALARM_MS = 10 * 60_000, SNOOZE_NOTE_MS = 2_000, REMINDER_NOTE_MS = 8_000;

/** The Notch screen: which island shows, the alert timers and every gesture, around the copy in notch-view.mjs. */
export function notchShell({stage, empty, say, shell, setShell, open}) {
  const priority = new PillPriority();
  let alert = 'none', alertTimer = 0, note = null, noteTimer = 0, key = '';

  const now = () => {
    const at = shell().notchTime;
    if (!at) return Date.now();
    const d = new Date();
    const [hh, mm] = at.split(':').map(Number);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  };
  const data = () => parseNotchData(companion(), calendarRead({anchor: Date.now()}).events);
  const mode = () => alert !== 'none' ? alert : shell().expandNotch ? 'open' : 'pill';
  const notWired = () => say('This button is not wired in the copy. Make the change in the planner instead.');

  function showNote(text, ms, extra = {}) {
    clearTimeout(noteTimer);
    note = {text, ...extra};
    noteTimer = setTimeout(() => { note = null; paint(); }, ms);
  }

  function setAlert(type, {instant = false} = {}) {
    clearTimeout(alertTimer);
    alert = type;
    if (type !== 'none') setShell({expandNotch: false});
    if (type === 'reminder') alertTimer = setTimeout(() => endAlert('collapse'), REMINDER_MS);
    if (type === 'alarm') alertTimer = setTimeout(() => endAlert('stop'), ALARM_MS);
    paint({instant});
  }

  function endAlert(how) {
    const shown = current();
    if (how === 'snooze') {
      showNote(`+${ALERT_SNOOZE_MINUTES}m`, SNOOZE_NOTE_MS, {chip: true, spoken: `Snoozed ${ALERT_SNOOZE_MINUTES} minutes`});
      say(`Snoozed ${ALERT_SNOOZE_MINUTES} minutes. The copy does not save snoozes.`);
    } else if (how === 'collapse' && shown) {
      showNote(shown.at, REMINDER_NOTE_MS, {spoken: `Next: ${shown.title} at ${shown.at}`});
    } else if (how === 'stop') {
      say('Alarm stopped.');
    }
    setAlert('none');
  }

  const current = () => alert === 'none' ? null : alertScene(data(), now(), alert);

  function openTask(id) {
    if (alert === 'reminder') setAlert('none');
    open('planner', id ? {id} : {view: 'day'});
  }

  function setExpanded(expand, {instant = false} = {}) {
    setShell({expandNotch: expand});
    paint({instant});
  }

  function paint({instant = false} = {}) {
    const scene = notchScene(data(), now());
    const t = Date.now();
    priority.update(scene, t);
    let primary = priority.primary(t), secondary = priority.secondary(t);
    if (!primary && note) primary = {kind: 'TASK', text: note.text};
    const shownAlert = current();
    if (alert !== 'none' && !shownAlert) {
      say('There is no task today to alert about.');
      alert = 'none';
    }
    const m = mode();
    const k = JSON.stringify([scene.heroLook, scene.heroTitle, scene.heroSubtitle, scene.barStart, scene.barEnd, Math.round(scene.progress * 1000),
      scene.rows, scene.canDone, scene.canSnooze, scene.canLogMeal, !!scene.meal, primary, secondary, m, shownAlert, note, device().textScale, prefs().notchOn]);
    for (const b of document.querySelectorAll('[data-expand]')) b.setAttribute('aria-pressed', String(b.dataset.expand === String(shell().expandNotch)));
    for (const b of document.querySelectorAll('[data-alert]')) b.setAttribute('aria-pressed', String(b.dataset.alert === alert));
    if (k === key && !instant) return;
    key = k;
    const shown = prefs().notchOn && renderNotch(stage, {scene, primary, secondary, mode: m, alert: shownAlert, note, instant,
      fontScale: device().textScale, onTap: () => setExpanded(true), gestures: gestures(scene), actions: actions(scene)});
    if (!shown) stage.replaceChildren();
    empty.hidden = !!shown;
    empty.textContent = prefs().notchOn ? 'Nothing to show: the phone hides the notch when no task, water or routine is due.'
      : 'The notch is off in Settings.';
  }

  function snoozePill() {
    showNote(`+${ALERT_SNOOZE_MINUTES}m`, SNOOZE_NOTE_MS, {chip: true, spoken: `Snoozed ${ALERT_SNOOZE_MINUTES} minutes`});
    say(`Snoozed ${ALERT_SNOOZE_MINUTES} minutes. The copy does not save snoozes.`);
    paint();
  }

  const gestures = scene => ({
    pill: {right: () => setExpanded(true), down: () => setExpanded(true), left: snoozePill, longPress: () => openTask(scene.hero?.task.id)},
    open: {up: () => setExpanded(false)},
    reminder: {right: () => openTask(current()?.taskId), left: () => endAlert('snooze'), up: () => endAlert('collapse')},
    alarm: {right: () => openTask(current()?.taskId)},
  });

  const actions = () => ({done: notWired, snooze: notWired, logMeal: notWired, openPlan: () => open('planner', {view: 'day'}),
    openAlert: () => openTask(current()?.taskId), snoozeAlert: () => endAlert('snooze'), stopAlert: () => endAlert('stop')});

  function animateOpen() {
    setAlert('none', {instant: true});
    setExpanded(false, {instant: true});
    requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
  }

  return {paint, setExpanded, setAlert, animateOpen, expanded: () => shell().expandNotch, contains: target => !!target.closest('.island')};
}
