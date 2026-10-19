/** Keyboard: c Capture, / search, 1-4 views, j/k rows, x complete, s schedule, m move, e edit, u undo, ? help. */
const VIEWS = ['today', 'week', 'blocks', 'inbox'];

export function bindKeys({getCtx, pane, control, sheet, overlays, capture, setCapture, wide, go, lastCommand}) {
  const rows = () => [...pane.querySelectorAll('[data-row]')].filter(el => el.offsetParent !== null);
  const focusedTask = () => {
    const id = Number(document.activeElement?.closest('[data-task-id]')?.dataset.taskId);
    return id ? getCtx().snap?.tasks.find(t => t.id === id) ?? null : null;
  };

  function step(delta) {
    const list = rows();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    const next = list[Math.max(0, Math.min(list.length - 1, at < 0 ? (delta > 0 ? 0 : list.length - 1) : at + delta))];
    next.focus();
    next.scrollIntoView({block: 'nearest'});
  }

  document.addEventListener('keydown', e => {
    const ctx = getCtx();
    if (e.key === 'Escape' && ctx?.captureOpen && !wide.matches && !sheet.openId && !overlays.open) {
      setCapture(false);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || sheet.openId || overlays.open || !ctx) return;
    const task = focusedTask(), anchor = document.activeElement;
    const handled = {
      c: () => {
        if (ctx.captureOpen && wide.matches && document.activeElement !== capture.textarea) return capture.focus();
        setCapture(!ctx.captureOpen);
      },
      '/': () => overlays.search(),
      '?': () => overlays.shortcuts(),
      j: () => step(1),
      k: () => step(-1),
      x: () => task && control.act(task.done ? 'uncomplete' : 'complete', {taskId: task.id}, task.done ? 'Task reopened' : 'Task completed'),
      s: () => task && overlays.scheduleMenu(task, anchor),
      m: () => task && overlays.moveMenu(task, anchor),
      e: () => task && sheet.open(task.id, {focusTitle: true}),
      b: () => task && ctx.notify({text: 'Must changes on your phone for now.'}),
      u: () => {
        const last = lastCommand();
        if (last) control.undo(last.id);
        else ctx.notify({text: 'Nothing to undo'});
      },
    }[e.key] ?? (/^[1-4]$/.test(e.key) ? () => go(VIEWS[Number(e.key) - 1]) : null);
    if (!handled) return;
    e.preventDefault();
    handled();
  });
}
