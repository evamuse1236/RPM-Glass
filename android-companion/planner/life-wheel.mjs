/** The Wheel of Life (prototype round4 l1): one wedge per Area in its tone, filled from the centre to rating/10. Dragging a
 * wedge sets that Area's rating in whole points and saves it on release with Undo; "Rate your Areas" stays the
 * keyboard and screen-reader route. Area chips under the wheel open each Area. */
import {el, attrs, button, labelButton} from './dom.mjs';
import {plural} from './format.mjs';
import {persist} from './inline-edit.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
export const WHEEL = Object.freeze({size: 240, centre: 120, inner: 24, outer: 112});
export const RINGS = [2, 4, 6, 8, 10];

/** A distance from the centre (viewBox units) as a whole rating: the hub is 0, the rim 10. */
export function ratingAt(distance, {inner, outer} = WHEEL) {
  return Math.max(0, Math.min(10, Math.round((distance - inner) / (outer - inner) * 10)));
}

/** Which of `n` wedges (clockwise from twelve o'clock) holds the point (x, y) from the centre. */
export function wedgeAt(x, y, n) {
  let angle = Math.atan2(y, x) + Math.PI / 2;
  if (angle < 0) angle += TAU;
  return Math.floor(angle / (TAU / n)) % n;
}

export const radiusFor = (rating, {inner, outer} = WHEEL) => inner + (outer - inner) * Math.max(0, rating ?? 0) / 10;

