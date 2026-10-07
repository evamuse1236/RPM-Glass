/** Settings: an M3 list inside the planner, backed by native actions. The planner's top bar owns Back. */
import {automationPreview} from './automation-preview-ui.mjs';
import {userMessage} from './user-message.mjs';

const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};
const symbol = name => {
  const node = el('span', 'ms', name);
  node.setAttribute('aria-hidden', 'true');
  return node;
};
const safeScale = value => Math.max(80, Math.min(160, Number.isInteger(value) ? value : 100));

export const settingsSectionAction = section => {
  switch (section) {
    case 'alarm_sound': return 'choose_alarm';
    case 'reminder_sound': return 'reminder_sound';
    case 'ai_connection': return 'connect_key';
    case 'notifications': return 'notifications';
    case 'exact_alarms': return 'exact_alarms';
    default: return null;
  }
};

const NEEDS_PERMISSION = 'Permission needed';

/** One list row: headline, supporting text and a trailing value, switch or chevron. */
function row(label, detail, value, action, {toggle = null, icon = null} = {}) {
  const node = el('button', 'settings-row');
  node.type = 'button';
  node.dataset.action = action;
  if (icon) node.append(symbol(icon));
  const copy = el('span', 'settings-copy');
  copy.append(el('strong', '', label));
  if (detail) copy.append(el('small', '', detail));
  node.append(copy);
  if (toggle !== null) {
    node.setAttribute('role', 'switch');
    node.setAttribute('aria-checked', String(toggle));
    const track = el('span', 'switch');
    track.append(el('span', 'switch-thumb'));
    node.append(track);
  } else if (value) {
    const trailing = el('small', 'settings-value', value);
    if (value === NEEDS_PERMISSION) trailing.classList.add('warning');
    node.append(trailing);
  }
  return node;
}

function group(title, id) {
  const node = el('section', 'settings-group');
  node.dataset.section = id;
  node.append(el('h2', '', title));
  return node;
}

function announce(ctx, value, error = false) {
  ctx.noticeText = value ?? '';
  ctx.noticeError = error;
  const notice = ctx.host.querySelector('.settings-notice');
  if (!notice) return;
  notice.textContent = ctx.noticeText;
  notice.classList.toggle('error', ctx.noticeError);
  notice.hidden = !ctx.noticeText;
}

function add(ctx, section, label, detail, value, action, extra) {
  const node = row(label, detail, value, action, extra);
  node.addEventListener('click', () => act(ctx, action));
  section.append(node);
  return node;
}

function slider(ctx, section, label, detail, value, min, max, action) {
  const wrap = el('div', 'settings-slider');
  wrap.dataset.action = action;
  const head = el('div', 'settings-slider-head');
  const output = el('output', 'settings-value', value + '%');
  head.append(el('label', '', label), output);
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.setAttribute('aria-label', label);
  const sample = el('p', 'widget-text-preview', 'A clear next action');
  sample.style.fontSize = value / 100 + 'em';
  sample.setAttribute('aria-label', 'Widget text size preview');
  wrap.append(head, input, el('small', '', detail), sample);
  input.addEventListener('input', () => {
    output.textContent = input.value + '%';
    sample.style.fontSize = Number(input.value) / 100 + 'em';
  });
  input.addEventListener('change', () => act(ctx, action, {value: Number(input.value)}));
  section.append(wrap);
}

function soundsSection(ctx) {
  const section = group('Sounds & alerts', 'sounds');
  add(ctx, section, 'Alarm sound', 'Ringing alarms use alarm volume', ctx.state.alarmSound, 'choose_alarm');
  add(ctx, section, ctx.state.previewing ? 'Stop alarm preview' : 'Preview alarm sound', 'Plays for 5 seconds at alarm volume',
    ctx.state.previewing ? 'Playing' : '', 'preview_alarm');
  add(ctx, section, 'Reminder sound', 'Android notification channel', ctx.state.reminderSound, 'reminder_sound');
  add(ctx, section, 'Notifications', 'Required for reminders and ringing alarms',
    ctx.state.notificationsAllowed ? 'Allowed' : NEEDS_PERMISSION, 'notifications');
  add(ctx, section, 'Exact alarms', 'Required for alarms at the chosen time',
    ctx.state.exactAlarmsAllowed ? 'Allowed' : NEEDS_PERMISSION, 'exact_alarms');
  if (ctx.state.fullScreenSupported) {
    add(ctx, section, 'Lock-screen alarms', 'Controls full-screen ringing alerts',
      ctx.state.fullScreenAllowed ? 'Allowed' : NEEDS_PERMISSION, 'full_screen_alarms');
  }
  add(ctx, section, 'Check saved alerts', 'Retry scheduling after permission changes', '', 'check_alerts');
  section.append(el('p', 'settings-note',
    'Android battery restrictions can delay reminders. Keep RPM installed for saved alarms to ring.'));
  return section;
}

