import test from 'node:test';
import assert from 'node:assert/strict';
import {ART, outline, dashed, toSvg} from './sprite-art.mjs';

test('every sprite is a clean rectangle of known tones', () => {
  for (const [name, rows] of Object.entries(ART)) {
    assert.ok(rows.every(r => r.length === rows[0].length), `${name} rows differ in width`);
    assert.ok(rows.every(r => /^[kmls.]+$/.test(r)), `${name} uses an unknown tone`);
  }
});

test('an outline keeps only edge pixels and dashed keeps every other one', () => {
  const box = ['kkk', 'kkk', 'kkk'];
  assert.deepEqual(outline(box), ['kkk', 'k.k', 'kkk']);
  assert.deepEqual(dashed(box), ['k.k', '...', 'k.k']);
});

test('the SVG draws one rect run per tone at twice the game pixel size', () => {
  const svg = toSvg(['kk.m'], {title: 'Two'});
  assert.match(svg, /viewBox="0 0 4 1" width="8" height="2"/);
  assert.match(svg, /<path class="t-k" d="M0 0h2v1h-2z"\/>/);
  assert.match(svg, /<path class="t-m" d="M3 0h1v1h-1z"\/>/);
  assert.match(svg, /role="img" aria-label="Two"/);
});
