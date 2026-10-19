/** Drag a task (mouse or pen) onto a day, a Block or the Inbox: one command per drop. Touch keeps scrolling. */
const THRESHOLD = 8;

export function dropCommand(target, task) {
  const [kind, value] = target.split(/:(.*)/s);
  if (kind === 'block') return task.blockId === value ? null : {type: 'move-to-block', args: {taskId: task.id, blockId: value}, label: 'Moved to Block'};
  if (kind === 'inbox') return task.blockId == null ? null : {type: 'move-to-block', args: {taskId: task.id, blockId: null}, label: 'Moved to Inbox'};
  if (kind === 'day') {
    if (task.planned) {
      const at = new Date(task.planned), next = new Date(value + 'T00:00');
      next.setHours(at.getHours(), at.getMinutes(), 0, 0);
      if (+next === +at) return null;
      return {type: 'reschedule', args: {taskId: task.id, time: next.toISOString(), day: null}, label: 'Moved'};
    }
    if (task.plannedDate === value) return null;
    return {type: 'reschedule', args: {taskId: task.id, time: null, day: value}, label: 'Moved'};
  }
  return null;
}

export function enableDrag(root, getCtx) {
  let drag = null;

  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]') ?? null;

  function start(e, source) {
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.inlineSize = rect.width + 'px';
    ghost.removeAttribute('data-drag-task');
    document.body.append(ghost);
    source.classList.add('dragging-source');
    document.body.classList.add('dragging');
    drag.ghost = ghost;
    drag.offset = {x: e.clientX - rect.left, y: e.clientY - rect.top};
  }

  function move(e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < THRESHOLD) return;
      start(e, drag.source);
    }
    drag.ghost.style.translate = `${e.clientX - drag.offset.x}px ${e.clientY - drag.offset.y}px`;
    const target = targetAt(e.clientX, e.clientY);
    if (target !== drag.target) {
      drag.target?.classList.remove('drop-target');
      drag.target = target;
      target?.classList.add('drop-target');
    }
  }

  function end(e) {
    if (!drag) return;
    const {ghost, target, taskId, source} = drag;
    drag = null;
    window.removeEventListener('pointermove', move);
    if (!ghost) return;
    e.preventDefault();
    ghost.remove();
    source.classList.remove('dragging-source');
    document.body.classList.remove('dragging');
    target?.classList.remove('drop-target');
    root.addEventListener('click', swallow, {capture: true, once: true});
    setTimeout(() => root.removeEventListener('click', swallow, {capture: true}), 0);
    const ctx = getCtx(), task = ctx.snap?.tasks.find(t => t.id === taskId);
    const command = target && task ? dropCommand(target.dataset.drop, task) : null;
    if (command) ctx.control.act(command.type, command.args, command.label);
  }

  const swallow = e => { e.stopPropagation(); e.preventDefault(); };

  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const source = e.target.closest('[data-drag-task]');
    if (!source || e.target.closest('.task-check, input, textarea, select, a')) return;
    drag = {source, taskId: Number(source.dataset.dragTask), x: e.clientX, y: e.clientY, ghost: null, target: null};
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, {once: true});
    window.addEventListener('pointercancel', end, {once: true});
  });
}
