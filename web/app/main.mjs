import {createClient, problemText} from './client.mjs';
import {createPlanQueue} from './plan-queue.mjs';
import {createWebNative, PHONE, sortPreview} from './web-native.mjs';
import {savedLabel, sentLabel, watchRows} from './sync-marks.mjs';
import {userMessage} from '../../android-companion/user-message.mjs';
import {applyClarityPreferences} from '../../android-companion/planner-clarity.mjs';
import {mountPlanner} from '../../android-companion/planner.mjs';
import {inboxRows} from '../../android-companion/planner-state.mjs';
import {isWide, onWidthChange} from './desktop.mjs';
import {mountSidebar} from './sidebar.mjs';
import {mountAgenda} from './agenda.mjs';
import {FINE, mountRowTools} from './pointer.mjs';
import {mountShortcuts} from './shortcuts.mjs';
import {markOpenCard} from './open-card.mjs';
import {captureNotes, dismissedNotes} from './capture-notes.mjs';

const server = new URLSearchParams(location.search).get('server') ?? globalThis.RPM_SYNC_SERVER ?? location.origin;
const client = createClient({server});
const queue = createPlanQueue({client});
const $ = id => document.getElementById(id);
const DRAFT = 'rpm.web.capture.v1';
const SLOW = 30000;
const QUIET = 3600000;
const dismissed = dismissedNotes(localStorage);
let ui = null;
let remark = () => {};
let glance = () => {};

const unsettled = () => client.state.outbox.filter(e => !client.settled(e));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function mount() {
  if (ui || !queue.data()) return;
  const root = document.documentElement;
  applyClarityPreferences();
  root.dataset.reduceMotion = String(PHONE.reducedMotion);
  root.dataset.largeText = 'false';
  root.style.setProperty('--text-scale', String(PHONE.fontScale));
  ui = mountPlanner({getData: () => queue.data(), getPhone: () => PHONE, native: createWebNative({openCapture}), sortPreview,
    label: sentLabel, commit: async op => queue.commit(op), menuItems, wide: isWide});
  const sidebar = mountSidebar($('sidebar'), $('planner'), ui);
  const agenda = mountAgenda($('agenda'), $('planner'), ui, () => queue.data());
  glance = () => { sidebar.setInbox(inboxRows(queue.data()).length); agenda(); };
  if (matchMedia(FINE).matches) mountRowTools(document);
  mountShortcuts(document, ui, {work: $('workspace'), sheet: $('sheet'), dialog: $('keys-sheet')});
  onWidthChange(() => ui.closeSheet());
  markOpenCard($('workspace'), $('sheet'));
  if (location.hash === '#ideas') ui.goalIdeas();
  else if (location.hash.startsWith('#open=')) try { ui.openView(JSON.parse(decodeURIComponent(location.hash.slice(6)))); } catch {}
  remark = watchRows([$('workspace'), $('sheet')], queue);
}

const menuItems = () => [
  {label: 'Check for changes', icon: 'sync', onClick: () => client.tick()},
  ...(client.state.token === 'site' ? [] : [{label: 'Unlink this browser', icon: 'link_off', onClick: async () => { await client.unlink(); $('link-problem').hidden = true; }}]),
];

function noteItem({icon, text, tone, lines = [], onDismiss}) {
  const item = document.createElement('li');
  item.className = `note ${tone}`;
  const glyph = document.createElement('span');
  glyph.className = 'ms';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  const body = document.createElement('div');
  body.className = 'note-body';
  for (const [i, line] of [text, ...lines].entries()) {
    const words = document.createElement('p');
    if (i) words.className = 'note-outcome';
    words.textContent = line;
    body.append(words);
  }
  item.append(glyph, body);
  if (onDismiss) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn';
    close.setAttribute('aria-label', 'Dismiss');
    close.innerHTML = '<span class="ms" aria-hidden="true">close</span>';
    close.addEventListener('click', onDismiss);
    item.append(close);
  }
  return item;
}

function renderNotes(waiting) {
  const changes = waiting.filter(entry => entry.command.type !== 'capture');
  const notes = changes.length ? [noteItem({icon: 'schedule', tone: 'waiting', text: `${plural(changes.length, 'change')} waiting for your phone`})] : [];
  notes.push(...queue.problems().map((p, i) => noteItem({icon: 'error', tone: 'problem', text: userMessage(p.message), onDismiss: () => queue.dismissProblem(i)})));
  const {outbox, snapshot} = client.state;
  notes.push(...captureNotes({outbox, captures: snapshot?.captures, settled: client.settled, dismissed}).map(note => noteItem({...note,
    text: note.tone === 'problem' ? userMessage(note.text) : note.text,
    onDismiss: note.dismissible ? () => { dismissed.add(note.id); render(); } : null})));
  $('notes').replaceChildren(...notes);
  $('notes').hidden = notes.length === 0;
}

