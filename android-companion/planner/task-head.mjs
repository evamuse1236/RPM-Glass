/**
 * The task sheet's header row: the task's icon pill, the title, the Must star and the completion ring. The row swipes right to complete:
 * it follows the finger, the ring fills at 60% of the way, and letting go past 96px completes.
 */
import {reducedMotion} from '../surface-motion.mjs';
import {lockAxis} from '../task-swipe.mjs';
import {taskSymbol} from '../task-symbol.mjs';
import {el, icon, button} from './dom.mjs';
import {syncText} from './sheet-parts.mjs';

export const COMPLETE_SWIPE = 96;
const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

function ringIcon(ring, done) {
  const symbol = done ? 'check_circle' : 'radio_button_unchecked';
  const glyph = ring.firstElementChild;
  if (glyph.textContent !== symbol) glyph.textContent = symbol;
  glyph.classList.toggle('fill', done);
}

/** `onToggle()` ticks or reopens; `onMust(on)` and `onTitle(words)` save. Returns {row, title, paint(task), showDone()}. */
export function taskHead({task, onToggle, onMust, onTitle, onEnter, tips = false}) {
  const row = el('div', 'task-head');
  const ring = button('', () => onToggle(), 'icon-btn task-ring');
  ring.setAttribute('role', 'checkbox');
  ring.append(icon('radio_button_unchecked'));

  const title = el('textarea', 'task-title-field');
  title.rows = 1;
  title.value = task.title;
  title.maxLength = 200;
  title.setAttribute('aria-label', 'Task title');
  title.enterKeyHint = 'next';
  const grow = () => {
    title.style.height = 'auto';
    title.style.height = title.scrollHeight + 'px';
  };
  title.grow = grow;
  title.addEventListener('input', grow);
  let caretPlaced = false;
  title.addEventListener('mousedown', event => {
    if (caretPlaced || event.button > 0 || document.activeElement === title) return;
    caretPlaced = true;
    event.preventDefault();
    title.focus({preventScroll: true});
    title.setSelectionRange(title.value.length, title.value.length);
  });
  title.addEventListener('focus', () => { caretPlaced = true; });
  title.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onEnter();
  });
  title.addEventListener('change', () => {
    const words = title.value.trim();
    if (!words) title.value = task.title;
    else onTitle(words);
  });

  const must = button('', () => onMust(must.getAttribute('aria-checked') !== 'true'), 'icon-btn must-star');
  must.setAttribute('role', 'switch');
  must.setAttribute('aria-label', 'Must');
  if (tips) must.title = 'Must';
  must.append(icon('star'));
  const pill = el('span', 'task-pill');
  pill.append(icon(taskSymbol(task.title), {fill: true}));
  row.append(pill, title, must, ring);
  installSwipe(row, ring, title, onToggle);

  const paint = t => {
    task = t;
    syncText(title, t.title);
    const symbol = taskSymbol(t.title);
    if (pill.firstElementChild.textContent !== symbol) pill.firstElementChild.textContent = symbol;
    ring.setAttribute('aria-checked', String(!!t.done));
    ring.setAttribute('aria-label', `Mark ${t.title} ${t.done ? 'incomplete' : 'complete'}`);
    if (tips) ring.title = t.done ? 'Mark incomplete' : 'Mark complete';
    ringIcon(ring, !!t.done);
    row.classList.toggle('is-done', !!t.done);
    must.setAttribute('aria-checked', String(!!t.must));
    must.firstElementChild.classList.toggle('fill', !!t.must);
  };
  /** The tick shows at once: the ring fills and pops, the title strikes through. */
  const showDone = () => {
    ringIcon(ring, true);
    row.classList.add('is-done');
    ring.setAttribute('aria-checked', 'true');
    if (!reducedMotion()) ring.firstElementChild.animate([{scale: 1}, {scale: 1.2}, {scale: 1}], {duration: 150, easing: SPRING});
  };
  requestAnimationFrame(grow);
  return {row, title, paint, showDone, setMust: on => {
    must.setAttribute('aria-checked', String(on));
    must.firstElementChild.classList.toggle('fill', on);
  }};
}

function installSwipe(row, ring, title, onToggle) {
  let start = null;
  const offset = px => row.style.setProperty('--swipe-x', px + 'px');
  const settle = () => {
    row.classList.remove('swiping');
    row.classList.add('swipe-settling');
    offset(0);
    delete row.dataset.armed;
    setTimeout(() => row.classList.remove('swipe-settling'), reducedMotion() ? 0 : 200);
  };
  row.addEventListener('pointerdown', event => {
    if (event.button > 0 || event.isPrimary === false || event.target.closest('button')
      || document.activeElement === title || row.classList.contains('is-done')) return;
    start = {x: event.clientX, y: event.clientY, id: event.pointerId, axis: null};
  });
  row.addEventListener('pointermove', event => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.axis) {
      start.axis = lockAxis(dx, dy);
      if (!start.axis) return;
      if (start.axis === 'y' || dx < 0) { start = null; return; }
      try { row.setPointerCapture(event.pointerId); } catch {}
      row.classList.add('swiping');
    }
    const x = Math.max(0, dx);
    offset(x);
    const armed = x >= COMPLETE_SWIPE * 0.6;
    if (armed !== (row.dataset.armed === 'true')) {
      row.dataset.armed = String(armed);
      ringIcon(ring, armed);
    }
  });
  const release = event => {
    if (!start || event.pointerId !== start.id) return;
    const swiped = start.axis === 'x';
    const dx = event.clientX - start.x;
    start = null;
    if (!swiped) return;
    const eat = click => { click.preventDefault(); click.stopPropagation(); };
    row.addEventListener('click', eat, {capture: true, once: true});
    setTimeout(() => row.removeEventListener('click', eat, {capture: true}));
    const done = event.type === 'pointerup' && dx >= COMPLETE_SWIPE;
    settle();
    if (done) onToggle();
    else ringIcon(ring, false);
  };
  row.addEventListener('pointerup', release);
  row.addEventListener('pointercancel', release);
}
