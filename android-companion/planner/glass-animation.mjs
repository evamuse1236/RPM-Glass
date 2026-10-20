/**
 * The water circle's answer to a logged glass, kept apart so it can be swapped: a drop falls in, a ripple spreads, the
 * level rises with a slight overshoot, the waves slosh and the new segment draws in. The circle settles to the new
 * count after it (settleGlass), so a replacement only has to animate.
 */
import {EASE} from '../motion-core.mjs';
import {levelY, anim, pause, drawSegment, SPRING} from './habit-meter.mjs';

export async function animateGlass(svg, from, to) {
  const goal = svg.querySelectorAll('.fill').length;
  const level = svg.querySelector('.level'), y0 = levelY(from / goal), y1 = levelY(to / goal);
  const fall = svg.querySelector('.fall'), ripple = svg.querySelector('.ripple');
  const dropMs = 380;
  anim(fall, [{opacity: 1, transform: 'translateY(2px)'}, {opacity: 1, transform: `translateY(${y0 - 4}px)`, offset: .92},
    {opacity: 0, transform: `translateY(${y0 - 2}px)`}], {duration: dropMs, easing: 'cubic-bezier(.5,0,.9,.5)'});
  await pause(dropMs - 30);
  ripple.setAttribute('cy', String(y0));
  anim(ripple, [{opacity: .9, transform: 'scale(.3)'}, {opacity: 0, transform: 'scale(1.5)'}], {duration: 520, easing: EASE.emphasized});
  anim(level, [{transform: `translateY(${y0}px)`}, {transform: `translateY(${y1}px)`}], {duration: 700, easing: SPRING});
  for (const [wave, start, distance, duration] of [[svg.querySelector('.front'), 0, -24, 900], [svg.querySelector('.back'), -12, 12, 1100]]) {
    anim(wave, [{transform: `translateX(${start}px)`}, {transform: `translateX(${start + distance}px)`}],
      {duration, easing: 'cubic-bezier(.2,.6,.3,1)', iterations: 2});
  }
  drawSegment(svg.querySelector(`.fill[data-i="${to - 1}"]`));
  svg.classList.toggle('covered', to / goal >= .5);
  await pause(760);
}
