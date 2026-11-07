/** The Wheel of Life: one wedge per Area on an empty outlined track, filled from the centre to rating/10 in its tone.
 * Each wedge has one handle, parked at the hub until rated and at the fill's edge after; dragging a wedge moves it and
 * sets that Area's rating in whole points, saved on release with Undo. "Rate your Areas" stays the keyboard and
 * screen-reader route. The Area list under the card (life.mjs) opens each Area. */
import {el, attrs, button} from './dom.mjs';
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

/** An empty track: the wedge's full shape drawn `gap` units in from every edge, so neighbours never share an outline. */
export function trackPath(i, n, gap = 1.5, {centre: c, inner, outer} = WHEEL) {
  const p = (r, a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  const r0 = inner + gap, r1 = outer - gap;
  if (n === 1) {
    const ring = r => `M${c + r} ${c} A${r} ${r} 0 1 1 ${c - r} ${c} A${r} ${r} 0 1 1 ${c + r} ${c}Z`;
    return ring(r1) + ' ' + ring(r0);
  }
  const a0 = -Math.PI / 2 + i * TAU / n, a1 = a0 + TAU / n, large = a1 - a0 > Math.PI ? 1 : 0;
  const from = r => a0 + Math.asin(gap / r), to = r => a1 - Math.asin(gap / r);
  return `M${p(r0, from(r0))} L${p(r1, from(r1))} A${r1} ${r1} 0 ${large} 1 ${p(r1, to(r1))} `
    + `L${p(r0, to(r0))} A${r0} ${r0} 0 ${large} 0 ${p(r0, from(r0))}Z`;
}

/** A wedge's handle: a short arc across its middle at `radius`, never wider than half the wedge. */
export function handlePath(i, n, radius, length = 14, {centre: c} = WHEEL) {
  const mid = -Math.PI / 2 + (i + 0.5) * TAU / n;
  const half = Math.min(length / radius, TAU / n * 0.5) / 2;
  const p = a => `${(c + radius * Math.cos(a)).toFixed(2)} ${(c + radius * Math.sin(a)).toFixed(2)}`;
  return `M${p(mid - half)} A${radius} ${radius} 0 0 1 ${p(mid + half)}`;
}

/** Where the handle sits: just past the hub while unrated, on the fill's edge once rated. */
export const handleRadius = rating => (rating == null ? WHEEL.inner + 6 : Math.max(WHEEL.inner + 6, radiusFor(rating) - 3));

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
    svg.append(node('path', {d: trackPath(i, n), class: 'wheel-track'}));
    return node('path', {d: wedgePath(i, n, radiusFor(area.rating)), class: 'wheel-wedge', 'data-tone': app.tone(area)});
  });
  // The scale shows only as cuts across filled wedges, so an empty track never looks rated.
  const rings = RINGS.map(k => node('circle', {cx: WHEEL.centre, cy: WHEEL.centre, r: radiusFor(k), class: 'wheel-ring'}));
  const handles = areas.map((area, i) => {
    const handle = node('g', {class: 'wheel-handle', 'data-tone': app.tone(area)});
    const d = handlePath(i, n, handleRadius(area.rating));
    handle.append(node('path', {d, class: 'wheel-handle-halo'}), node('path', {d, class: 'wheel-handle-bar'}));
    handle.classList.toggle('unrated', area.rating == null);
    return handle;
  });
  svg.append(...values, ...rings, ...handles);
  const average = el('span', 'wheel-average tnum', averageOf(areas.map(a => a.rating)) ?? '');
  average.setAttribute('aria-hidden', 'true');
  const labels = areas.map((area, i) => {
    const label = el('span', 'wheel-label');
    label.setAttribute('aria-hidden', 'true');
    const angle = -Math.PI / 2 + (i + 0.5) * TAU / n;
    label.style.setProperty('--x', Math.cos(angle).toFixed(3));
    label.style.setProperty('--y', Math.sin(angle).toFixed(3));
    if (Math.abs(Math.sin(angle)) > 0.9) box.dataset[Math.sin(angle) < 0 ? 'labelTop' : 'labelBottom'] = '';
    label.append(el('span', '', area.title), el('b', 'tnum', area.rating == null ? '' : String(area.rating)));
    return label;
  });
  box.append(svg, average, ...labels);
  bindDrag(app, areas, svg, {values, handles, labels, average});
  return box;
}

function bindDrag(app, areas, svg, {values, handles, labels, average}) {
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
    const d = handlePath(i, n, handleRadius(rating));
    for (const path of handles[i].children) path.setAttribute('d', d);
    handles[i].classList.toggle('unrated', rating == null);
    labels[i].lastChild.textContent = rating == null ? '' : String(rating);
    average.textContent = averageOf(areas.map((a, j) => (j === i ? rating : a.rating))) ?? '';
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

export function wheelCard(app, areas, rateAreas) {
  const card = el('section', 'wheel-card');
  const copy = el('div', 'wheel-copy');
  copy.append(el('h2', '', 'Wheel of Life'), button('Rate your Areas', () => rateAreas(app), 'text-btn'));
  card.append(copy, plot(app, areas));
  return card;
}
