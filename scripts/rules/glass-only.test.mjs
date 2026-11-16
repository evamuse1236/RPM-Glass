import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const STYLES = ['android-companion', 'web/app'];
const GLASS = ['#nav-bar', '.habit-circle', '.bar-sample-bar'];

function blurRules(css) {
  const found = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = rule.exec(body));) {
    // Any value but `none` counts: blur can arrive through var(--x) with no literal blur( here.
    const values = [...m[2].matchAll(/backdrop-filter\s*:\s*([^;]*)/g)].map(v => v[1].replace(/!important/i, '').trim());
    if (values.some(v => v && v !== 'none')) found.push(m[1].trim());
  }
  return found;
}

test('only the tab bar, the habit circle and the tab bar preview use backdrop blur', () => {
  const stray = [];
  for (const dir of STYLES) for (const name of readdirSync(dir).filter(f => f.endsWith('.css'))) {
    for (const selector of blurRules(readFileSync(join(dir, name), 'utf8')))
      if (!selector.split(',').every(part => GLASS.some(g => part.includes(g)))) stray.push(`${dir}/${name}: ${selector}`);
  }
  assert.deepEqual(stray, [], 'Blur outside the tab bar and habit circle breaks DESIGN.md ("Don\'t add glass or blur anywhere else")');
});

test('the check catches a blurred scrim', () => {
  assert.deepEqual(blurRules('.sheet-scrim { backdrop-filter: blur(4px); }'), ['.sheet-scrim']);
});

test('the check catches blur passed through a custom property and leaves resets alone', () => {
  assert.deepEqual(blurRules(':root{--g: blur(4px)} .sheet{backdrop-filter: var(--g)}'), ['.sheet']);
  assert.deepEqual(blurRules('.sheet{-webkit-backdrop-filter: var(--g)}'), ['.sheet']);
  assert.deepEqual(blurRules('.x{backdrop-filter:none} .y{-webkit-backdrop-filter: none !important;}'), []);
});
