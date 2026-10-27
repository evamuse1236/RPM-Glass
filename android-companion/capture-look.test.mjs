import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const block = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';

test('the Capture field is body-large (16/24) with 12 20 4 padding, at every text size', () => {
  const css = read('capture.css');
  const field = block(css, '#message');
  assert.match(field, /font:var\(--body-large\)/);
  assert.match(field, /padding:12px 20px 4px/);
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

test('the forming card is a quiet card: same surface and solid 1px edge as the others, no dash, no shadow, body text', () => {
  const css = read('capture-cards.css');
  const forming = block(css, '.card.forming');
  assert.doesNotMatch(forming, /dashed|border-color|background/, 'it keeps the card surface and outline');
  assert.match(forming, /box-shadow:none/);
  assert.match(forming, /color:var\(--bar-on-variant\)/);
  assert.match(block(css, '.forming-title'), /font:var\(--body-large\)/);
});

test('Capture never darkens what is behind it: no window dim and a clear More scrim (user, 2026-10-21)', () => {
  const styles = read('../app/src/main/res/values/styles.xml');
  assert.match(styles, /backgroundDimEnabled">false</);
  assert.doesNotMatch(styles, /backgroundDimEnabled">true</);
  const host = read('../app/src/main/java/com/rpm/prototype/CompanionActivity.java');
  assert.doesNotMatch(host, /setDimAmount|addFlags\(WindowManager\.LayoutParams\.FLAG_DIM_BEHIND/);
  assert.match(block(read('capture.css'), '.scrim'), /background:transparent/);
});

test('the More menu floats like the composer: bar surface, 1px edge, 36dp corners all round, 16dp page inset', () => {
  const css = read('capture.css');
  const sheet = block(css, '.sheet');
  assert.match(sheet, /inset-block-end:calc\(var\(--keyboard-inset,0px\) \+ var\(--inset-page\)\)/);
  assert.match(sheet, /background:var\(--bar\);/);
  assert.match(sheet, /border:1px solid var\(--bar-outline\)/);
  assert.match(sheet, /border-radius:var\(--r-outer\);/, 'one radius on every corner');
  assert.equal(sheet.match(/inset-inline:[^;]*/)?.[0], 'inset-inline:var(--inset-page)');
  assert.equal(block(css, '.stack').match(/inset-inline:[^;]*/)?.[0], 'inset-inline:var(--inset-page)', 'the same width as the composer');
  assert.match(block(css, '.sheet-row'), /min-block-size:56px/);
});

test('the More menu rises once with no overshoot, after the keyboard has dropped', () => {
  const css = read('capture.css');
  assert.match(css, /\.sheet\{transition:translate var\(--dur-medium3\) var\(--ease-emphasized-decelerate\)/);
  assert.doesNotMatch(css.slice(css.indexOf('.sheet{')), /--ease-spring|cubic-bezier\(\.34/, 'no bounce');
  const js = read('capture-sheet.mjs');
  const open = js.match(/function open\(\)\{([\s\S]*?)\n \}/)?.[1] ?? '';
  assert.match(open, /afterKeyboard\(/, 'the menu waits for the keyboard instead of rising under it');
  assert.match(js, /MutationObserver/);
  assert.match(js, /setTimeout\(done,400\)/, 'it shows even if the keyboard never reports');
});
