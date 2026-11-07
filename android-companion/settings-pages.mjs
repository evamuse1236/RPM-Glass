/** Settings pages: the home list and one builder per page. Each returns its sections. */
import {automationPreview} from './automation-preview-ui.mjs';
import {captureTraces} from './settings-traces.mjs';
import {voiceChoice,setVoice,setPersona,voiceDialog,personaDialog} from './voice-choice.mjs';
import {clarityPreferences,setClarityPreference,transparencyRow,THEME_NAMES} from './planner-clarity.mjs';
import {el, safeScale, row, group, add, slider, segmented} from './settings-parts.mjs';

/** The pages Settings opens, in home order. `tone` picks the icon tile colour. */
export const SETTINGS_PAGES = Object.freeze({
  appearance: {title: 'Appearance', icon: 'palette', tone: 'blue'},
  notch: {title: 'Notch & widgets', icon: 'widgets', tone: 'violet'},
  alerts: {title: 'Alarms & reminders', icon: 'alarm', tone: 'red'},
  voice: {title: 'Voice', icon: 'graphic_eq', tone: 'green'},
  ai: {title: 'AI keys', icon: 'key', tone: 'amber'},
  sync: {title: 'Sync & backup', icon: 'cloud_sync', tone: 'blue'},
  diagnostics: {title: 'Diagnostics', icon: 'monitor_heart', tone: 'grey'},
  about: {title: 'About', icon: 'info', tone: 'grey'},
});
const HOME_GROUPS = [['appearance', 'notch'], ['alerts', 'voice', 'ai'], ['sync', 'diagnostics', 'about']];

const alarmsOff = s => [s.notificationsAllowed, s.exactAlarmsAllowed].filter(allowed => !allowed).length;
const alarmsBlocked = s => alarmsOff(s) > 0;
const notchWaiting = s => !!s.notchOn && !s.notchServiceOn;
const connectedKeys = s => [s.claudeKey && 'Claude', s.openRouterKey && 'OpenRouter'].filter(Boolean);

/** What each home row says on its right: the one fact worth seeing before opening the page. */
function homeValue(ctx, page) {
  const s = ctx.state;
  switch (page) {
    case 'appearance': return THEME_NAMES[clarityPreferences().appearance];
    case 'notch': return notchWaiting(s) ? 'Waiting' : s.notchOn ? 'On' : 'Off';
    case 'alerts': return alarmsBlocked(s) ? `${alarmsOff(s)} off` : '';
    case 'voice': return s.hasGeminiKey ? voiceChoice().voice ?? 'Default' : 'Off';
    case 'ai': { const keys = connectedKeys(s); return keys.length ? keys.join(', ') : 'None'; }
    case 'diagnostics': { const log = s.diagnostics ?? {}; return !log.connected ? 'Off' : log.paused ? 'Paused' : 'On'; }
    default: return '';
  }
}

/** A home row whose page needs the person: its value turns red; the page itself holds the fix. */
const needsYou = (s, page) => (page === 'alerts' && alarmsBlocked(s)) || (page === 'notch' && notchWaiting(s));

export function homePage(ctx) {
  const s = ctx.state;
  return HOME_GROUPS.map(pages => {
    const section = group();
    for (const page of pages) {
      const {title, icon, tone} = SETTINGS_PAGES[page];
      const node = row({label: title, value: homeValue(ctx, page), icon, tile: tone, next: true, action: `open_${page}`,
        tone: needsYou(s, page) ? 'warn' : null});
      node.addEventListener('click', () => ctx.options.openPage?.(page));
      section.card.append(node);
    }
    return section;
  });
}

function appearancePage(ctx) {
  let preferences = clarityPreferences();
  const theme = group('', {id: 'planner-appearance'});
  theme.card.append(segmented('theme', 'Theme', THEME_NAMES, preferences.appearance, next => {
    preferences = setClarityPreference('appearance', next);
  }));
  theme.card.append(transparencyRow(document, preferences.barTransparency, value => {
    preferences = setClarityPreference('bar-transparency', value);
    return preferences.barTransparency;
  }));
  return [theme];
}

