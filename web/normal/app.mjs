import fixture from '../fixtures/snapshot.json' with {type: 'json'};
import {createStore, initialState, view, taskMarks, captureReceipts, phoneStatus, inFlight} from './core/store.mjs';
import {createController} from './core/controller.mjs';
import {mockTransport, SCENARIOS} from './core/transport-mock.mjs';
import {httpTransport, readConfig} from './core/transport-http.mjs';
import {h, swap} from './ui/dom.mjs';
import {renderNav, renderHead, renderNotices} from './ui/shell.mjs';
import {renderToday} from './ui/today.mjs';
import {renderWeek} from './ui/week.mjs';
import {renderBlocks} from './ui/blocks.mjs';
import {renderInbox} from './ui/inbox.mjs';
import {createCapture} from './ui/capture.mjs';
import {createSheet} from './ui/sheet.mjs';
import {createOverlays} from './ui/overlays.mjs';
import {enableDrag} from './ui/drag.mjs';
import {linkView, unlinkedView} from './ui/link.mjs';
import {bindKeys} from './ui/keys.mjs';
import {weekModel, inboxTasks} from './core/model.mjs';
import {longDate, plural} from '../../android-companion/planner/format.mjs';
import {localDay} from '../../android-companion/planner-state.mjs';

const params = new URLSearchParams(location.search);
const storage = globalThis.localStorage;
if (params.get('base')) storage.setItem('rpm.web.base', params.get('base'));
const config = readConfig(storage);
const useHttp = params.get('transport') === 'http' || (!!config.base && params.get('transport') !== 'mock');
const scenario = SCENARIOS.includes(params.get('state')) ? params.get('state') : null;
const pinned = /^\d{1,2}:\d{2}$/.test(params.get('at') ?? '') && !useHttp ? params.get('at') : null;
const offset = pinned ? Date.parse(`${localDay()}T${pinned.padStart(5, '0')}`) - Date.now() : 0;
const now = () => Date.now() + offset;

const store = createStore(initialState());
const transport = useHttp ? httpTransport({base: config.base, token: config.token, storage, now}) : mockTransport(fixture, {scenario, now});
const wide = matchMedia('(width > 1180px)');
const ui = {captureOpen: wide.matches, history: false, blockFilter: null, block: null, weekDay: null, showDone: false, find: ''};
let theme = storage.getItem('rpm.web.theme') ?? 'system';
let ctx = null, lastRoute = null, prevMarks = new Map(), linkNode = null, snackTimer = null;
const fading = new Map(), seenReceipts = new Set(), fresh = new Set();

const snackbar = h('div.snackbar', {role: 'status', hidden: true});
function notify({text, undo = null}) {
  clearTimeout(snackTimer);
  swap(snackbar, h('span.snackbar-text', text), undo ? h('button.snackbar-action', {type: 'button', onclick: () => { snackbar.hidden = true; control.undo(undo); }}, 'Undo') : null);
  snackbar.hidden = false;
  snackTimer = setTimeout(() => { snackbar.hidden = true; }, 6000);
}

const control = createController({store, transport, now, notify});
const capture = createCapture({onSend: text => control.capture(text), onClose: () => setCapture(false)});
const sheet = createSheet(() => ctx);
const overlays = createOverlays(() => ctx);
const nav = h('nav.nav', {'aria-label': 'Views'});
const head = h('header.head');
const notices = h('div.notices');
const pane = h('div.pane', {id: 'pane'});
const main = h('main.main', head, notices, pane);
const tab = h('button.capture-tab', {type: 'button', 'aria-controls': 'capture', onclick: () => setCapture(true)}, h('span.ms', {'aria-hidden': 'true'}, 'edit_note'), h('span.tab-label', 'Capture'));
const scrim = h('div.scrim', {onclick: () => setCapture(false)});
const mini = h('button.mini-composer', {type: 'button', onclick: () => setCapture(true)}, h('span.grow', 'Capture a thought'), h('span.ms', {'aria-hidden': 'true'}, 'mic'));
const app = h('div.app', nav, main, tab, capture.node, mini);
document.body.append(app, scrim, snackbar, sheet.node, ...overlays.nodes);

