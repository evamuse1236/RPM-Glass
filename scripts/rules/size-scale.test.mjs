import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const STYLES = ['android-companion', 'web/app'];
const TOKENS = 'theme.css';

export const SCALE = Object.freeze({
  space: [0, 4, 8, 12, 16, 20, 24, 32, 48],
  keyline: [40, 56, 72, 120],
  stroke: [1, 2],
  icon: [20, 24],
  radius: [2, 4, 8, 12, 16, 20, 28, 36, 999],
});

const SPACE = /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(?:-[a-z-]+)?$/;
const SIZE = /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size))$/;
const STROKE = /^(?:border(?:-[a-z-]+)?-width|outline-width|outline-offset|border|outline|border-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)$/;

const pxValues = value => [...value.replace(/var\([^)]*\)/g, '').matchAll(/(-?\d*\.?\d+)px/g)].map(m => Math.abs(Number(m[1])));

function allowed(property, px) {
  if (px === 0) return true;
  if (SPACE.test(property)) return SCALE.space.includes(px) || SCALE.keyline.includes(px) || SCALE.stroke.includes(px);
  if (SIZE.test(property)) return SCALE.stroke.includes(px) || px % 4 === 0;
  if (STROKE.test(property)) return SCALE.stroke.includes(px) || SCALE.space.includes(px);
  if (property === 'font-size') return SCALE.icon.includes(px) || px % 4 === 0;
  if (/radius$/.test(property)) return SCALE.radius.includes(px);
  return true;
}

export function offScale(css, file = 'inline.css') {
  const found = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  for (const match of body.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, property, value] = match;
    const line = body.slice(0, match.index).split('\n').length;
    for (const px of pxValues(value)) if (!allowed(property, px)) found.push(`${file}:${line} ${property}: ${value.trim()} (${px}px is off the size scale)`);
  }
  return found;
}

test('every padding, margin, gap, size, stroke, icon and radius comes from the size scale', () => {
  const files = STYLES.flatMap(dir => readdirSync(dir).filter(name => name.endsWith('.css') && name !== TOKENS).map(name => join(dir, name)));
  const problems = files.flatMap(file => offScale(readFileSync(file, 'utf8'), file));
  assert.deepEqual(problems, [], 'Use a token from theme.css or a value from SCALE in scripts/rules/size-scale.test.mjs.');
});

test('the size lint catches the off-scale values it exists for', () => {
  assert.equal(offScale('.a{padding:6px 10px}').length, 2);
  assert.equal(offScale('.a{font-size:17px}').length, 1);
  assert.equal(offScale('.a{border-radius:14px}').length, 1);
  assert.deepEqual(offScale('.a{padding:var(--s3) 16px;gap:8px;inline-size:40px;border:1px solid red;font-size:20px;margin:-4px}'), []);
});
