import {createClient, problemText} from './client.mjs';
import {plannerView, commandFor, savedLabel} from './view.mjs';

const server = new URLSearchParams(location.search).get('server') ?? globalThis.RPM_SYNC_SERVER ?? location.origin;
const client = createClient({server});
const $ = id => document.getElementById(id);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
let view = null, sheetTask = null, lastSnack = null, dismissed = new Set();

const PENDING_TEXT = {complete: 'Completing', uncomplete: 'Reopening', reschedule: 'Rescheduling', 'move-to-block': 'Moving', archive: 'Moving to Trash', restore: 'Restoring', edit: 'Saving'};
const unsettled = () => client.state.outbox.filter(e => !client.settled(e));
const pendingFor = id => unsettled().find(e => e.command.args.taskId === id);
const problemFor = id => client.state.outbox.find(e => e.command.args.taskId === id && ['rejected', 'conflict'].includes(e.status) && !dismissed.has(e.command.id));

function taskRow(task, {showResult = true} = {}) {
  const pending = pendingFor(task.id), problem = problemFor(task.id);
  const meta = pending ? `<span class="waiting"><span class="ms spin" aria-hidden="true">sync</span>${PENDING_TEXT[pending.command.type] ?? 'Sending'} · waiting for phone</span>` : esc(task.meta);
  return `<li class="task${task.done ? ' done' : ''}${task.overdue ? ' overdue' : ''}${pending ? ' pending' : ''}" data-task="${task.id}">
    <button class="check" type="button" data-act="${task.done ? 'uncomplete' : 'complete'}" ${pending ? 'disabled' : ''} aria-label="${task.done ? 'Reopen' : 'Complete'}: ${esc(task.title)}">
      <span class="ms${task.done ? ' fill' : ''}" aria-hidden="true">${task.done ? 'check_circle' : 'radio_button_unchecked'}</span></button>
    <button class="task-open" type="button" data-act="open" aria-label="Change ${esc(task.title)}">
      <span class="task-title">${esc(task.title)}</span>
      ${meta ? `<span class="task-meta tnum">${meta}</span>` : ''}
      ${showResult && task.result ? `<span class="task-result">${esc(task.result.title)}</span>` : ''}
      ${problem ? `<span class="task-problem" role="alert">${esc(problem.message)}</span>` : ''}
    </button>
    ${task.must ? '<span class="ms fill must" role="img" aria-label="Must">star</span>' : ''}
  </li>`;
}
const list = (title, rows, empty, opts) => `<section class="group"><h2 class="group-title">${title}${rows.length ? ` <span class="count tnum">${rows.length}</span>` : ''}</h2>
  ${rows.length ? `<ul class="tasks">${rows.map(r => taskRow(r, opts)).join('')}</ul>` : `<p class="empty">${empty}</p>`}</section>`;

