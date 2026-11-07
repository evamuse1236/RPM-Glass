/** Settings pages: the home list and one builder per page. Each returns its sections. */
import {automationPreview} from './automation-preview-ui.mjs';
import {captureTraces} from './settings-traces.mjs';
import {voiceChoice,setVoice,setPersona,voiceDialog,personaDialog} from './voice-choice.mjs';
import {clarityPreferences,setClarityPreference,transparencyRow,THEME_NAMES} from './planner-clarity.mjs';
import {el, safeScale, row, group, add, slider, segmented, symbol} from './settings-parts.mjs';

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

/** The alarm permissions Android has not given, named the way the Alarms page names them. */
const alarmsOff = s => [!s.notificationsAllowed && 'notifications', !s.exactAlarmsAllowed && 'exact alarms'].filter(Boolean);
const alarmsBlocked = s => alarmsOff(s).length > 0;
const notchWaiting = s => !!s.notchOn && !s.notchServiceOn;
const connectedKeys = s => [s.claudeKey && 'Claude', s.openRouterKey && 'OpenRouter', s.hasGeminiKey && 'Gemini'].filter(Boolean);

/** What each home row says on its right: the one fact worth seeing before opening the page. */
function homeValue(ctx, page) {
  const s = ctx.state;
  switch (page) {
    case 'appearance': return THEME_NAMES[clarityPreferences().appearance];
    case 'notch': return s.notchOn ? 'On' : 'Off';
    case 'alerts': return alarmsBlocked(s) ? 'Not allowed' : 'On';
    case 'voice': return s.hasGeminiKey ? voiceChoice().voice ?? 'Default' : 'Dictation';
    case 'ai': { const keys = connectedKeys(s); return keys.length ? keys.join(', ') : 'Not set'; }
    case 'diagnostics': { const log = s.diagnostics ?? {}; return !log.connected ? 'Off' : log.paused ? 'Paused' : 'On'; }
    default: return '';
  }
}

/** A problem card on the home list: what will go wrong, why, and one Allow that starts the fix. */
function problemCard(ctx, {label, detail, allow, action}) {
  const card = el('div', 'settings-alert');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', label);
  const box = el('span', 'settings-icon');
  box.dataset.tone = 'red';
  box.append(symbol('error'));
  const copy = el('span', 'settings-copy');
  copy.append(el('span', 'settings-label', label), el('span', 'settings-detail', detail));
  const fix = el('button', 'tonal-btn settings-alert-action', 'Allow');
  fix.type = 'button';
  fix.dataset.action = action;
  fix.setAttribute('aria-label', allow);
  fix.addEventListener('click', () => ctx.act(ctx, action));
  card.append(box, copy, fix);
  return card;
}

const capital = text => text.charAt(0).toUpperCase() + text.slice(1);

export function homePage(ctx) {
  const s = ctx.state;
  const sections = [];
  const problems = [];
  if (alarmsBlocked(s)) {
    const off = alarmsOff(s);
    problems.push({label: 'Alarms may not ring', detail: `${capital(off.join(' and '))} are off`,
      allow: `Allow ${off[0]}`, action: s.notificationsAllowed ? 'exact_alarms' : 'notifications'});
  }
  if (notchWaiting(s)) problems.push({label: 'The notch is waiting for Android', detail: 'RPM Notch is off in Accessibility',
    allow: 'Allow RPM Notch', action: 'notch_permission'});
  if (problems.length) {
    const attention = group('', {id: 'attention'});
    for (const problem of problems) attention.card.append(problemCard(ctx, problem));
    sections.push(attention);
  }
  for (const pages of HOME_GROUPS) {
    const section = group();
    for (const page of pages) {
      const {title, icon, tone} = SETTINGS_PAGES[page];
      const node = row({label: title, value: homeValue(ctx, page), icon, tile: tone, next: true, action: `open_${page}`});
      node.addEventListener('click', () => ctx.options.openPage?.(page));
      section.card.append(node);
    }
    sections.push(section);
  }
  return sections;
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
    add(ctx, butterfly, {label: 'Floating butterfly', detail: 'Open Capture over your other apps', value: 'Allow', tone: 'error',
      action: 'overlay_permission'});
  } else {
    add(ctx, butterfly, {label: 'Floating butterfly', detail: 'Open Capture over your other apps',
      action: s.launcherRunning ? 'hide_butterfly' : 'show_butterfly', role: 'switch', toggle: !!s.launcherRunning});
  }
  const widgets = group('Home screen widgets', {id: 'appearance'});
  slider(ctx, widgets, 'Widget text size', 'Relative to your Android font size', safeScale(s.widgetTextScale), 80, 160, 'set_widget_text_scale');
  return [notch, butterfly, widgets];
}

/** A permission says its state once: a quiet Allowed, or the row's one action word, Allow, on the chevrons' edge. */
const permission = allowed => allowed ? {value: 'Allowed'} : {value: 'Allow', tone: 'error'};