function widgetsSection(ctx) {
  const section = group('Widgets', 'appearance');
  slider(ctx, section, 'Widget text size', 'Relative to your Android system font size. The planner keeps its system size.',
    safeScale(ctx.state.widgetTextScale), 80, 160, 'set_widget_text_scale');
  if (!ctx.state.overlayAllowed) {
    add(ctx, section, 'Allow floating butterfly', 'Open RPM over your other apps', NEEDS_PERMISSION, 'overlay_permission');
  } else {
    add(ctx, section, 'Floating butterfly', 'Open Capture over your other apps', '',
      ctx.state.launcherRunning ? 'hide_butterfly' : 'show_butterfly', {toggle: !!ctx.state.launcherRunning});
  }
  return section;
}

function accountSection(ctx) {
  const section = group('Account & backup', 'ai');
  add(ctx, section, ctx.state.aiConnected ? 'Replace AI key' : 'Connect AI key', 'OpenRouter · Luna chat + review-only Jev sorting',
    ctx.state.aiConnected ? 'Connected' : 'Not connected', 'connect_key');
  if (ctx.state.aiConnected) add(ctx, section, 'Remove AI key', 'Plans and conversations stay on this phone', '', 'remove_key');
  const history = el('div', 'settings-subgroup');
  history.dataset.section = 'context-history';
  add(ctx, history, 'Import context copy', 'Backs up this phone first; imported alerts stay off', '', 'import_context');
  add(ctx, history, 'Export context', 'Save conversations and plans as a personal JSON file', '', 'export_context');
  add(ctx, history, 'Restore a backup', 'Pre-import copies saved privately on this phone',
    ctx.state.backupCount ? String(ctx.state.backupCount) : 'None', 'restore_backup');
  add(ctx, history, 'Earlier RPM screens', 'Open the original planner', '', 'earlier_screens');
  history.append(el('p', 'settings-note', 'Plans stay on this phone. Relevant context goes to OpenRouter when you chat; '
    + 'connected diagnostics upload console output and error details.'));
  section.append(history);
  return section;
}

function diagnosticsSection(ctx) {
  const section = group('Diagnostics', 'diagnostics');
  const log = ctx.state.diagnostics ?? {};
  section.append(el('p', 'settings-note', 'Full app console output, errors and operation records may include capture '
    + 'content. Connected logs are private and expire after 14 days. Credentials are redacted.'));
  if (log.connected) {
    const last = log.lastUpload ? new Date(log.lastUpload).toLocaleString() : 'No upload yet';
    section.append(el('p', 'settings-note', `${log.message ?? 'Connected'} · ${log.queued ?? 0} queued · ${last}`));
    if (log.endpoint) section.append(el('p', 'settings-note', log.endpoint));
    if (log.dropped || log.rejected) {
      section.append(el('p', 'settings-note', `${(log.dropped ?? 0) + (log.rejected ?? 0)} records lost to queue or capture limits.`));
    }
    if (log.authError) add(ctx, section, 'Pair diagnostics again', 'The previous connection was revoked', '', 'diagnostics_connect');
    else {
      add(ctx, section, log.paused ? 'Resume logging' : 'Pause logging', 'Controls capture and automatic upload',
        log.enabled ? 'On' : 'Paused', log.paused ? 'diagnostics_resume' : 'diagnostics_pause');
    }
    if (log.enabled) add(ctx, section, 'Upload queued logs', 'Requires an internet connection', '', 'diagnostics_upload');
    add(ctx, section, 'Disconnect diagnostics', 'Clears queued logs on this phone', '', 'diagnostics_disconnect');
  } else {
    add(ctx, section, 'Connect diagnostics', 'Use a code from your private RPM database', 'Not connected', 'diagnostics_connect');
  }
  section.append(el('p', 'settings-note', 'Captures app console channels, not the phone’s system log. Offline storage '
    + 'holds up to 2,000 records or 2 MB; oversized records are truncated.'));
  return section;
}

function aboutSection() {
  const section = group('About', 'about');
  section.append(el('p', 'settings-note', 'RPM · Result, Purpose, Plan'),
    el('p', 'settings-note', 'Capture saves your words and asks before adding tasks or blocks.'));
  const previews = el('details', 'settings-details');
  previews.append(el('summary', '', 'Automation previews'), automationPreview());
  section.append(previews);
  return section;
}

