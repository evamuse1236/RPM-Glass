/**
 * The water circle's answer to a logged glass, kept apart so it can be swapped: the water tips like a glass set down on
 * a table, rises to the new level and settles, while the new segment draws in. The circle settles to the new count after
 * it (settleGlass), so a replacement only has to animate.
 */
import {levelY, anim, drawSegment} from './habit-meter.mjs';

export async function animateGlass(svg, from, to) {
  const goal = svg.querySelectorAll('.fill').length;
  const y0 = levelY(from / goal), y1 = levelY(to / goal), mid = (y0 + y1) / 2;
  drawSegment(svg.querySelector(`.fill[data-i="${to - 1}"]`));
  svg.classList.toggle('covered', to / goal >= .5);
  await anim(svg.querySelector('.level'), [
    {transform: `translateY(${y0}px) rotate(0deg)`},
    {transform: `translateY(${mid}px) rotate(-11deg)`, offset: .2},
    {transform: `translateY(${y1}px) rotate(7deg)`, offset: .42},
    {transform: `translateY(${y1}px) rotate(-3.5deg)`, offset: .64},
    {transform: `translateY(${y1}px) rotate(1.5deg)`, offset: .82},
    {transform: `translateY(${y1}px) rotate(0deg)`},
  ], {duration: 1300, easing: 'cubic-bezier(.3,0,.4,1)'});
}
