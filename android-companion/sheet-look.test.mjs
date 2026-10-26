import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('quick add: the title is 16/24 like Capture; day, Time and Block show, the rest waits behind More options', () => {
  const css = read('planner-sheets.css');
  assert.match(css, /\.quick-title textarea, \.quick-mirror \{[^}]*font: var\(--body-large\);/);
  assert.doesNotMatch(css, /icon-only/, 'no chip shows only its icon');
  const js = read('planner/quick-add.mjs');
  assert.doesNotMatch(js, /icon-only/);
  assert.match(js, /body\.append\(nameWrap, hashFold\.node, whenChips, timeChips, whenFold\.node, blockChips, blockFold\.node, more\.row, more\.node, error\)/,
    'rows: day; Time; Block; then one More options row');
  assert.match(js, /timeChips\.append\(timeChip\)/);
  assert.match(js, /ids\.length \? 'Other' : 'Choose Block'/, 'the Block list chip keeps a word beside a Block chip');
  const options = read('planner/quick-options.mjs');
  assert.doesNotMatch(options, /icon-only/);
  assert.match(options, /moreChips\.append\(durationChip, repeatChip, mustChip\)/, 'Estimate, Repeat and Must sit together behind More options');
  assert.match(options, /inner\.append\(moreChips, durationFold\.node, repeatFold\.node\)/);
  assert.match(options, /const moreRow = button\('', null, 'quick-details'\)/, 'More options is a plain row, not a chip');
  assert.match(options, /'More options'/);
});

test('quick add chip names and the More options summary read the chip label, never the icon ligature', () => {
  for (const file of ['planner/quick-add.mjs', 'planner/quick-options.mjs']) {
    assert.doesNotMatch(read(file), /Chip\.textContent/, `${file} reads a whole chip, so "schedule" or "repeat" leaks into its words`);
  }
});

test('quick add chips are 32dp tall with 8dp corners', () => {
  const css = read('planner.css');
  const chip = css.match(/\n\.filter-chip, \.assist-chip \{([^}]*)\}/)?.[1] ?? '';
  assert.match(chip, /min-height: 32px/);
  assert.match(chip, /border-radius: var\(--shape-sm\)/);
  assert.match(read('theme.css'), /--shape-sm:8px/);
});

test('in dark, sheets sit one step above the page (the tab bar\'s tone) with an outline-variant top edge', () => {
  const theme = read('theme.css');
  const dark = theme.slice(theme.indexOf(':root[data-appearance=dark]'));
  assert.match(dark, /--outline-variant:#444746/);
  assert.match(dark, /--float-border:#444746;--float-surface:#282a2c;--float-shadow:none;--sheet-surface:#282a2c;/);
  assert.match(theme, /--sheet-surface:var\(--surface-container-low\)/, 'light keeps the page tone');
  const sheets = read('planner-sheets.css');
  assert.match(sheets, /\.sheet \{\n  --sheet-bg: var\(--sheet-surface\);/);
  assert.match(sheets, /border: 1px solid var\(--float-border\);/);
  assert.match(sheets, /\.sheet :is\(\.block-search, [^)]*\.stepper-btn\) \{ background: var\(--sheet-raised\); \}/,
    'what sits raised on a sheet stays a step above it');
});

test('Blocks: the Next eyebrow is sentence case in label-medium primary', () => {
  assert.match(read('planner/blocks.mjs'), /el\('span', 'overline', 'Next'\)/);
  assert.match(read('planner-pages.css'), /\.next-title \.overline \{ text-transform: none; letter-spacing: 0; color: var\(--primary\); \}/);
  assert.match(read('planner.css'), /\.overline \{[^}]*font: var\(--label-medium\);/);
});