function render(ctx) {
  if (ctx.destroyed || !ctx.state) return;
  const focus = document.activeElement?.dataset?.action;
  const page = el('div', 'settings-page');
  page.setAttribute('aria-label', 'Settings');
  const notice = el('p', 'settings-notice', ctx.noticeText);
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = !ctx.noticeText;
  notice.classList.toggle('error', ctx.noticeError);
  page.append(notice, soundsSection(ctx), widgetsSection(ctx), accountSection(ctx), diagnosticsSection(ctx), aboutSection());
  if (ctx.state.working) page.querySelectorAll('button,input').forEach(node => { node.disabled = true; });
  ctx.host.replaceChildren(page);
  if (focus) ctx.host.querySelector(`[data-action="${focus}"]`)?.focus({preventScroll: true});
  const sectionName = ctx.options.section === 'import_export' ? 'context-history' : ctx.options.section;
  if (sectionName && !settingsSectionAction(sectionName)) {
    ctx.host.querySelector(`[data-section="${sectionName}"]`)?.scrollIntoView({block: 'start'});
  }
}

function loadError(ctx, message) {
  const page = el('div', 'settings-page');
  const problem = el('div', 'settings-load-error');
  problem.setAttribute('role', 'alert');
  const retry = el('button', 'tonal-btn', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    ctx.host.replaceChildren(el('p', 'settings-loading', 'Loading settings…'));
    refresh(ctx);
  });
  problem.append(el('h2', '', 'Settings unavailable'), el('p', 'error', message), retry);
  page.append(problem);
  ctx.host.replaceChildren(page);
}

async function refresh(ctx) {
  const current = ++ctx.request;
  try {
    const next = await ctx.native('appSettings', {});
    if (ctx.destroyed || current !== ctx.request) return;
    const changed = JSON.stringify(ctx.state) !== JSON.stringify(next);
    ctx.state = next;
    if (changed) render(ctx);
    if (!ctx.openedSection) {
      ctx.openedSection = true;
      const initial = settingsSectionAction(ctx.options.section);
      if (initial) await act(ctx, initial);
    }
  } catch (error) {
    if (ctx.destroyed) return;
    const message = userMessage(error, 'Settings could not be refreshed.');
    if (ctx.state) announce(ctx, message, true);
    else loadError(ctx, message);
  }
}

async function act(ctx, action, payload = {}) {
  if (ctx.destroyed) return;
  try {
    ctx.host.querySelectorAll('button,input').forEach(node => { node.disabled = true; });
    const next = await ctx.native('settingsAction', {action, ...payload});
    if (ctx.destroyed) return;
    ctx.state = next;
    ctx.noticeText = next.message ?? '';
    ctx.noticeError = false;
    render(ctx);
  } catch (error) {
    if (ctx.destroyed) return;
    render(ctx);
    announce(ctx, userMessage(error, 'That setting could not be changed.'), true);
  }
}

function handleBack(ctx) {
  if (ctx.destroyed) return false;
  if (ctx.state?.previewing) ctx.native('settingsAction', {action: 'stop_preview'}).catch(() => {});
  if (ctx.options.onBack) ctx.options.onBack();
  return true;
}

function destroy(ctx) {
  if (ctx.destroyed) return;
  ctx.destroyed = true;
  window.removeEventListener('rpm-settings-refresh', ctx.onRefresh);
  window.removeEventListener('keydown', ctx.onKey);
  if (ctx.state?.previewing) ctx.native('settingsAction', {action: 'stop_preview'}).catch(() => {});
  ctx.host.replaceChildren();
}

/** Mount Settings as a destination inside PlannerActivity's existing workspace. */
export function mountSettings(api, host, options = {}) {
  const native = typeof api === 'function' ? api : (action, payload = {}) => api.native(action, payload);
  const ctx = {native, host, options, state: null, destroyed: false, request: 0,
    noticeText: '', noticeError: false, openedSection: false};
  ctx.onRefresh = () => refresh(ctx);
  ctx.onKey = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    handleBack(ctx);
  };
  host.replaceChildren(el('p', 'settings-loading', 'Loading settings…'));
  window.addEventListener('rpm-settings-refresh', ctx.onRefresh);
  window.addEventListener('keydown', ctx.onKey);
  refresh(ctx);
  return {
    refresh: () => refresh(ctx),
    destroy: () => destroy(ctx),
    handleBack: () => handleBack(ctx),
  };
}
