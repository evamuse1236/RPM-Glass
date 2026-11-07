/** The Wheel of Life: one wedge per Area, an empty track (a neutral rim and faint scale marks in the Area's hue) filled from
 * the centre to rating/10 in a light tone of the hue, its outer arc and thumb in the full hue. Each wedge is a slider pulled outward, with the same thumb as the Area page's slider: a
 * capsule across the wedge on the fill's edge, solid once rated. Unrated, there is no fill: a faint groove runs out
 * along the wedge's middle to the rim and a hollow thumb waits at its inner end, so it reads as a slider not yet moved. Dragging a wedge sets that Area's rating in whole points, saved on release
 * with Undo. "Rate your Areas" stays the keyboard and screen-reader route. The Area list under the card (life.mjs) opens
 * each Area. */
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

/** An arc across wedge `i` at `radius`, stopping `gap` units short of each seam, so neighbouring wedges never share a
 * line: the seams stay one clean gap in the card's colour. */
export function arcPath(i, n, radius, gap = 1, {centre: c} = WHEEL) {
  const p = a => `${(c + radius * Math.cos(a)).toFixed(2)} ${(c + radius * Math.sin(a)).toFixed(2)}`;
  if (n === 1) return `M${p(-Math.PI / 2)} A${radius} ${radius} 0 1 1 ${p(Math.PI / 2)} A${radius} ${radius} 0 1 1 ${p(-Math.PI / 2)}`;
  const inset = Math.asin(Math.min(1, gap / radius));
  const a0 = -Math.PI / 2 + i * TAU / n + inset, a1 = -Math.PI / 2 + (i + 1) * TAU / n - inset;
  return `M${p(a0)} A${radius} ${radius} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

/** A wedge's scale, split at its fill's edge: the marks still ahead show faintly as the way to drag, and the marks the
 * fill has passed cut across it. The rim (10) is drawn on its own and never cuts. */
export function scalePaths(i, n, rating) {
  const edge = radiusFor(rating);
  const ahead = [], cuts = [];
  for (const k of RINGS.slice(0, -1)) {
    const r = radiusFor(k);
    if (r > edge + 1) ahead.push(arcPath(i, n, r));
    else if (r < edge - 1) cuts.push(arcPath(i, n, r));
  }
  return {ahead: ahead.join(' '), cuts: cuts.join(' ')};
}

/** A wedge's handle: a short arc across its middle at `radius`, never wider than half the wedge. */
export function handlePath(i, n, radius, length = 14, {centre: c} = WHEEL) {
  const mid = -Math.PI / 2 + (i + 0.5) * TAU / n;
  const half = Math.min(length / radius, TAU / n * 0.5) / 2;
  const p = a => `${(c + radius * Math.cos(a)).toFixed(2)} ${(c + radius * Math.sin(a)).toFixed(2)}`;
  return `M${p(mid - half)} A${radius} ${radius} 0 0 1 ${p(mid + half)}`;
}

/** Where an unrated wedge's hollow thumb waits, short of the first mark: a place to pull from, not a value. */
export const REST = radiusFor(1.5);

/** An unrated wedge's groove: a faint line along its middle from the waiting thumb out to the rim, the whole way to
 * drag, so it implies no limit short of 10. */
export const GROOVE_END = WHEEL.outer;
export function groovePath(i, n, {centre: c} = WHEEL) {
  const mid = -Math.PI / 2 + (i + 0.5) * TAU / n;
  const p = r => `${(c + r * Math.cos(mid)).toFixed(2)} ${(c + r * Math.sin(mid)).toFixed(2)}`;
  return `M${p(REST)} L${p(GROOVE_END)}`;
}

/** A rated wedge's edge: the fill's outer arc in the Area's full hue, the track's active end, as a slider's active track
 * meets its thumb. Nothing at 0 or unrated. */
export const edgePath = (i, n, rating) => (rating > 0 ? arcPath(i, n, radiusFor(rating), 1.5) : '');

/** The thumb sits on the fill's edge, like a slider's on its track: at rest while unrated, clear of the hub at 0. */
export const handleD = (i, n, rating) => handlePath(i, n, rating == null ? REST : Math.max(WHEEL.inner + 4, radiusFor(rating)));

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
  // Each wedge in its Area's hue: the rim and faint scale marks as an empty track, the groove while unrated, the fill
  // only for a rating, the marks it has passed cut across it, and its thumb.
  const wedges = areas.map((area, i) => {
    const g = node('g', {class: 'wheel-wedge-group', 'data-tone': app.tone(area)});
    const {ahead, cuts} = scalePaths(i, n, area.rating);
    const parts = {
      group: g,
      ahead: node('path', {d: ahead, class: 'wheel-scale'}),
      value: node('path', {d: wedgePath(i, n, radiusFor(area.rating)), class: 'wheel-wedge'}),
      cuts: node('path', {d: cuts, class: 'wheel-cut'}),
      edge: node('path', {d: edgePath(i, n, area.rating), class: 'wheel-edge'}),
      handle: node('g', {class: 'wheel-handle'}),
    };
    const d = handleD(i, n, area.rating);
    parts.handle.append(...['halo', 'bar', 'core'].map(part => node('path', {d, class: `wheel-handle-${part}`})));
    g.classList.toggle('unrated', area.rating == null);
    g.append(node('path', {d: arcPath(i, n, WHEEL.outer), class: 'wheel-rim'}), node('path', {d: groovePath(i, n), class: 'wheel-groove'}), parts.ahead, parts.value, parts.cuts, parts.edge, parts.handle);
    svg.append(g);
    return parts;
  });
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
  bindDrag(app, areas, svg, {wedges, labels, average});
  return box;
}

function bindDrag(app, areas, svg, {wedges, labels, average}) {
  const n = areas.length;
  let drag = null;
  const read = event => {
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WHEEL.size - WHEEL.centre;
    const y = (event.clientY - rect.top) / rect.height * WHEEL.size - WHEEL.centre;
    return {x, y, distance: Math.hypot(x, y)};
  };
  const show = (i, rating) => {
    const {group, ahead, value, cuts, edge, handle} = wedges[i];
    const scale = scalePaths(i, n, rating);
    ahead.setAttribute('d', scale.ahead);
    cuts.setAttribute('d', scale.cuts);
    value.setAttribute('d', wedgePath(i, n, radiusFor(rating)));
    edge.setAttribute('d', edgePath(i, n, rating));
    const d = handleD(i, n, rating);
    for (const path of handle.children) path.setAttribute('d', d);
    group.classList.toggle('unrated', rating == null);
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
  // The header keeps its link in every state; until the first rating one quiet line under the wheel says how it works.
  if (areas.length && areas.every(a => a.rating == null)) card.append(el('p', 'wheel-hint', 'Drag a wedge outward to rate'));
  return card;
}
