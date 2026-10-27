import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DISPLAYS} from './lib/runtime.mjs';
import {avdConfig} from '../../../scripts/ci/prepare-avd.mjs';
import {S24} from '../../../playground/device.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('phone is the S24 FE at One UI default text: 100% text, density 450 (384dp wide)', () => {
  assert.equal(DISPLAYS.phone.fontScale, '1.0');
  assert.equal(S24.density * 160, 450);
  assert.match(avdConfig(''), /^hw\.lcd\.density=450$/m);
  assert.equal(Math.round(S24.width / S24.density), 384);
});

test('enlarged text is not a design target: no display preset, scenario or recipe asks for it', () => {
  assert.deepEqual(Object.keys(DISPLAYS).filter(k => /text/.test(k)), []);
  const files = [
    ...fs.readdirSync(path.join(here, 'scenarios')).map(f => path.join(here, 'scenarios', f)),
    ...fs.readdirSync(path.join(here, 'features')).map(f => path.join(here, 'features', f)),
    path.join(here, 'SKILL.md'),
  ];
  const asks = files.filter(f => /large-text|max-text/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(asks.map(f => path.basename(f)), []);
});

export function enlargedTextLines(text) {
  return text.split('\n').map((line, i) => ({line, n: i + 1})).filter(({line}) => {
    if (/user[- ]requested|user's request|user asks/i.test(line)) return false;
    const scales = [...line.matchAll(/font[_-]?scale\D{0,4}(\d+(?:\.\d+)?)/gi)].map(m => Number(m[1]));
    const percents = /font[_-]?scale|large text|system text/i.test(line) ? [...line.matchAll(/(\d+)\s*%/g)].map(m => Number(m[1]) / 100) : [];
    return [...scales, ...percents].some(v => v > 1);
  });
}

test('no feature recipe sets a font scale above 1.0 unless the line says the user requested it', () => {
  const dir = path.join(here, 'features');
  const hits = fs.readdirSync(dir).filter(f => f.endsWith('.md')).flatMap(f =>
    enlargedTextLines(fs.readFileSync(path.join(dir, f), 'utf8')).map(({n, line}) => `${f}:${n}: ${line.slice(0, 120)}`));
  assert.deepEqual(hits, []);
});

test('the font-scale scan catches 2.0, 130% and --font-scale, and lets 1.0 and user-requested lines pass', () => {
  assert.equal(enlargedTextLines('adb shell settings put system font_scale 2.0').length, 1);
  assert.equal(enlargedTextLines('`display phone --font-scale 1.3`').length, 1);
  assert.equal(enlargedTextLines('at 130% large text the pills stack').length, 1);
  assert.equal(enlargedTextLines('Set `font_scale` back to 1.0 after.').length, 0);
  assert.equal(enlargedTextLines('Only when the user requested it: font_scale 2.0').length, 0);
  assert.equal(enlargedTextLines('glass at 60% transparency').length, 0);
});
