import {userMessage} from '../../android-companion/user-message.mjs';

export const WAITING_TEXT = 'Waiting for your phone';
const ROWS = '[data-task-id],[data-block-id],[data-project-id],.spine-row[data-key]';

const rowId = node => node.dataset.taskId ?? node.dataset.blockId ?? node.dataset.projectId ?? node.dataset.key?.match(/^task:(\d+)/)?.[1] ?? null;

function set(node, name, value) {
  if (value == null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
  else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** Each planner row with a change the phone has not saved says so; a row the phone refused shows the phone's words. */
export function markRows(root, queue) {
  const pending = new Set([...queue.pendingIds()].map(String));
  const problems = queue.problems();
  for (const node of root.querySelectorAll(ROWS)) {
    const id = rowId(node);
    const problem = id == null ? null : problems.find(p => p.ids.some(i => String(i) === id));
    const state = problem ? 'problem' : id != null && pending.has(id) ? 'waiting' : null;
    set(node, 'data-sync', state);
    set(node, 'data-sync-message', problem ? userMessage(problem.message) : state ? WAITING_TEXT : null);
  }
}

/** Keeps the marks on rows the planner redraws. */
export function watchRows(roots, queue) {
  const run = () => roots.forEach(root => markRows(root, queue));
  const observer = new MutationObserver(run);
  for (const root of roots) observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-task-id', 'data-key', 'data-sync']});
  run();
  return run;
}

export function savedLabel(savedAt, now = new Date()) {
  const at = Date.parse(savedAt);
  if (!Number.isFinite(at) || at <= 0) return 'Not saved from your phone yet';
  const minutes = Math.round((+now - at) / 60000);
  if (minutes < 1) return 'Phone saved just now';
  if (minutes < 60) return `Phone saved ${minutes} min ago`;
  const time = new Date(at).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}).toLowerCase();
  const sameDay = new Date(at).toDateString() === now.toDateString();
  return `Phone saved ${sameDay ? '' : `${new Date(at).toLocaleDateString('en-US', {weekday: 'short'})} `}${time}`;
}

export const sentLabel = text => text === 'Saved' ? 'Sent to your phone' : text === 'Change undone' ? 'Undo sent to your phone' : text.replace(/ saved$/, ' sent to your phone');
