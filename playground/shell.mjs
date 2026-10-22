import {KEYS, companion, device, setDevice, prefs, readJson, writeJson, wipeAppDataThenWrite, validateLikeCompanionStore} from './store.mjs';
import {S24} from './device.mjs';
import {notchShell} from './notch-shell.mjs';
import {renderWidget} from './widget-view.mjs';

const $ = id => document.getElementById(id);
const screen = $('screen');
const frames = {capture: $('capture-frame'), planner: $('planner-frame')};
const PAGES = {capture: '/index.html', planner: '/planner.html'};
const shellState = () => ({view: 'widget', expandNotch: false, notchTime: '', ...readJson(KEYS.shell, {})});
const setShell = patch => writeJson(KEYS.shell, {...shellState(), ...patch});
let captureExpanded = false, history = [];

function say(text) { $('status').textContent = text; }
const notch = notchShell({stage: $('notch-stage'), empty: $('notch-empty'), say, shell: shellState, setShell,
  open: (page, target) => window.rpmPlayground.open(page, target)});

function layoutFrames() {
  const {textScale} = device(), status = S24.statusBarDp, nav = S24.navBarDp, w = 384, h = 832;
  const wide = captureExpanded || textScale * prefs().widgetTextScale / 100 > 1.3, pad = wide ? 4 : 12;
  const avail = w - 2 * pad, cw = wide ? avail : Math.min(560, avail);
  Object.assign(frames.capture.style, {insetInlineStart: `${(w - cw) / 2}px`, insetBlockStart: `${status + 24}px`,
    inlineSize: `${cw}px`, blockSize: `${h - status - nav - pad - 24}px`});
  Object.assign(frames.planner.style, {insetInlineStart: '4px', insetBlockStart: `${status + 4}px`,
    inlineSize: `${w - 8}px`, blockSize: `${h - status - nav - 8}px`});
}

function load(page, hash = '') {
  const frame = frames[page];
  frame.style.colorScheme = device().dark ? 'dark' : 'light';
  frame.src = PAGES[page] + hash;
  frame.dataset.loaded = 'true';
}

frames.capture.addEventListener('load', () => {
  const win = frames.capture.contentWindow;
  win.rpmSurfaceInsetsValue = {bottom: 0, width: frames.capture.clientWidth, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches};
  win.rpmSurfaceInsets?.(win.rpmSurfaceInsetsValue);
});

function resume(page) {
  const win = frames[page].contentWindow;
  win?.rpmPhoneRefresh?.();
  win?.dispatchEvent(new Event('rpm-settings-refresh'));
}

function show(view, {remember = true} = {}) {
  const from = screen.dataset.view;
  if (remember && from && from !== view) history.push(from);
  screen.dataset.view = view;
  setShell({view});
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  for (const g of document.querySelectorAll('[data-for]')) g.hidden = g.dataset.for !== view;
  $('copy-badge').textContent = view === 'notch' ? 'Copy of the native notch, not the real code' : 'Copy of the native widget, not the real code';
  if (frames[view]) {
    if (!frames[view].dataset.loaded) load(view);
    else resume(view);
  }
  paintCopies();
}

function paintCopies() {
  const view = screen.dataset.view, {textScale} = device();
  if (view === 'widget' || view === 'capture') renderWidget($('home-widget'), {widthDp: 360, fontScale: textScale,
    onOpen: () => window.rpmPlayground.open('planner'), onCapture: () => window.rpmPlayground.open('capture'), onVoice: startVoice});
  if (view === 'notch') notch.paint();
}

function startVoice() {
  window.rpmPlayground.open('capture');
  const win = frames.capture.contentWindow;
  if (win?.rpmStartVoice) win.rpmStartVoice();
  else frames.capture.addEventListener('load', () => { frames.capture.contentWindow.rpmPendingVoice = true; }, {once: true});
}

function applyDevice() {
  const d = device();
  screen.style.colorScheme = d.dark ? 'dark' : 'light';
  screen.dataset.wallpaper = d.wallpaper;
  for (const b of document.querySelectorAll('[data-wallpaper]')) b.setAttribute('aria-pressed', String(b.dataset.wallpaper === d.wallpaper));
  for (const b of document.querySelectorAll('[data-text-scale]')) b.setAttribute('aria-pressed', String(Number(b.dataset.textScale) === d.textScale));
  for (const b of document.querySelectorAll('[data-dark]')) b.setAttribute('aria-pressed', String(b.dataset.dark === String(d.dark)));
  layoutFrames();
}

