import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EASE, DURATION} from './motion-core.mjs';

const theme = fs.readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const camel = name => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const tokens = prefix => [...theme.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+):([^;]+);`, 'g'))]
  .filter(([, , value]) => !value.startsWith('var('))
  .map(([, name, value]) => [camel(name), value.trim()]);

test('scripted motion uses the same easing curves as theme.css', () => {
  const css = tokens('ease');
  assert.ok(css.some(([name]) => name === 'spring'));
  for (const [name, value] of css) assert.equal(EASE[name], value, '--ease-' + name);
});

test('scripted motion uses the same durations as theme.css', () => {
  const css = tokens('dur');
  for (const name of ['press', 'settle', 'morph']) assert.ok(css.some(([n]) => n === name), name);
  for (const [name, value] of css) assert.equal(DURATION[name] + 'ms', value, '--dur-' + name);
});
