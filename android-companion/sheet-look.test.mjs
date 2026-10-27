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
  assert.match(options, /const moreRow = button\('', null, 'quick-details'\)/, 'More options is one button that opens the rest');
  assert.match(options, /'More options'/);
});

test('quick add is Capture\'s composer: a floating panel on the bar tokens, Capture\'s chips and a round Send', () => {
  const css = read('planner-sheets.css');
  const panel = css.match(/\n\.sheet\.sheet-quick \{([^}]*)\}/)?.[1] ?? '';
  assert.match(panel, /--sheet-bg: var\(--bar\);/);
  assert.match(panel, /inset-inline: var\(--inset-page\);/);
  assert.match(panel, /border: 1px solid var\(--bar-outline\);/);
  assert.match(panel, /border-radius: var\(--r-outer\);/);
  assert.match(panel, /color: var\(--bar-on\);/);
  assert.match(css, /:root\[data-keyboard=open\] \.sheet\.sheet-quick \{ inset-block-end: var\(--inset-page\); \}/, '16dp above the keyboard');
  assert.match(css, /\.sheet-quick \.send \{ background: var\(--bar-primary\); color: var\(--bar-on-primary\); \}/);
  assert.match(css, /\.sheet-quick :is\(\.filter-chip, \.assist-chip, \.quick-details\) \{[^}]*border: 1px solid var\(--bar-outline\);/);
  assert.match(read('theme.css'), /:root\[data-appearance=dark\],\.sheet\.sheet-quick\{/, 'the same dark tokens as Capture in either appearance');
  const js = read('planner/quick-add.mjs');
  assert.match(js, /iconButton\('arrow_upward', 'Add', \(\) => submit\(\), \{cls: 'round send'\}\)/);
  assert.match(js, /iconButton\('mic', 'Capture', \(\) => app\.capture\(\), \{cls: 'round mic'\}\)/);
  assert.doesNotMatch(js, /'filled-btn'/, 'no Add pill');
  assert.match(js, /\n  name\.focus\(\{preventScroll: true\}\);\n  app\.api\.native\('keyboard'/, 'the keyboard is asked for while the panel rises, so it opens as one move');
  const sheet = read('planner/sheet.mjs');
  assert.match(sheet, /innerHeight - node\.getBoundingClientRect\(\)\.top \+ travelled\(node\)/,
    'a closing sheet travels past the screen bottom, not its own height, so it never stops mid-screen');
  assert.match(sheet, /if \(node\.contains\(document\.activeElement\)\) document\.activeElement\.blur\(\);\n  node\.inert = true;/,
    'the keyboard drops with the sheet');
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

test('the Other length chip shows its whole word on a desktop browser: no spin buttons, and the field fits its placeholder', () => {
  const css = read('task-sheet.css');
  const rule = css.match(/\.number-chip input \{([^}]*)\}/)[1];
  assert.match(rule, /field-sizing: content;/);
  assert.match(rule, /min-inline-size: calc\(4ch \+ 4px\);/);
  assert.match(rule, /padding-inline: 0;/);
  assert.match(rule, /appearance: textfield;/);
  assert.doesNotMatch(rule, /(^|[^-])inline-size:/, 'a fixed width cuts the placeholder');
  assert.match(css, /\.number-chip input::-webkit-inner-spin-button, \.number-chip input::-webkit-outer-spin-button \{ -webkit-appearance: none; margin: 0; \}/);
});