/** The notch is off until switched on here; Android also needs RPM Notch on in its accessibility settings. */
function notchPage(ctx) {
  const s = ctx.state;
  const notch = group('', {id: 'notch', caption: notchWaiting(s)
    ? 'Android only lets apps draw at the camera through an accessibility service. RPM reads no screen content.' : ''});
  add(ctx, notch, {label: 'Notch', detail: s.notchOn && s.notchServiceOn ? 'Tap the pill at the camera to see what is next'
    : 'Your task, water and routines at the front camera', action: 'notch_toggle', role: 'switch', toggle: !!s.notchOn});
  if (notchWaiting(s)) {
    add(ctx, notch, {label: 'Allow RPM Notch', detail: 'Opens Accessibility', value: 'Allow', tone: 'error', action: 'notch_permission'});
    add(ctx, notch, {label: 'RPM Notch greyed out?', detail: 'Tap it once in Accessibility, then here: menu, Allow restricted settings',
      action: 'notch_app_info', next: true});
  }
  const butterfly = group('', {id: 'widgets'});
  if (!s.overlayAllowed) {
    add(ctx, butterfly, {label: 'Floating butterfly', detail: 'Open Capture over your other apps', value: 'Allow',
      action: 'overlay_permission', next: true});
  } else {
    add(ctx, butterfly, {label: 'Floating butterfly', detail: 'Open Capture over your other apps',
      action: s.launcherRunning ? 'hide_butterfly' : 'show_butterfly', role: 'switch', toggle: !!s.launcherRunning});
  }
  const widgets = group('Home screen widgets', {id: 'appearance'});
  slider(ctx, widgets, 'Widget text size', 'Relative to your Android font size', safeScale(s.widgetTextScale), 80, 160, 'set_widget_text_scale');
  return [notch, butterfly, widgets];
}

/** A permission says its state once: a quiet Allowed, or a tonal Allow that fixes it. */
const permission = allowed => allowed ? {value: 'Allowed'} : {value: 'Allow', tone: 'error'};

/** Permissions lead: they decide whether anything rings at all. */
function alertsPage(ctx) {
  const s = ctx.state;
  const allowed = group('Permissions', {id: 'permissions'});
  add(ctx, allowed, {label: 'Notifications', ...permission(s.notificationsAllowed), action: 'notifications'});
  add(ctx, allowed, {label: 'Exact alarms', ...permission(s.exactAlarmsAllowed), action: 'exact_alarms'});
  add(ctx, allowed, {label: 'Check saved alerts', action: 'check_alerts', trail: 'refresh'});
  const sounds = group('Sounds', {id: 'sounds'});
  add(ctx, sounds, {label: 'Alarm sound', value: s.alarmSound, action: 'choose_alarm', next: true});
  add(ctx, sounds, {label: s.previewing ? 'Stop alarm sound' : 'Play alarm sound', action: 'preview_alarm', trail: s.previewing ? 'stop' : 'play_arrow'});
  add(ctx, sounds, {label: 'Reminder sound', value: s.reminderSound, action: 'reminder_sound', next: true});
  return [allowed, sounds];
}

/** Voice and persona live on this phone, not in native settings; each opens an M3 dialog and saves at once. */
function voicePage(ctx) {
  const s = ctx.state;
  const {voice, persona} = voiceChoice();
  const key = group('', {id: 'voice-key'});
  add(ctx, key, {label: 'Gemini key', value: s.hasGeminiKey ? 'Connected' : 'Not set', action: 'connect_gemini_key', next: true});
  const open = dialog => { document.body.append(dialog); dialog.showModal(); };
  const sound = group('', {id: 'voice'});
  const voiceRow = row({label: 'Voice', value: voice ?? 'Default', action: 'voice_name', next: true});
  voiceRow.addEventListener('click', () => open(voiceDialog(document, voice, next => { setVoice(next); ctx.render(ctx); })));
  const personaRow = row({label: 'Persona', detail: persona, value: persona ? '' : 'None', action: 'voice_persona', next: true});
  if (persona) personaRow.querySelector('.settings-detail')?.classList.add('settings-clamp');
  personaRow.addEventListener('click', () => open(personaDialog(document, persona, next => { setPersona(next); ctx.render(ctx); })));
  sound.card.append(voiceRow, personaRow);
  const sections = [key, sound];
  if (s.hasGeminiKey) {
    const remove = group();
    add(ctx, remove, {label: 'Remove Gemini key', detail: 'The mic goes back to Android dictation', tone: 'error', action: 'remove_gemini_key'});
    sections.push(remove);
  }
  return sections;
}