function alertsPage(ctx) {
  const s = ctx.state;
  const allowed = group('Permissions', {id: 'permissions',
    caption: 'Battery saving can delay reminders.'});
  add(ctx, allowed, {label: 'Notifications', detail: 'For reminders and ringing alarms', ...permission(s.notificationsAllowed), action: 'notifications'});
  add(ctx, allowed, {label: 'Exact alarms', detail: 'For alarms at the chosen minute', ...permission(s.exactAlarmsAllowed), action: 'exact_alarms'});
  add(ctx, allowed, {label: 'Check saved alerts', detail: 'Run after a permission change', action: 'check_alerts', act: 'Check'});
  const sounds = group('Sounds', {id: 'sounds'});
  add(ctx, sounds, {label: 'Alarm sound', value: s.alarmSound, action: 'choose_alarm', next: true});
  add(ctx, sounds, {label: s.previewing ? 'Stop alarm sound' : 'Play alarm sound', detail: s.previewing ? 'Playing at alarm volume' : '5 seconds at alarm volume',
    action: 'preview_alarm', act: s.previewing ? 'Stop' : 'Play'});
  add(ctx, sounds, {label: 'Reminder sound', value: s.reminderSound, action: 'reminder_sound', next: true});
  return [allowed, sounds];
}

/** Voice and persona live on this phone, not in native settings; each opens an M3 dialog and saves at once.
 *  The Gemini key lives once, in AI keys; with none, one line above the card says what the mic uses and links there. */
function voicePage(ctx) {
  const s = ctx.state;
  const {voice, persona} = voiceChoice();
  const sound = group('', {id: 'voice'});
  if (!s.hasGeminiKey) {
    const note = el('p', 'settings-lead', 'The mic uses Android dictation. ');
    const link = el('button', 'settings-link', 'Add a Gemini key');
    link.type = 'button';
    link.dataset.action = 'open_ai';
    link.addEventListener('click', () => ctx.options.openPage?.('ai'));
    note.append(link);
    sound.insertBefore(note, sound.card);
  }
  const open = dialog => { document.body.append(dialog); dialog.showModal(); };
  const voiceRow = row({label: 'Voice', value: voice ?? 'Default', action: 'voice_name', next: true});
  voiceRow.addEventListener('click', () => open(voiceDialog(document, voice, next => { setVoice(next); ctx.render(ctx); })));
  const personaRow = row({label: 'Persona', detail: persona, value: persona ? '' : 'Not set', action: 'voice_persona', next: true});
  if (persona) personaRow.querySelector('.settings-detail')?.classList.add('settings-clamp');
  personaRow.addEventListener('click', () => open(personaDialog(document, persona, next => { setPersona(next); ctx.render(ctx); })));
  sound.card.append(voiceRow, personaRow);
  return [sound];
}

/** Every key in one place: what each one does, and Connected or Not set. */
function aiPage(ctx) {
  const s = ctx.state;
  const keys = group('', {id: 'ai'});
  const state = on => on ? 'Connected' : 'Not set';
  add(ctx, keys, {label: 'Claude', detail: 'Capture asks Claude first', value: state(s.claudeKey), action: 'connect_claude_key', next: true});
  add(ctx, keys, {label: 'OpenRouter', detail: 'Backup, suggestions and Jev sorting', value: state(s.openRouterKey), action: 'connect_openrouter_key', next: true});
  add(ctx, keys, {label: 'Gemini', detail: 'Talk to RPM by voice', value: state(s.hasGeminiKey), action: 'connect_gemini_key', next: true});
  const sections = [keys];
  if (s.claudeKey || s.openRouterKey || s.hasGeminiKey) {
    const remove = group('', {caption: 'Plans and conversations stay on this phone.'});
    if (s.claudeKey) add(ctx, remove, {label: 'Remove Claude key', tone: 'error', action: 'remove_claude_key'});
    if (s.openRouterKey) add(ctx, remove, {label: 'Remove OpenRouter key', tone: 'error', action: 'remove_openrouter_key'});
    if (s.hasGeminiKey) add(ctx, remove, {label: 'Remove Gemini key', detail: 'The mic goes back to Android dictation', tone: 'error', action: 'remove_gemini_key'});
    sections.push(remove);
  }
  return sections;
}

function syncPage(ctx) {
  const cloud = group('', {id: 'cloud'});
  add(ctx, cloud, {label: 'Link a web browser', detail: 'Plan on a computer with the same tasks', action: 'cloud_web', next: true});
  const files = group('Backup', {id: 'context-history', caption: 'Plans stay on this phone.'});
  add(ctx, files, {label: 'Export', action: 'export_context', next: true});
  add(ctx, files, {label: 'Import', action: 'import_context', next: true});
  const backups = ctx.state.backupCount;
  add(ctx, files, {label: 'Restore a backup', value: backups ? String(backups) : 'None yet', action: 'restore_backup', next: !!backups});
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

/** What a browser can set: the same rows as the phone's home, only for pages that work here, and a footnote naming the rest. */
const WEB_PAGES = ['appearance', 'about'];
export function phoneOnlyPage(ctx, text) {
  if (ctx.page === 'appearance') return appearancePage(ctx);
  if (ctx.page === 'about') return aboutPage(null);
  const section = group('', {id: 'web-pages', caption: `${text} are set in RPM on your phone.`});
  for (const page of WEB_PAGES) {
    const {title, icon, tone} = SETTINGS_PAGES[page];
    const node = row({label: title, value: page === 'appearance' ? THEME_NAMES[clarityPreferences().appearance] : '', icon, tile: tone, next: true, action: `open_${page}`});
    node.addEventListener('click', () => ctx.options.openPage?.(page));
    section.card.append(node);
  }
  section.querySelector('.settings-caption').classList.add('settings-footnote');
  return [section];
}