function renderPlanner() {
  const snapshot = client.state.snapshot;
  if (!snapshot) {
    $('today-title').textContent = new Date().toLocaleDateString('en-US', {weekday: 'long', day: 'numeric', month: 'long'});
    $('today-lists').innerHTML = `<p class="empty">${client.state.phoneMissing ? 'Your phone has not sent its planner yet. Open RPM on the phone with Cloud connected.' : 'Loading your planner.'}</p>`;
    return;
  }
  view = plannerView(snapshot);
  $('today-title').textContent = view.dateLabel;
  const waterPending = unsettled().some(e => e.command.type === 'log-water');
  $('habits').innerHTML = `<div class="habit">
      <span class="ms" aria-hidden="true">water_full</span>
      <span class="habit-text"><span class="habit-name">Water</span><span class="tnum">${view.water.glasses} of ${view.water.goal} glasses${waterPending ? ' · waiting for phone' : ''}</span></span>
      <button class="btn tonal" type="button" data-act="water" ${waterPending ? 'disabled' : ''}><span class="ms" aria-hidden="true">add</span>Glass</button>
    </div>`;
  $('today-lists').innerHTML = list('Today', view.agenda, 'Nothing planned for today.')
    + list('Next 7 days', view.upcoming, 'Nothing planned this week.')
    + list('Inbox', view.inbox, 'Inbox is clear.')
    + (view.doneToday.length ? `<details class="group done-group"><summary class="group-title">Completed today <span class="count tnum">${view.doneToday.length}</span></summary><ul class="tasks">${view.doneToday.map(r => taskRow(r)).join('')}</ul></details>` : '');
  const sentCaptures = client.state.outbox.filter(e => e.command.type === 'capture' && !dismissed.has(e.command.id) && !client.settled(e));
  $('captures').innerHTML = sentCaptures.map(e => `<p class="capture-sent"><span class="ms spin" aria-hidden="true">sync</span><span>“${esc(e.command.args.text.trim())}” · ${e.status === 'sending' ? 'sending' : 'waiting for phone'}</span></p>`).join('');
  $('results').innerHTML = view.results.map(r => `<article class="result-card">
      ${r.project ? `<p class="result-project">${esc(r.project)}</p>` : ''}
      <h2 class="result-title">${esc(r.title)}</h2>
      ${r.purpose ? `<p class="result-purpose">${esc(r.purpose)}</p>` : ''}
      <p class="result-facts tnum">${r.done} of ${r.total} done${r.mustsLeft ? ` · <span class="ms fill must" role="img" aria-label="Musts">star</span> ${r.mustsLeft} left` : ''}</p>
      ${r.plan.length ? `<ul class="tasks">${r.plan.map(t => taskRow(t, {showResult: false})).join('')}</ul>` : '<p class="empty">Every task is done. Only you decide if the Result is achieved.</p>'}
    </article>`).join('');
}

function renderStatus() {
  const s = client.state, waiting = unsettled();
  const parts = [s.snapshot ? savedLabel(s.snapshot.savedAt, new Date()) : 'Connecting'];
  if (waiting.length) parts.push(`${waiting.length} waiting for phone`);
  $('sync-line').textContent = parts.join(' · ');
  const old = waiting.filter(e => Date.now() - Date.parse(e.command.createdAt) > 30000);
  const banner = s.offline ?? (old.length ? 'Your phone has not picked up these changes yet. It does when RPM is open, or about every 15 minutes in the background.' : null);
  $('banner').hidden = !banner; $('banner').textContent = banner ?? '';
}

function snack(text, undoId) {
  const bar = $('snackbar'); lastSnack = undoId ?? null;
  $('snackbar-text').textContent = text; $('snackbar-action').hidden = !undoId; bar.hidden = false;
  clearTimeout(snack.timer); snack.timer = setTimeout(() => { bar.hidden = true; }, undoId ? 6000 : 4000);
}
const announced = new Set();
function announce() {
  for (const e of client.state.outbox) {
    if (announced.has(e.command.id) || !client.settled(e)) continue;
    announced.add(e.command.id);
    if (e.status === 'applied') snack(e.command.type === 'undo' ? 'Undone on the phone' : e.command.type === 'capture' ? 'Capture saved on the phone' : 'Saved on the phone', ['undo', 'capture'].includes(e.command.type) ? null : e.command.id);
    else if (!e.command.args.taskId) snack(e.message);
  }
}

function render() {
  const linked = !!client.state.token && !client.state.unlinked;
  $('link-view').hidden = linked; $('planner-view').hidden = !linked;
  if (!linked) {
    if (client.state.unlinked) { $('link-problem').hidden = false; $('link-problem').textContent = 'This browser was unlinked. Make a new code on the phone to link it again.'; }
    return;
  }
  renderStatus(); renderPlanner(); announce();
  if (sheetTask && $('task-sheet').open) fillSheet();
}

const send = (command) => client.send(command).then(render);
const findTask = id => [view.agenda, view.upcoming, view.inbox, view.doneToday, ...view.results.map(r => r.plan)].flat().find(t => t.id === id);