function route() {
  const [view = 'today', id = null] = location.hash.replace(/^#\/?/, '').split('/');
  return {view: ['today', 'week', 'blocks', 'inbox', 'link'].includes(view) ? view : 'today', id: id ? decodeURIComponent(id) : null};
}
function go(view, id = null) {
  location.hash = `#/${view}${id ? '/' + encodeURIComponent(id) : ''}`;
}
function setCapture(open) {
  ui.captureOpen = open;
  render();
  if (open) setTimeout(() => capture.focus(), wide.matches ? 0 : 360);
}
function setTheme(value) {
  theme = value;
  storage.setItem('rpm.web.theme', value);
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}
setTheme(theme);

function buildCtx(state) {
  const marks = taskMarks(state);
  for (const [id, entry] of prevMarks) {
    if (!marks.has(id) && entry.status !== 'rejected' && entry.status !== 'conflict' && !fading.has(id)) {
      fading.set(id, setTimeout(() => { fading.delete(id); render(); }, 200));
    }
  }
  prevMarks = marks;
  const receipts = captureReceipts(state);
  fresh.clear();
  for (const r of receipts) if (!seenReceipts.has(r.id)) { seenReceipts.add(r.id); if (ctx) fresh.add(r.id); }
  const r = route();
  if (r.view === 'blocks') ui.block = r.id;
  return {state, snap: view(state), now: now(), marks, fading, control, ui, route: r, phone: phoneStatus(state, now()), demo: transport.kind === 'mock',
    receipts, fresh, captureOpen: ui.captureOpen, theme, notify, go,
    open: (id, options) => sheet.open(id, options),
    setUi: patch => { Object.assign(ui, patch); render(); },
    drink: () => control.act('log-water', {at: new Date(now()).toISOString()}, 'Glass logged'),
    logMeal: (slot, at) => overlays.logMeal(slot, at),
    toggleCapture: () => setCapture(!ui.captureOpen),
    toggleHistory: () => { ui.history = !ui.history; render(); },
    openSettings: () => overlays.settings(),
    setTheme: value => { setTheme(value); render(); },
    unlink: () => transport.unlink(),
    scheduleMenu: (task, anchor) => overlays.scheduleMenu(task, anchor),
    moveMenu: (task, anchor) => overlays.moveMenu(task, anchor),
  };
}

function headFor(c) {
  if (c.route.view === 'week') {
    const days = weekModel(c.snap, c.now);
    const fmt = d => new Date(d + 'T12:00').toLocaleDateString([], {day: 'numeric', month: 'long'});
    return ['Week', `${fmt(days[0].day)} to ${fmt(days[6].day)}`];
  }
  if (c.route.view === 'blocks') return ['Blocks', plural(c.snap.blocks.filter(b => !b.archived).length, 'open Block')];
  if (c.route.view === 'inbox') return ['Inbox', plural(inboxTasks(c.snap).length, 'task') + ' to sort'];
  return ['Today', longDate(localDay(c.now))];
}

const VIEW = {today: renderToday, week: renderWeek, blocks: renderBlocks, inbox: renderInbox};

function render() {
  const state = store.get();
  ctx = buildCtx(state);
  const linked = ctx.route.view !== 'link' && state.phase !== 'unlinked';
  app.dataset.capture = !linked ? 'off' : ui.captureOpen ? 'open' : 'closed';
  const overlay = ui.captureOpen && !wide.matches;
  main.inert = overlay;
  nav.inert = overlay;
  renderNav(nav, ctx);
  const routeKey = ctx.route.view;
  if (routeKey === 'link') {
    if (!linkNode) linkNode = linkView({link: code => transport.link(code), done: () => { linkNode = null; go('today'); }});
    swap(head);
    swap(notices);
    if (pane.firstChild !== linkNode) swap(pane, linkNode);
  } else if (state.phase === 'unlinked') {
    swap(head);
    swap(notices);
    swap(pane, unlinkedView(go));
  } else if (!ctx.snap) {
    renderHead(head, ctx, headFor({...ctx, snap: {blocks: [], tasks: []}, route: {view: 'today'}})[0], null);
    renderNotices(notices, ctx);
    swap(pane, h('div', {'aria-busy': 'true', 'aria-label': 'Loading your plan'}, h('div.skeleton.tall'), h('div.skeleton'), h('div.skeleton')));
  } else {
    const [title, sub] = headFor(ctx);
    renderHead(head, ctx, title, sub);
    renderNotices(notices, ctx);
    swap(pane, VIEW[routeKey](ctx));
  }
  if (routeKey !== lastRoute) {
    pane.classList.add('entering');
    setTimeout(() => pane.classList.remove('entering'), 320);
    if (lastRoute) pane.scrollTop = 0;
    lastRoute = routeKey;
  }
  capture.render(ctx);
  sheet.refresh();
}

let queued = false;
store.subscribe(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
});
addEventListener('hashchange', render);
wide.addEventListener('change', () => { ui.captureOpen = wide.matches; render(); });
addEventListener('online', () => store.dispatch({type: 'online', online: true}));
addEventListener('offline', () => store.dispatch({type: 'online', online: false}));
if (!navigator.onLine) store.dispatch({type: 'online', online: false});
setInterval(render, 30000);

enableDrag(app, () => ctx);
bindKeys({getCtx: () => ctx, pane, store, control, sheet, overlays, capture, setCapture, wide, go,
  lastCommand: () => [...store.get().commands].reverse().find(c => !c.dismissed && c.status !== 'cancelled' && c.type !== 'undo'
    && (inFlight(store.get(), c) || c.status === 'applied'))});
render();
transport.start(event => store.dispatch(event));
