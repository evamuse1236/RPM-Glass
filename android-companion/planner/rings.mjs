/** Progress rings drawn in SVG attributes (the CSP allows no style attributes): a segment ring, one arc per task, and a
 * Project's nested rings, one per Block from the outside in. Colour comes from the nearest `data-tone`. */
import {attrs} from './dom.mjs';
import {segs} from './habit-meter.mjs';

const SVG = 'http://www.w3.org/2000/svg';
export const MAX_SEGMENTS = 24;
export const MAX_RINGS = 5;
const node = (tag, values) => attrs(document.createElementNS(SVG, tag), values);

/** One arc per task, done ones on; past MAX_SEGMENTS tasks a single arc shows the share done. */
export function ringSegments(done, total) {
  if (!total || total > MAX_SEGMENTS) return [];
  return segs(total, 20, total > 12 ? 1.6 : 3).map((d, i) => ({d, on: i < done}));
}

export function segmentRing(done, total, {cls = '', label = ''} = {}) {
  const svg = node('svg', {class: ['seg-ring', cls].filter(Boolean).join(' '), viewBox: '0 0 48 48'});
  if (label) attrs(svg, {role: 'img', 'aria-label': label});
  else svg.setAttribute('aria-hidden', 'true');
  const arcs = ringSegments(done, total);
  for (const {d, on} of arcs) svg.append(node('path', {d, class: on ? 'seg-on' : 'seg-off'}));
  if (!arcs.length) {
    svg.append(node('circle', {cx: 24, cy: 24, r: 20, class: 'seg-off'}));
    if (total && done) {
      svg.append(node('circle', {cx: 24, cy: 24, r: 20, pathLength: 1, class: 'seg-on seg-arc',
        'stroke-dasharray': `${done / total} 1`, transform: 'rotate(-90 24 24)'}));
    }
  }
  return svg;
}

/** The rings for a Project's Blocks ({done, total} each), outermost first, in a 64 viewBox; at most MAX_RINGS. */
export function nestedRings(blocks) {
  const shown = blocks.slice(0, MAX_RINGS), n = shown.length;
  const step = n > 1 ? Math.min(8, 20 / (n - 1)) : 0;
  const width = n > 1 ? Math.min(6, step - 2) : 6;
  return shown.map(({done, total}, i) => ({r: 28 - i * step, width, fraction: total ? done / total : 0,
    opacity: n > 1 ? 1 - i * 0.5 / (n - 1) : 1}));
}

export function nestRings(blocks, label) {
  const svg = node('svg', {class: 'nest-rings', viewBox: '0 0 64 64', role: 'img', 'aria-label': label});
  for (const {r, width, fraction, opacity} of nestedRings(blocks)) {
    svg.append(node('circle', {cx: 32, cy: 32, r, 'stroke-width': width, class: 'nest-track'}));
    if (fraction) {
      svg.append(node('circle', {cx: 32, cy: 32, r, 'stroke-width': width, 'stroke-opacity': opacity, pathLength: 1,
        'stroke-dasharray': `${fraction} 1`, transform: 'rotate(-90 32 32)', class: 'nest-value'}));
    }
  }
  return svg;
}
