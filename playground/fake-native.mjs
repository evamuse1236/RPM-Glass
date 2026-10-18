import {KEYS, companion, writeCompanion, prefs, device, validateLikeCompanionStore} from './store.mjs';
import {appSettings, appControl, settingsAction} from './fake-settings.mjs';
import {calendarList, calendarRead, calendarSelect, grantCalendar} from './fake-calendar.mjs';

const planning = location.pathname === '/planner.html';
const shell = window.parent !== window ? window.parent.rpmPlayground : null;
const MODEL_FAILURE = 'The OpenRouter connection failed. Check your key and internet connection.';

function phoneStatus() {
  const fontScale = device().textScale, widgetTextScale = prefs().widgetTextScale;
  return {fontScale, effectiveFontScale: fontScale * (planning ? 1 : widgetTextScale / 100), widgetTextScale, hasKey: false,
    exact: true, notifications: true, overlay: false, delivery: {},
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, debug: true};
}

function save({expected, data}) {
  const current = companion()?.version ?? 0;
  if (expected !== current || data?.version !== current + 1) throw new Error('Saved context changed. Reopen RPM before retrying.');
  writeCompanion(validateLikeCompanionStore(data));
  return phoneStatus();
}

function captureDraft(p) {
  if ('text' in p) {
    if (typeof p.text !== 'string') throw new Error('Could not keep this draft on the phone.');
    if (p.text.length > 12000) throw new Error('Capture text is too long');
    localStorage.setItem(KEYS.draft, p.text);
  }
  const text = localStorage.getItem(KEYS.draft);
  return {present: text != null, text: text ?? ''};
}

function captureSize({height, width}) {
  if (!Number.isFinite(height) || !Number.isFinite(width) || height < 1 || height > 100000 || width < 100 || width > 4000) throw new Error('Invalid Capture size');
  return {};
}

const settingsChanged = () => setTimeout(() => {
  window.rpmPhoneRefresh?.();
  window.dispatchEvent(new Event('rpm-settings-refresh'));
}, 0);

function openPlanner(target) {
  if (shell) shell.open('planner', target);
  else location.href = '/planner.html#open=' + encodeURIComponent(JSON.stringify(target));
}

const CAPTURE_ONLY = {captureDraft, captureSize};
const HANDLERS = {
  load: () => ({data: companion(), phone: phoneStatus()}),
  save,
  status: phoneStatus,
  surface: ({dark}) => {
    if (!planning) throw new Error('Unsupported phone action.');
    shell?.paintPlannerBars(!!dark);
    return {};
  },
  legacyEntries: () => ({done: true}),
  legacyImported: () => ({}),
  dictate: () => { throw new Error('Voice input is unavailable on this device. You can use keyboard dictation.'); },
  haptic: () => ({}),
  keyboard: () => ({}),
  appSettings,
  appControl: p => { const result = appControl(p); settingsChanged(); return result; },
  settingsAction: p => { const result = settingsAction(p); settingsChanged(); return result; },
  calendarList,
  calendarRead,
  calendarSelect,
  calendarPermission: () => { grantCalendar(); settingsChanged(); return {}; },
  model: () => { throw new Error(MODEL_FAILURE); },
  decision: () => { throw new Error(MODEL_FAILURE); },
  cancelModel: () => ({cancelled: false}),
  arm: () => ({}),
  settings: ({section}) => {
    const destination = section || 'settings';
    if (planning) window.rpmOpenSettings?.(destination);
    else openPlanner({view: destination});
    return {};
  },
  planner: p => { openPlanner(p); return {}; },
  capture: () => { if (shell) shell.open('capture'); else location.href = '/index.html'; return {}; },
  minimize: () => { shell?.finish(planning ? 'planner' : 'capture'); return {}; },
  expand: () => { shell?.toggleExpanded(); return {}; },
};

function handle(action, payload) {
  const run = planning ? HANDLERS[action] : CAPTURE_ONLY[action] ?? HANDLERS[action];
  if (!run) throw new Error('Unsupported phone action.');
  return run(payload);
}

const reply = (id, result, error) => window.rpmBridgeResult?.(id, result ?? null, error ?? null);

window.RpmNative = {
  invoke(id, action, json) {
    const payload = JSON.parse(json);
    shell?.log(planning ? 'planner' : 'capture', action);
    setTimeout(() => {
      try { reply(id, structuredClone(handle(action, payload)), null); }
      catch (error) { reply(id, null, error.message || 'The phone could not finish that action.'); }
    }, 0);
  },
  diagnostic() {},
  diagnosticsReady() {},
};