function fillSheet() {
  const task = findTask(sheetTask) ?? null;
  if (!task) { $('task-sheet').close(); return; }
  $('sheet-title').textContent = task.title;
  $('sheet-result').innerHTML = task.result ? `<span class="ms" aria-hidden="true">target</span><span><span class="sheet-result-title">${esc(task.result.title)}</span>${task.result.purpose ? `<span class="sheet-purpose">${esc(task.result.purpose)}</span>` : ''}</span>` : '<span class="ms" aria-hidden="true">inbox</span><span>No block</span>';
  const pending = pendingFor(task.id);
  $('sheet-when').textContent = pending ? 'Waiting for the phone to save the last change.' : task.meta || 'No date';
  $('sheet-block').innerHTML = `<option value="">No block (Inbox)</option>` + view.resultChoices.map(b => `<option value="${esc(b.id)}" ${b.id === task.blockId ? 'selected' : ''}>${esc(b.title)}</option>`).join('');
  for (const el of $('task-sheet').querySelectorAll('button[value]:not([value=close]), select')) el.disabled = !!pending;
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-act]');
  if (!target || !client.state.snapshot) return;
  const act = target.dataset.act;
  if (act === 'water') { send({id: crypto.randomUUID(), type: 'log-water', args: {at: new Date().toISOString()}, baseRevision: client.state.snapshot.revision, createdAt: new Date().toISOString()}); return; }
  const id = +target.closest('[data-task]').dataset.task, task = findTask(id);
  if (act === 'open') { sheetTask = id; fillSheet(); $('task-sheet').showModal(); return; }
  dismissed.add(problemFor(id)?.command.id);
  send(commandFor(act, task, client.state.snapshot));
});

$('task-sheet').addEventListener('close', () => {
  const value = $('task-sheet').returnValue, task = findTask(sheetTask);
  $('task-sheet').returnValue = '';
  if (task && value && value !== 'close') send(commandFor(value, task, client.state.snapshot));
});
$('sheet-block').addEventListener('change', event => {
  const task = findTask(sheetTask);
  send({id: crypto.randomUUID(), type: 'move-to-block', args: {taskId: task.id, blockId: event.target.value || null}, baseRevision: client.state.snapshot.revision, createdAt: new Date().toISOString()});
  $('task-sheet').close();
});

$('capture-form').addEventListener('submit', event => {
  event.preventDefault();
  const field = $('capture-text'), text = field.value;
  if (!text.trim() || !client.state.snapshot) return;
  field.value = '';
  send({id: crypto.randomUUID(), type: 'capture', args: {text}, baseRevision: client.state.snapshot.revision, createdAt: new Date().toISOString()});
});
$('capture-text').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('capture-form').requestSubmit(); }
});

$('snackbar-action').addEventListener('click', () => {
  if (!lastSnack) return;
  $('snackbar').hidden = true;
  send({id: crypto.randomUUID(), type: 'undo', args: {commandId: lastSnack}, baseRevision: client.state.snapshot.revision, createdAt: new Date().toISOString()});
});

for (const tab of document.querySelectorAll('.nav-item')) tab.addEventListener('click', () => {
  $('panes').dataset.tab = tab.dataset.tab;
  document.querySelectorAll('.nav-item').forEach(t => t.toggleAttribute('aria-current', t === tab));
  document.querySelectorAll('.nav-item[aria-current]').forEach(t => t.setAttribute('aria-current', 'page'));
  scrollTo({top: 0});
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
  const code = $('link-code').value.trim(), problem = $('link-problem');
  if (!/^[A-Za-z2-9]{8}$/.test(code)) { problem.hidden = false; problem.textContent = 'Type all eight letters and numbers from your phone.'; return; }
  problem.hidden = true;
  const button = event.target.querySelector('button[type=submit]'); button.disabled = true;
  try { await client.link(code, `${navigator.userAgentData?.platform ?? 'Browser'} web`); $('link-code').value = ''; }
  catch (error) { problem.hidden = false; problem.textContent = problemText(error); }
  finally { button.disabled = false; render(); }
});

client.subscribe(render);
render();
let busy = false;
const loop = async () => {
  if (busy || document.hidden || !client.state.token) return;
  busy = true;
  try { await client.tick(); } finally { busy = false; }
};
loop();
setInterval(loop, 3000);
document.addEventListener('visibilitychange', loop);
