import {prefs, setPrefs} from './store.mjs';

const NO_SCREEN = ' The playground has no Android screens.';
const ACTIONS = new Set(['set_widget_text_scale', 'choose_alarm', 'preview_alarm', 'stop_preview', 'reminder_sound',
  'show_butterfly', 'hide_butterfly', 'overlay_permission', 'notch_toggle', 'notch_permission', 'notifications', 'exact_alarms',
  'full_screen_alarms', 'check_alerts', 'connect_key', 'remove_key', 'import_context',
  'export_context', 'restore_backup', 'earlier_screens', 'diagnostics_connect', 'diagnostics_pause', 'diagnostics_resume',
  'diagnostics_disconnect', 'diagnostics_upload']);

const SCREEN_MESSAGES = {
  choose_alarm: 'Choose an alarm sound on your phone.',
  reminder_sound: 'Opening Android reminder sound settings.',
  overlay_permission: 'Opening Android floating-window permission.',
  notch_permission: 'Opening Android accessibility settings. Turn on RPM Notch there.',
  notifications: 'Opening Android notification controls.',
  exact_alarms: 'Opening Android exact alarm permission.',
  full_screen_alarms: 'Opening Android lock-screen alarm controls.',
  diagnostics_connect: 'Enter a diagnostic pairing code.',
  connect_key: 'Enter the key in the secure Android dialog.',
  remove_key: 'Review the secure removal confirmation.',
  import_context: 'Review the backup notice, then choose a context file.',
  export_context: 'Choose where to save the context copy.',
  restore_backup: 'Choose a private pre-import backup.',
  earlier_screens: 'Opening the earlier RPM screens.',
};

export function appSettings() {
  const p = prefs();
  return {captureBackground: 'Material', widgetTextScale: p.widgetTextScale, alarmSound: 'Phone default', reminderSound: 'Phone default',
    aiConnected: false, notificationsAllowed: true, exactAlarmsAllowed: true, overlayAllowed: false,
    fullScreenSupported: true, fullScreenAllowed: true, launcherRunning: false, notchOn: p.notchOn, notchServiceOn: true,
    backupCount: 0, calendarAccess: 'Read-only; choose calendars in the planner',
    systemBoundary: 'Sound files, keys and permission choices require the person. No secret values are exposed.',
    previewing: false, working: false,
    diagnostics: {connected: false, enabled: false, paused: false, authError: false, message: 'Not connected', lastUpload: 0,
      endpoint: '', rejected: 0, queued: 0, dropped: 0}};
}

export function appControl(p) {
  switch (p.action) {
    case 'transparency': throw new Error('Capture uses a solid background; transparency is no longer available.');
    case 'widget_text_scale': {
      if (!Number.isInteger(p.value) || p.value < 80 || p.value > 160) throw new Error('Widget text size must be between 80 and 160 percent.');
      setPrefs({widgetTextScale: p.value});
      return {message: `Widget text size set to ${p.value}%.`};
    }
    case 'show_butterfly': throw new Error('Allow the floating butterfly in Android Settings first.');
    case 'hide_butterfly': return {message: 'Butterfly hidden.'};
    default: throw new Error('Unsupported app control.');
  }
}

export function settingsAction(p) {
  const action = typeof p.action === 'string' ? p.action : '';
  if (!ACTIONS.has(action)) throw new Error('Unsupported settings action.');
  const allowed = action.startsWith('set_') ? ['action', 'value'] : ['action'];
  if (Object.keys(p).some(k => !allowed.includes(k))) throw new Error('Unsupported settings value.');
  let message;
  switch (action) {
    case 'set_widget_text_scale': message = appControl({action: 'widget_text_scale', value: p.value}).message; break;
    case 'preview_alarm': message = 'Alarm preview stopped.' + NO_SCREEN; break;
    case 'stop_preview': message = 'Alarm preview stopped.'; break;
    case 'show_butterfly': appControl({action: 'show_butterfly'}); break;
    case 'hide_butterfly': message = appControl({action: 'hide_butterfly'}).message; break;
    case 'notch_toggle': {
      const on = !prefs().notchOn;
      setPrefs({notchOn: on});
      message = on ? 'Notch on.' : 'Notch off. RPM Notch stays allowed in Android\'s accessibility settings until you turn it off there.';
      break;
    }
    case 'check_alerts': message = 'Saved alert schedules checked.'; break;
    case 'diagnostics_pause': setPrefs({diagnosticsPaused: true}); message = 'Diagnostic capture and upload paused. An upload already in progress may finish.'; break;
    case 'diagnostics_resume': setPrefs({diagnosticsPaused: false}); message = 'Full console capture and upload resumed.'; break;
    case 'diagnostics_disconnect': message = 'Disconnected; queued logs cleared. Uploaded logs expire after 14 days.'; break;
    case 'diagnostics_upload': message = 'Upload requested. Reopen Settings to refresh delivery status.'; break;
    default: message = SCREEN_MESSAGES[action] + NO_SCREEN;
  }
  return {...appSettings(), message};
}
