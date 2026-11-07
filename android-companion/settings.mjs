/**
 * Settings: a short home of grouped cards, one row per page. Each page is its own planner screen
 * (`app.push('settings', page)`), so the planner's top bar owns Back and the title. Backed by native actions.
 */
import {userMessage} from './user-message.mjs';
import {el} from './settings-parts.mjs';
import {SETTINGS_PAGES, PAGES, homePage, phoneOnlyPage} from './settings-pages.mjs';

export {SETTINGS_PAGES};

/** A section a deep link names, mapped to the page that shows it (null = the home list). */
const SECTION_PAGES = {
  alarm_sound: 'alerts', reminder_sound: 'alerts', notifications: 'alerts', exact_alarms: 'alerts', sounds: 'alerts',
  ai_connection: 'ai', ai: 'ai', import_export: 'sync', 'context-history': 'sync', cloud: 'sync',
  appearance: 'appearance', 'planner-appearance': 'appearance', notch: 'notch', widgets: 'notch',
  voice: 'voice', diagnostics: 'diagnostics', about: 'about',
};
const isPage = page => typeof page === 'string' && Object.hasOwn(SETTINGS_PAGES, page);
export const settingsTitle = page => isPage(page) ? SETTINGS_PAGES[page].title : 'Settings';
export const settingsPageFor = section => isPage(section) ? section : Object.hasOwn(SECTION_PAGES, section ?? '') ? SECTION_PAGES[section] : null;

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

function announce(ctx, value, error = false) {
  ctx.noticeText = value ?? '';
  ctx.noticeError = error;
  const notice = ctx.host.querySelector('.settings-notice');
  if (!notice) return;
  notice.textContent = ctx.noticeText;
  notice.classList.toggle('error', ctx.noticeError);
  notice.hidden = !ctx.noticeText;
}

function render(ctx) {
  if (ctx.destroyed || !ctx.state) return;
  const focus = document.activeElement?.dataset?.action;
  const page = el('div', 'settings-page');
  page.dataset.page = ctx.page ?? 'home';
  page.setAttribute('aria-label', ctx.page ? SETTINGS_PAGES[ctx.page].title : 'Settings');
  const notice = el('p', 'settings-notice', ctx.noticeText);
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = !ctx.noticeText;
  notice.classList.toggle('error', ctx.noticeError);
  const sections = ctx.state.phoneOnly ? phoneOnlyPage(ctx, ctx.state.phoneOnly) : (PAGES[ctx.page] ?? homePage)(ctx);
  page.append(notice, ...sections);
  if (ctx.state.working) page.querySelectorAll('button,input').forEach(node => { node.disabled = true; });
  ctx.host.replaceChildren(page);
  if (focus) ctx.host.querySelector(`[data-action="${focus}"]`)?.focus({preventScroll: true});
  const section = ctx.options.section;
  if (section && !settingsSectionAction(section)) ctx.host.querySelector(`[data-section="${section}"]`)?.scrollIntoView({block: 'start'});
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
      if (initial && !next.phoneOnly) await act(ctx, initial);
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

/**
 * Mount one Settings page inside PlannerActivity's workspace. `page` is a SETTINGS_PAGES key or null for the home list;
 * `openPage(page)` pushes a page onto the planner's stack.
 */
export function mountSettings(api, host, options = {}) {
  const native = typeof api === 'function' ? api : (action, payload = {}) => api.native(action, payload);
  const page = isPage(options.page) ? options.page : null;
  const ctx = {native, host, options, page, state: null, destroyed: false, request: 0,
    noticeText: '', noticeError: false, openedSection: false, act, render};
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