export function wedgePath(i, n, radius, {centre: c, inner} = WHEEL) {
  const p = (r, a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  if (radius <= inner) return '';
  if (n === 1) {
    const ring = r => `M${c + r} ${c} A${r} ${r} 0 1 1 ${c - r} ${c} A${r} ${r} 0 1 1 ${c + r} ${c}Z`;
    return ring(radius) + ' ' + ring(inner);
  }
  const a0 = -Math.PI / 2 + i * TAU / n, a1 = a0 + TAU / n, large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(inner, a0)} L${p(radius, a0)} A${radius} ${radius} 0 ${large} 1 ${p(radius, a1)} `
    + `L${p(inner, a1)} A${inner} ${inner} 0 ${large} 0 ${p(inner, a0)}Z`;
}

export const averageOf = ratings => {
  const rated = ratings.filter(r => r != null);
  return rated.length ? (rated.reduce((sum, r) => sum + r, 0) / rated.length).toFixed(1) : null;
};

/** Saves one Area's rating with the planner's Undo snackbar ("Health rated 7"); an unchanged rating saves nothing. */
export function saveRating(app, area, rating) {
  if (rating === area.rating) return Promise.resolve(false);
  return persist(app, {type: 'rateAreas', ratings: [{id: area.id, rating}]}, {label: `${area.title} rated ${rating}`});
}

const node = (tag, values) => attrs(document.createElementNS(SVG, tag), values);
const wheelLabel = areas => 'Wheel of Life: ' + areas.map(a => `${a.title} ${a.rating ?? 'not rated'}`).join(', ');

function plot(app, areas) {
  const n = areas.length;
  const box = el('div', 'wheel-plot');
  const svg = node('svg', {viewBox: `0 0 ${WHEEL.size} ${WHEEL.size}`, class: 'wheel-svg', role: 'img', 'aria-label': wheelLabel(areas)});
  const values = areas.map((area, i) => {
    svg.append(node('path', {d: wedgePath(i, n, WHEEL.outer), class: 'wheel-track'}));
    return node('path', {d: wedgePath(i, n, radiusFor(area.rating)), class: 'wheel-wedge', 'data-tone': app.tone(area)});
  });
  svg.append(...values);
  for (const k of RINGS) svg.append(node('circle', {cx: WHEEL.centre, cy: WHEEL.centre, r: radiusFor(k), class: 'wheel-ring'}));
  const average = el('span', 'wheel-average tnum', averageOf(areas.map(a => a.rating)) ?? '–');
  average.setAttribute('aria-hidden', 'true');
  const labels = areas.map((area, i) => {
    const label = el('span', 'wheel-label');
    label.setAttribute('aria-hidden', 'true');
    const angle = -Math.PI / 2 + (i + 0.5) * TAU / n;
    label.style.setProperty('--x', Math.cos(angle).toFixed(3));
    label.style.setProperty('--y', Math.sin(angle).toFixed(3));
    label.append(el('span', '', area.title), el('b', 'tnum', area.rating == null ? '' : String(area.rating)));
    return label;
  });
  box.append(svg, average, ...labels);
  bindDrag(app, areas, svg, values, labels, average);
  return box;
}

function bindDrag(app, areas, svg, values, labels, average) {
  const n = areas.length;
  let drag = null;
  const read = event => {
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WHEEL.size - WHEEL.centre;
    const y = (event.clientY - rect.top) / rect.height * WHEEL.size - WHEEL.centre;
    return {x, y, distance: Math.hypot(x, y)};
  };
  const show = (i, rating) => {
    values[i].setAttribute('d', wedgePath(i, n, radiusFor(rating)));
    labels[i].lastChild.textContent = rating == null ? '' : String(rating);
    average.textContent = averageOf(areas.map((a, j) => (j === i ? rating : a.rating))) ?? '–';
  };
  const set = (event, i) => {
    const rating = ratingAt(read(event).distance);
    if (rating === drag.rating) return;
    drag.rating = rating;
    show(i, rating);
    app.api.native('haptic').catch(() => {});
  };
  svg.addEventListener('pointerdown', event => {
    if (event.button > 0 || drag) return;
    const {x, y, distance} = read(event);
    if (distance < WHEEL.inner * 0.75 || distance > WHEEL.outer + 16) return;
    const i = wedgeAt(x, y, n);
    drag = {i, id: event.pointerId, rating: areas[i].rating};
    try { svg.setPointerCapture(event.pointerId); } catch {}
    svg.classList.add('dragging');
    set(event, i);
  });
  svg.addEventListener('pointermove', event => { if (drag && event.pointerId === drag.id) set(event, drag.i); });
  const end = save => event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {i, rating} = drag;
    drag = null;
    svg.classList.remove('dragging');
    if (!save) return show(i, areas[i].rating);
    saveRating(app, areas[i], rating).catch(() => show(i, areas[i].rating));
  };
  svg.addEventListener('pointerup', end(true));
  svg.addEventListener('pointercancel', end(false));
}

function areaChips(app, areas) {
  const row = el('div', 'chip-row wrap wheel-areas');
  for (const area of areas) {
    const goals = app.p().goals.filter(g => g.areaId === area.id && g.year === app.state.year).length;
    const chip = button('', () => app.openArea(area.id), 'wheel-area');
    chip.dataset.key = 'wheel-area:' + area.id;
    chip.dataset.tone = app.tone(area);
    const dot = el('span', 'area-dot');
    dot.setAttribute('aria-hidden', 'true');
    chip.append(dot, el('span', 'wheel-area-name', area.title));
    chip.append(el('span', 'wheel-area-goals', plural(goals, 'Goal')));
    chip.setAttribute('aria-label', `${area.title}, rating ${area.rating ?? 'not set'}, ${plural(goals, 'Goal')}. Open Area`);
    row.append(chip);
  }
  return row;
}

export function wheelCard(app, areas, rateAreas) {
  const card = el('section', 'wheel-card');
  const copy = el('div', 'wheel-copy');
  copy.append(el('h2', '', 'Wheel of Life'), el('p', '', 'Drag a wedge out or in to rate it from 0 to 10'));
  card.append(copy, plot(app, areas), areaChips(app, areas),
    labelButton('tune', 'Rate your Areas', () => rateAreas(app), 'tonal-btn'));
  return card;
}
