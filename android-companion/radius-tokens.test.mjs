import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8');
const theme = read('theme.css');
const px = name => Number(theme.match(new RegExp(`--${name}:(\\d+(?:\\.\\d+)?)px;`))?.[1]);
const rule = (css, selector) => {
  const start = css.indexOf(selector + '{');
  assert.ok(start >= 0, selector);
  return css.slice(start, css.indexOf('}', start));
};
const lengths = value => [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));

test('the radius scale is sheets 36, groups 20, controls 12, tiles 8', () => {
  assert.deepEqual([px('r-sheet'), px('r-group'), px('r-control'), px('r-tile')], [36, 20, 12, 8]);
});

test('Capture nests concentrically: inner radius is the panel radius minus the inset', () => {
  const inset = px('r-sheet') - px('r-group');
  const cards = read('capture-cards.css'), panel = read('capture.css');
  const cardsRule = rule(cards, '.cards');
  assert.match(cardsRule, /border-start-start-radius:var\(--r-sheet\)/);
  assert.equal(lengths(cardsRule.match(/padding:([^;]+)/)[1])[1], inset, 'cards side inset');
  assert.match(rule(cards, '.card'), /border-radius:var\(--r-group\)/);
  const composer = rule(panel, '.composer');
  const [, side] = lengths(composer.match(/padding:([^;]+)/)[1]);
  assert.equal(side, inset, 'composer side inset');
  assert.match(rule(panel, '#message'), /border-radius:var\(--r-group\)/);
});

test('every corner of 6px or more uses a radius token', () => {
  const sheets = fs.readdirSync(new URL('./', import.meta.url)).filter(f => f.endsWith('.css'));
  const raw = [];
  for (const file of sheets) {
    for (const [, prop, value] of read(file).matchAll(/(border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)) {
      if (lengths(value).some(n => n >= 6)) raw.push(`${file}: ${prop}: ${value.trim()}`);
    }
  }
  assert.deepEqual(raw, []);
});
