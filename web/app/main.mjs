import {createClient, problemText} from './client.mjs';
import {createPlanQueue} from './plan-queue.mjs';
import {createWebNative, PHONE, sortPreview} from './web-native.mjs';
import {savedLabel, sentLabel, watchRows} from './sync-marks.mjs';
import {userMessage} from '../../android-companion/user-message.mjs';
import {applyClarityPreferences} from '../../android-companion/planner-clarity.mjs';
import {mountPlanner} from '../../android-companion/planner.mjs';

const server = new URLSearchParams(location.search).get('server') ?? globalThis.RPM_SYNC_SERVER ?? location.origin;
const client = createClient({server});
const queue = createPlanQueue({client});
const $ = id => document.getElementById(id);
const DRAFT = 'rpm.web.capture.v1';
const SLOW = 30000;
const dismissed = new Set();
let ui = null;
let remark = () => {};

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
    label: sentLabel, commit: async op => queue.commit(op)});
  if (location.hash === '#ideas') ui.goalIdeas();
  else if (location.hash.startsWith('#open=')) try { ui.openView(JSON.parse(decodeURIComponent(location.hash.slice(6)))); } catch {}
  remark = watchRows([$('workspace'), $('sheet')], queue);
}

function noteItem({icon, text, tone, onDismiss}) {
  const item = document.createElement('li');
  item.className = `note ${tone}`;
  const glyph = document.createElement('span');
  glyph.className = 'ms';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  const words = document.createElement('p');
  words.textContent = text;
  item.append(glyph, words);
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

function renderNotes() {
  const notes = queue.problems().map((p, i) => noteItem({icon: 'error', tone: 'problem', text: userMessage(p.message), onDismiss: () => queue.dismissProblem(i)}));
  for (const entry of client.state.outbox.filter(e => e.command.type === 'capture' && !dismissed.has(e.command.id))) {
    const words = `“${entry.command.args.text.trim().slice(0, 80)}”`;
    if (!client.settled(entry)) notes.push(noteItem({icon: 'schedule', tone: 'waiting', text: `Capture ${words} is waiting for your phone.`}));
    else if (entry.status !== 'applied') notes.push(noteItem({icon: 'error', tone: 'problem', text: userMessage(entry.message || 'Your phone did not save this capture.'),
      onDismiss: () => { dismissed.add(entry.command.id); render(); }}));
  }
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
  $('menu-unlink').hidden = s.token === 'site';
  mount();
  const waiting = unsettled();
  $('sync-line').textContent = [s.snapshot ? savedLabel(s.snapshot.savedAt) : 'Connecting', waiting.length ? `${plural(waiting.length, 'change')} waiting for your phone` : null].filter(Boolean).join(' · ');
  const slow = waiting.some(e => Date.now() - Date.parse(e.command.createdAt) > SLOW);
  const banner = s.offline ?? (s.phoneMissing && !s.snapshot ? 'Your phone has not sent its planner yet. Open RPM on the phone with Cloud connected.'
    : slow ? 'Your phone has not picked up these changes yet. It does when RPM is open, or about every 15 minutes in the background.' : null);
  $('banner').hidden = !banner;
  $('banner').textContent = banner ?? '';
  renderNotes();
  remark();
}

function openCapture() {
  const sheet = $('capture-sheet');
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

$('app-menu').addEventListener('click', async event => {
  const item = event.target.closest('[data-menu]');
  if (!item) return;
  $('app-menu').hidePopover();
  if (item.dataset.menu === 'refresh') await client.tick();
  if (item.dataset.menu === 'unlink') { await client.unlink(); $('link-problem').hidden = true; }
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