function render() {
  const s = client.state;
  const linked = !!s.token && !s.unlinked;
  $('link-view').hidden = linked;
  $('planner-view').hidden = !linked;
  $('link-unlinked').hidden = !s.unlinked;
  if (!linked) return;
  mount();
  const waiting = unsettled();
  const slow = waiting.some(e => Date.now() - Date.parse(e.command.createdAt) > SLOW);
  const banner = s.offline ?? (s.phoneMissing && !s.snapshot ? 'Your phone has not sent its planner yet. Open RPM on the phone with Cloud connected.'
    : slow ? 'Your phone has not picked up these changes yet. It does when RPM is open, or about every 15 minutes in the background.'
    : s.snapshot && Date.now() - Date.parse(s.snapshot.savedAt) > QUIET ? `${savedLabel(s.snapshot.savedAt)}. Changes since then on the phone are not shown yet.` : null);
  $('banner').hidden = !banner;
  $('banner').textContent = banner ?? '';
  renderNotes(waiting);
  if ($('capture-sheet').open) renderCaptureHistory();
  glance();
  remark();
}

function renderCaptureHistory() {
  const captures = (client.state.snapshot?.captures ?? []).filter(c => c.text).slice(-10).reverse();
  $('capture-history').hidden = !captures.length;
  $('capture-list').replaceChildren(...captures.map(capture => {
    const item = document.createElement('li');
    const said = document.createElement('p');
    said.className = 'capture-said';
    said.textContent = capture.text;
    item.append(said, ...(capture.receipt ?? []).map(line => {
      const outcome = document.createElement('p');
      outcome.className = 'capture-outcome';
      outcome.textContent = line.text;
      return outcome;
    }));
    return item;
  }));
}

function openCapture() {
  const sheet = $('capture-sheet');
  renderCaptureHistory();
  $('capture-text').value = localStorage.getItem(DRAFT) ?? '';
  $('capture-problem').hidden = true;
  sheet.showModal();
  $('capture-text').focus();
}

$('capture-text').addEventListener('input', event => localStorage.setItem(DRAFT, event.target.value));
$('capture-text').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('capture-form').requestSubmit(); }
});
$('capture-close').addEventListener('click', () => $('capture-sheet').close());
$('capture-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('capture-text').value;
  const snapshot = client.state.snapshot;
  if (!text.trim()) return;
  if (!snapshot) { $('capture-problem').hidden = false; $('capture-problem').textContent = 'Your plan has not arrived from your phone yet.'; return; }
  client.send({id: crypto.randomUUID(), type: 'capture', args: {text}, baseRevision: snapshot.revision, createdAt: new Date().toISOString()});
  localStorage.removeItem(DRAFT);
  $('capture-text').value = '';
  $('capture-sheet').close();
});

queue.subscribe(({foreign, createdSaved}) => {
  if (!ui) return render();
  if (foreign) dispatchEvent(new Event('rpm-data-refresh'));
  else if (createdSaved && $('sheet').hidden) ui.render();
  render();
});

$('link-form').addEventListener('submit', async event => {
  event.preventDefault();
  const code = $('link-code').value.trim();
  const problem = $('link-problem');
  if (!/^[A-Za-z2-9]{8}$/.test(code)) { problem.hidden = false; problem.textContent = 'Type all eight letters and numbers from your phone.'; return; }
  problem.hidden = true;
  const button = event.target.querySelector('button[type=submit]');
  button.disabled = true;
  try { await client.link(code, `${navigator.userAgentData?.platform ?? 'Browser'} web`); $('link-code').value = ''; }
  catch (error) { problem.hidden = false; problem.textContent = problemText(error); }
  finally { button.disabled = false; render(); }
});

queue.start();
await client.connect();
render();
let busy = false;
const loop = async () => {
  if (busy || document.hidden || !client.state.token) return;
  busy = true;
  try { await client.tick(); } finally { busy = false; }
};
loop();
setInterval(loop, 3000);
setInterval(render, SLOW);
document.addEventListener('visibilitychange', loop);
