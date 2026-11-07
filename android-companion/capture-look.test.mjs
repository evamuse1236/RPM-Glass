import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const block = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';

test('the Capture field is body-large (16/24) on one row with the round button, at every text size', () => {
  const css = read('capture.css');
  const field = block(css, '#message');
  assert.match(field, /font:var\(--body-large\)/);
  assert.match(field, /padding:12px 0/);
  assert.match(field, /min-block-size:48px/);
  assert.match(block(css, '.composer'), /display:flex;align-items:flex-end/);
  assert.doesNotMatch(css, /#message\{font:var\(--title-large\)\}/);
  assert.match(read('theme.css'), /--body-large:400 16px\/24px/);
});

test('Send is the one lit control: #A8C7FA with a #062E6F icon in both themes', () => {
  assert.match(block(read('capture.css'), '.send'), /background:var\(--bar-primary\);color:var\(--bar-on-primary\)/);
  const theme = read('theme.css');
  assert.match(theme, /--bar-primary:#a8c7fa;--bar-on-primary:#062e6f;/);
  assert.equal(theme.match(/--bar-primary:/g).length, 1, 'the bar colours are the same in light and dark');
});

test('response cards have a 1px outline border and 20dp corners in both themes; choice chips have 8dp corners', () => {
  const css = read('capture-cards.css');
  const card = block(css, '.card');
  assert.match(card, /border:1px solid var\(--bar-outline\)/);
  assert.match(card, /border-radius:var\(--r-group\)/);
  assert.doesNotMatch(css, /\.card\{outline:/);
  assert.match(block(css, '.chip'), /border-radius:var\(--shape-sm\)/);
  assert.match(read('theme.css'), /--shape-sm:8px/);
  assert.match(block(read('capture.css'), '.stack'), /gap:8px/);
});

test('Capture never darkens what is behind it: no window dim and a clear More scrim (user, 2026-10-21)', () => {
  const styles = read('../app/src/main/res/values/styles.xml');
  assert.match(styles, /backgroundDimEnabled">false</);
  assert.doesNotMatch(styles, /backgroundDimEnabled">true</);
  const host = read('../app/src/main/java/com/rpm/prototype/CompanionActivity.java');
  assert.doesNotMatch(host, /setDimAmount|addFlags\(WindowManager\.LayoutParams\.FLAG_DIM_BEHIND/);
  assert.match(block(read('capture.css'), '.scrim'), /background:transparent/);
});
