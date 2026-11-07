/** A Project's nested progress rings, one per Block from the outside in, drawn in SVG attributes (the CSP allows no
 * style attributes). Colour comes from the nearest `data-tone`. */
import {attrs} from './dom.mjs';

const SVG = 'http://www.w3.org/2000/svg';
export const MAX_RINGS = 5;
const node = (tag, values) => attrs(document.createElementNS(SVG, tag), values);

/** The rings for a Project's Blocks ({done, total} each), outermost first, in a 64 viewBox; at most MAX_RINGS. The outer
 * ring is the same 3-unit stroke on every card, so a one-Block ring and a five-Block set weigh the same; inner rings are
 * 2 units, each gap 3, and the centre stays open. */
const OUTER_WIDTH = 3;
const INNER_WIDTH = 2;
const RING_GAP = 3;
export function nestedRings(blocks) {
  const shown = blocks.slice(0, MAX_RINGS), n = shown.length;
  let edge = 32;
  return shown.map(({done, total}, i) => {
    const width = i ? INNER_WIDTH : OUTER_WIDTH, r = edge - width / 2;
    edge -= width + RING_GAP;
    return {r, width, fraction: total ? done / total : 0, opacity: n > 1 ? 1 - i * 0.3 / (n - 1) : 1};
  });
}

/** A finished Project fills its open centre with a tonal disc and a check, so 5 of 5 never reads as an empty outline. */
export function finishedMark(rings) {
  const inner = rings.at(-1), r = inner.r - inner.width / 2 - RING_GAP;
  const k = Math.min(r / 12, 1.2);
  const at = (x, y) => `${(32 + (x - 12) * k).toFixed(2)} ${(32 + (y - 12) * k).toFixed(2)}`;
  return {r, check: `M${at(6.5, 12.5)}L${at(10, 16)}L${at(17.5, 8.5)}`, checkWidth: Math.max(1.5, k * 2)};
}

export function nestRings(blocks, label, {finished = false} = {}) {
  const svg = node('svg', {class: 'nest-rings', viewBox: '0 0 64 64', role: 'img', 'aria-label': label});
  const rings = nestedRings(blocks);
  for (const {r, width, fraction, opacity} of rings) {
    svg.append(node('circle', {cx: 32, cy: 32, r, 'stroke-width': width, class: 'nest-track'}));
    if (fraction) {
      svg.append(node('circle', {cx: 32, cy: 32, r, 'stroke-width': width, 'stroke-opacity': opacity, pathLength: 1,
        'stroke-dasharray': `${fraction} 1`, transform: 'rotate(-90 32 32)', class: 'nest-value'}));
    }
  }
  if (finished && rings.length) {
    const {r, check, checkWidth} = finishedMark(rings);
    svg.append(node('circle', {cx: 32, cy: 32, r, class: 'nest-done'}),
      node('path', {d: check, 'stroke-width': checkWidth, class: 'nest-check'}));
  }
  return svg;
}
