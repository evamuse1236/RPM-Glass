import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {segs, levelY, waterSVG, mealSVG} from './planner/habit-meter.mjs';

test('the meter has one arc per glass of the goal or per meal slot that is on', () => {
  assert.equal(segs(8).length, 8);
  assert.equal((waterSVG(3, 8).match(/class="fill"/g) ?? []).length, 8);
  assert.equal((waterSVG(3, 8).match(/class="fill"[^>]*opacity="0"/g) ?? []).length, 5, 'three glasses filled, five empty');
  assert.equal((mealSVG(3, [0]).match(/class="fill"[^>]*opacity="0"/g) ?? []).length, 2, 'breakfast logged, two to go');
  assert.doesNotMatch(waterSVG(3, 8) + mealSVG(3, [0]), /\sstyle=|<text/, 'no style attributes and no text inside the circle');
});

test('the water level rises from empty to the top of the 18px circle', () => {
  assert.equal(levelY(0), 43);
  assert.equal(levelY(1), 6);
  assert.equal(levelY(2), 6, 'past the goal the level stays full');
});

test('the logged-glass motion is one swappable function: animateGlass(svg, from, to), and the circle settles after it', () => {
  const circle = readFileSync(new URL('./planner/habit-circle.mjs', import.meta.url), 'utf8');
  const motion = readFileSync(new URL('./planner/glass-animation.mjs', import.meta.url), 'utf8');
  assert.match(motion, /export async function animateGlass\(svg, from, to\)/);
  assert.equal((circle.match(/animateGlass\(/g) ?? []).length, 1, 'one call site');
  assert.match(circle, /await animateGlass\(drawing, from, to\);\s*settleGlass\(drawing, to\);/);
});
