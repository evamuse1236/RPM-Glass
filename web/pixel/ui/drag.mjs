import {h} from './dom.mjs';
import {moveArgs, localDay} from '../model/plan.mjs';
import {dayName} from '../../../android-companion/planner/format.mjs';

const LOCK_PX = 8;
const EDGE_PX = 96;

/**
 * Plates drag between Today, the Week's days and the Inbox. A drag starts after 8px; on touch a mostly vertical start
 * is a scroll and is let go. The plate lifts (thicker outline), the target shows a dashed slot, and a drop sends one
 * reschedule. Holding the plate near the top or bottom edge scrolls the map, so the Inbox can reach the Week.
 */
export function enableDrag(ctx, root) {
  let drag = null, quietUntil = 0;
  root.addEventListener('click', event => {
    if (performance.now() < quietUntil) { event.stopPropagation(); event.preventDefault(); }
  }, {capture: true});

  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop-day], [data-drop-inbox]') ?? null;

  function clearSlot() {
    drag?.slot?.remove();
    document.querySelectorAll('[data-drop-hover]').forEach(n => delete n.dataset.dropHover);
  }

  function showSlot(target) {
    clearSlot();
    if (!target) return;
    target.dataset.dropHover = '';
    if (target.matches('.day')) return;
    drag.slot = h('div.plate.drop-slot', {'aria-hidden': 'true'}, 'Drop here');
    target.append(drag.slot);
  }

  function retarget() {
    const target = targetAt(drag.lastX, drag.lastY);
    if (target !== drag.target) { drag.target = target; showSlot(target); }
  }

  function edgeScroll() {
    if (!drag?.started) return;
    const y = drag.lastY, bottom = innerHeight - EDGE_PX;
    const speed = y < EDGE_PX ? (y - EDGE_PX) / 3 : y > bottom ? (y - bottom) / 3 : 0;
    if (speed) { scrollBy(0, speed); retarget(); }
    drag.frame = requestAnimationFrame(edgeScroll);
  }

  root.addEventListener('pointerdown', event => {
    const plate = event.target.closest('.plate[data-drag="task"]');
    if (!plate || event.button !== 0 || event.target.closest('.tick, .plate-tail button')) return;
    drag = {plate, id: Number(plate.dataset.task), x: event.clientX, y: event.clientY, pointer: event.pointerId,
      touch: event.pointerType === 'touch', started: false, ghost: null, slot: null, target: null};
  });

  root.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (!drag.started) {
      if (Math.hypot(dx, dy) < LOCK_PX) return;
      if (drag.touch && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.started = true;
      ctx.dragging = true;
      drag.plate.setPointerCapture(event.pointerId);
      drag.plate.dataset.state = 'lifted';
      const box = drag.plate.getBoundingClientRect();
      drag.ghost = drag.plate.cloneNode(true);
      drag.ghost.classList.add('drag-ghost');
      drag.ghost.style.inlineSize = `${box.width}px`;
      drag.offset = [event.clientX - box.left, event.clientY - box.top];
      document.body.append(drag.ghost);
      drag.frame = requestAnimationFrame(edgeScroll);
    }
    drag.ghost.style.translate = `${event.clientX - drag.offset[0]}px ${event.clientY - drag.offset[1]}px`;
    retarget();
  });

  function finish(event, drop) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const {started, target, id} = drag;
    clearSlot();
    cancelAnimationFrame(drag.frame);
    drag.ghost?.remove();
    drag = null;
    if (!started) return;
    ctx.dragging = false;
    quietUntil = performance.now() + 400;
    const task = ctx.view.snapshot.tasks.find(t => t.id === id);
    if (!drop || !target || !task) return ctx.render();
    const day = target.dataset.dropDay ?? null;
    const args = moveArgs(task, day);
    if (args.time === task.planned && args.day === task.plannedDate) return ctx.render();
    const words = day ? dayName(day, {today: true}) || day : 'no date';
    ctx.act('reschedule', args, `Moved: ${task.title} → ${day === localDay(ctx.now()) ? 'Today' : words}`);
  }
  root.addEventListener('pointerup', event => finish(event, true));
  root.addEventListener('pointercancel', event => finish(event, false));
}
