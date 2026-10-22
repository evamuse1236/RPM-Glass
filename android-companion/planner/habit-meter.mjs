/**
 * The habit circle's drawing (approved prototype components-v1, 2026-10-20): a segmented ring, one arc per glass of the
 * goal or per meal slot, around a liquid fill with a wave (water) or a bowl (meals). Motion runs only after a tap or a
 * change: a glass pours in (glass-animation.mjs), a meal is served, and the circle leaves and enters around a change of habit. The page's CSP
 * allows no style attributes, so the drawing uses SVG attributes and motion sets styles through the CSSOM.
 */
import {EASE, DURATION, reducedMotion} from '../motion-core.mjs';

const TAU = Math.PI * 2;
const RADIUS = 22, CENTRE = 24, GAP = 3.2;
const pt = (r, a) => `${(CENTRE + r * Math.cos(a)).toFixed(2)} ${(CENTRE + r * Math.sin(a)).toFixed(2)}`;
/** `n` arcs round the circle from twelve o'clock, `gapPx` apart (3.2 px by default). */
export function segs(n, r = RADIUS, gapPx = GAP) {
  const gap = gapPx / r, out = [];
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * TAU / n + gap / 2, a1 = a0 + TAU / n - gap;
    out.push(`M${pt(r, a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(r, a1)}`);
  }
  return out;
}

const WAVE = (() => {
  let d = 'M-24 0';
  for (let x = -24; x < 72; x += 24) d += ' q6 -2.2 12 0 t12 0';
  return d + ' V48 H-24 Z';
})();
/** The water's surface for a fill of `f` (0 to 1) inside the 18 px circle. */
export const levelY = f => 43 - Math.min(1, f) * 37;
const DROP = 'M12 3s6 7 6 11.5a6 6 0 0 1-12 0C6 10 12 3 12 3z';
let uid = 0;

const ring = (arcs, filled) => arcs.map(d => `<path class="track" d="${d}"/>`).join('')
  + arcs.map((d, i) => `<path class="fill" data-i="${i}" d="${d}" pathLength="1"${filled(i) ? '' : ' opacity="0"'}/>`).join('');

export function waterSVG(count, goal) {
  const id = 'habit-water-' + uid++, f = count / goal;
  return `<svg class="habit-meter water${f >= .5 ? ' covered' : ''}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><clipPath id="${id}"><circle cx="24" cy="24" r="18"/></clipPath>
    <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop class="water-top" offset="0"/><stop class="water-deep" offset="1"/></linearGradient></defs>
    ${ring(segs(goal), i => i < count)}
    <circle class="inner" cx="24" cy="24" r="18"/>
    <g clip-path="url(#${id})"><g class="level" transform="translate(0 ${levelY(f)})">
      <g class="wave back" transform="translate(-12 0)"><path d="${WAVE}"/></g>
      <g class="wave front"><path d="${WAVE}" fill="url(#${id}-g)"/></g>
    </g></g>
    <path class="glyph" d="${DROP}" transform="translate(17.5 17) scale(.54)"/>
  </svg>`;
}

/** `logged` holds the indexes of the slots already logged; the bowl is full only when `full`. */
export function mealSVG(slots, logged, full = false) {
  const off = full ? '' : ' off';
  return `<svg class="habit-meter meal" viewBox="0 0 48 48" aria-hidden="true">
    ${ring(segs(slots), i => logged.includes(i))}
    <circle class="inner" cx="24" cy="24" r="18"/>
    <path class="steam" d="M20.5 19 q-2 -2.5 0 -5 t0 -5" pathLength="1"/><path class="steam" d="M27.5 19 q-2 -2.5 0 -5 t0 -5" pathLength="1"/>
    <circle class="bit grain${off}" cx="19" cy="26.5" r="4"/>
    <circle class="bit greens${off}" cx="29" cy="26.5" r="4"/>
    <circle class="bit rice${off}" cx="24" cy="24.5" r="4.8"/>
    <path class="bowl" d="M12.5 27.5 h23 a11.5 9 0 0 1 -23 0z"/>
    <path class="bowl-foot" d="M19 37.5 h10"/>
  </svg>`;
}

export const SPRING = 'cubic-bezier(.34,1.45,.64,1)';
export const pause = ms => new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : ms));
export const anim = (node, frames, options) => (reducedMotion()
  ? node.animate(frames, {duration: 1, fill: 'forwards'}) : node.animate(frames, {fill: 'forwards', ...options})).finished.catch(() => {});

export function drawSegment(seg, delay = 0) {
  if (!seg) return;
  seg.removeAttribute('opacity');
  anim(seg, [{strokeDasharray: 1, strokeDashoffset: 1}, {strokeDasharray: 1, strokeDashoffset: 0}],
    {duration: 460, delay, easing: EASE.emphasized});
}

/** The circle at rest after a glass: the level at `count`, its segment filled, the drop dark once water covers it. */
export function settleGlass(svg, count) {
  const goal = svg.querySelectorAll('.fill').length;
  svg.querySelector('.level').setAttribute('transform', `translate(0 ${levelY(count / goal)})`);
  for (const seg of svg.querySelectorAll('.fill')) if (+seg.dataset.i < count) seg.removeAttribute('opacity');
  svg.classList.toggle('covered', count / goal >= .5);
}

/** Three food bits pop into the bowl, two curls of steam rise and fade, and the meal's segment draws in. */
export async function serveMeal(svg, index) {
  [...svg.querySelectorAll('.bit')].forEach((bit, i) => {
    bit.classList.remove('off');
    anim(bit, [{transform: 'scale(0)'}, {transform: 'scale(1.18)', offset: .7}, {transform: 'scale(1)'}],
      {duration: 340, delay: i * 90, easing: EASE.emphasized});
  });
  await pause(420);
  [...svg.querySelectorAll('.steam')].forEach((curl, i) => anim(curl, [
    {opacity: 0, strokeDasharray: 1, strokeDashoffset: 1, transform: 'translateY(2px)'},
    {opacity: .9, strokeDashoffset: 0, offset: .5},
    {opacity: 0, strokeDasharray: 1, strokeDashoffset: 0, transform: 'translateY(-4px)'}],
  {duration: 1300, delay: i * 160, easing: EASE.emphasized}));
  drawSegment(svg.querySelector(`.fill[data-i="${index}"]`), 200);
  await pause(1200);
}

/** The circle rises out of the + below it. */
export const enterCircle = node => anim(node, [{opacity: 0, transform: 'translateY(14px) scale(.6)'}, {opacity: 1, transform: 'none'}],
  {duration: 360, easing: SPRING});
/** The circle shrinks and fades before another habit takes its place. */
export const leaveCircle = node => anim(node, [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'scale(.7)'}],
  {duration: DURATION.short4, easing: EASE.emphasized});
