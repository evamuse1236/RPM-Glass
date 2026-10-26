const OPENERS = '.spine-row[data-key], .spine-chip[data-key]';

const OCCURRENCE = /^(\d{4}-\d{2}-\d{2}T.*)?$/;
export const opensTask = (key, id) => id != null && key?.startsWith('task:' + id) === true && OCCURRENCE.test(key.slice(5 + String(id).length));

/** While the task pane is open, the task's card or chip on Today carries `data-open`. */
export function markOpenCard(work, sheet) {
  const run = () => {
    const id = sheet.hidden || sheet.inert ? null : sheet.querySelector('.task-head[data-task]')?.dataset.task ?? null;
    for (const node of work.querySelectorAll(OPENERS)) {
      const target = node.classList.contains('spine-chip') ? node : node.querySelector('.spine-card');
      if (!target) continue;
      const open = opensTask(node.dataset.key, id);
      if (open !== target.hasAttribute('data-open')) target.toggleAttribute('data-open', open);
    }
  };
  const observer = new MutationObserver(run);
  observer.observe(sheet, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert']});
  observer.observe(work, {childList: true, subtree: true});
  run();
  return run;
}