function aiPage(ctx) {
  const s = ctx.state;
  const keys = group('', {id: 'ai'});
  const state = on => on ? 'Connected' : 'Not set';
  add(ctx, keys, {label: 'Claude', detail: 'Capture asks Claude first', value: state(s.claudeKey), action: 'connect_claude_key', next: true});
  add(ctx, keys, {label: 'OpenRouter', detail: 'Backup, suggestions and Jev sorting', value: state(s.openRouterKey), action: 'connect_openrouter_key', next: true});
  const sections = [keys];
  if (s.claudeKey || s.openRouterKey) {
    const remove = group('', {caption: 'Plans and conversations stay on this phone.'});
    if (s.claudeKey) add(ctx, remove, {label: 'Remove Claude key', tone: 'error', action: 'remove_claude_key'});
    if (s.openRouterKey) add(ctx, remove, {label: 'Remove OpenRouter key', tone: 'error', action: 'remove_openrouter_key'});
    sections.push(remove);
  }
  return sections;
}

function syncPage(ctx) {
  const cloud = group('', {id: 'cloud'});
  add(ctx, cloud, {label: 'Link a web browser', action: 'cloud_web', next: true});
  const files = group('Backup', {id: 'context-history'});
  add(ctx, files, {label: 'Export', action: 'export_context', next: true});
  add(ctx, files, {label: 'Import', action: 'import_context', next: true});
  add(ctx, files, {label: 'Restore a backup', value: ctx.state.backupCount ? String(ctx.state.backupCount) : 'None', action: 'restore_backup', next: true});
  return [cloud, files];
}

function diagnosticsPage(ctx) {
  const log = ctx.state.diagnostics ?? {};
  const status = group('', {id: 'diagnostics', caption: 'Logs can include what you capture. They are private, expire after 14 days, and keys are removed.'});
  if (log.connected) {
    const last = log.lastUpload ? new Date(log.lastUpload).toLocaleString() : 'No upload yet';
    const lost = (log.dropped ?? 0) + (log.rejected ?? 0);
    status.card.append(row({label: log.message ?? 'Connected', detail: [`${log.queued ?? 0} waiting`, last, lost ? `${lost} lost` : ''].filter(Boolean).join(' · ')}));
    if (log.authError) add(ctx, status, {label: 'Pair again', detail: 'The last connection was revoked', action: 'diagnostics_connect', next: true});
    else add(ctx, status, {label: 'Logging', action: log.paused ? 'diagnostics_resume' : 'diagnostics_pause', role: 'switch', toggle: !log.paused});
    if (log.enabled) add(ctx, status, {label: 'Upload now', action: 'diagnostics_upload'});
  } else {
    add(ctx, status, {label: 'Connect diagnostics', detail: 'Use a code from your RPM database', value: 'Off', action: 'diagnostics_connect', next: true});
  }
  const sections = [status];
  const recent = captureTraces();
  if (recent.dataset.count !== '0') {
    const traces = group('', {id: 'captures'});
    traces.card.append(recent);
    sections.push(traces);
  }
  if (log.connected) {
    const end = group();
    add(ctx, end, {label: 'Disconnect', detail: 'Clears logs waiting on this phone', tone: 'error', action: 'diagnostics_disconnect'});
    sections.push(end);
  }
  return sections;
}

function aboutPage(ctx) {
  const name = group('', {id: 'about'});
  name.card.append(row({label: 'RPM', detail: 'Result, Purpose, Plan. Capture saves your words first, then applies what you said with Undo.'}));
  if (ctx) add(ctx, name, {label: 'Earlier RPM screens', detail: 'Open the original planner', action: 'earlier_screens', next: true});
  const previews = el('details', 'settings-details');
  previews.append(el('summary', '', 'Automation previews'), automationPreview());
  const more = group('', {id: 'automation'});
  more.card.append(previews);
  return [name, more];
}

export const PAGES = {appearance: appearancePage, notch: notchPage, alerts: alertsPage, voice: voicePage, ai: aiPage,
  sync: syncPage, diagnostics: diagnosticsPage, about: aboutPage};

/** What a browser can set: the same rows as the phone's home, only for pages that work here, and a caption naming the rest. */
const WEB_PAGES = ['appearance', 'about'];
export function phoneOnlyPage(ctx, text) {
  if (ctx.page === 'appearance') return appearancePage(ctx);
  if (ctx.page === 'about') return aboutPage(null);
  const section = group('', {id: 'web-pages'});
  for (const page of WEB_PAGES) {
    const {title, icon, tone} = SETTINGS_PAGES[page];
    const node = row({label: title, value: page === 'appearance' ? THEME_NAMES[clarityPreferences().appearance] : '', icon, tile: tone, next: true, action: `open_${page}`});
    node.addEventListener('click', () => ctx.options.openPage?.(page));
    section.card.append(node);
  }
  section.append(el('p', 'settings-caption', `${text} are set in RPM on your phone.`));
  return [section];
}