function reloadPages() {
  for (const page of Object.keys(frames)) if (frames[page].dataset.loaded) load(page);
  paintCopies();
}

async function resetToSample() {
  const seed = await (await fetch('/__playground/seed.json')).json();
  wipeAppDataThenWrite(seed);
  reloadPages();
  say('Sample data loaded. Dates are relative to today.');
}

window.rpmPlayground = {
  open(page, target) {
    if (page === 'planner' && target && Object.keys(target).length) load('planner', '#open=' + encodeURIComponent(JSON.stringify(target)));
    show(page);
  },
  finish(page) {
    if (page === 'capture') captureExpanded = false, layoutFrames();
    const back = history.pop();
    show(back && back !== page ? back : 'widget', {remember: false});
  },
  toggleExpanded() { captureExpanded = !captureExpanded; layoutFrames(); },
  paintPlannerBars(dark) { document.querySelector('.planner-surface').style.colorScheme = dark ? 'dark' : 'light'; },
  log(page, action) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} · ${page} · ${action}`;
    $('log').prepend(item);
    while ($('log').children.length > 40) $('log').lastChild.remove();
  },
};

$('back').addEventListener('click', () => {
  const view = screen.dataset.view, win = frames[view]?.contentWindow;
  if (view === 'notch' && notch.expanded()) return notch.setExpanded(false);
  if (win?.rpmHandleBack?.() === true) return;
  window.rpmPlayground.finish(view);
});
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => show(b.dataset.view));
for (const b of document.querySelectorAll('[data-expand]')) b.addEventListener('click', () => notch.setExpanded(b.dataset.expand === 'true'));
for (const b of document.querySelectorAll('[data-alert]')) b.addEventListener('click', () => notch.setAlert(b.dataset.alert));
$('notch-animate').addEventListener('click', () => notch.animateOpen());
for (const b of document.querySelectorAll('[data-text-scale]')) b.addEventListener('click', () => { setDevice({textScale: Number(b.dataset.textScale)}); applyDevice(); reloadPages(); });
for (const b of document.querySelectorAll('[data-dark]')) b.addEventListener('click', () => { setDevice({dark: b.dataset.dark === 'true'}); applyDevice(); reloadPages(); });
for (const b of document.querySelectorAll('[data-wallpaper]')) b.addEventListener('click', () => { setDevice({wallpaper: b.dataset.wallpaper}); applyDevice(); });
screen.addEventListener('click', event => { if (screen.dataset.view === 'notch' && notch.expanded() && !notch.contains(event.target)) notch.setExpanded(false); });
$('notch-time').addEventListener('change', event => { setShell({notchTime: event.target.value}); notch.paint(); });
$('notch-live').addEventListener('click', () => { $('notch-time').value = ''; setShell({notchTime: ''}); notch.paint(); });
$('reset').addEventListener('click', () => resetToSample().catch(() => say('The sample data could not be made. Check the terminal running npm run playground.')));
$('download').addEventListener('click', () => {
  const data = companion();
  if (!data) return say('There is no saved data yet.');
  const a = Object.assign(document.createElement('a'), {download: 'companion.json',
    href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}))});
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('load').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    wipeAppDataThenWrite(validateLikeCompanionStore(JSON.parse(await file.text())));
    reloadPages();
    say(`Loaded ${file.name}.`);
  } catch (error) {
    say(`${file.name} was not loaded: ${error instanceof SyntaxError ? 'it is not JSON.' : error.message}`);
  }
});
window.addEventListener('storage', event => { if (event.key === KEYS.companion || event.key === KEYS.prefs) paintCopies(); });

const tick = () => {
  const now = new Date();
  $('clock').textContent = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (screen.dataset.view === 'notch') notch.paint();
};
setInterval(tick, 1000);

applyDevice();
$('notch-time').value = shellState().notchTime;
if (!companion() && !localStorage.getItem(KEYS.shell)) await resetToSample().catch(() => say('The sample data could not be made.'));
show(shellState().view, {remember: false});
tick();
