import {userMessage} from '../../android-companion/user-message.mjs';

export const WAITING_TEXT = 'Saving';
const ROWS = '[data-task-id],[data-block-id],[data-project-id],.spine-row[data-key]';

const rowId = node => node.dataset.taskId ?? node.dataset.blockId ?? node.dataset.projectId ?? node.dataset.key?.match(/^task:(\d+)/)?.[1] ?? null;

function set(node, name, value) {
  if (value == null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
  else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** Each planner row with a change not yet saved says so; a row whose change was refused says why. */
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
