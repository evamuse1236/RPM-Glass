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
    if (/backdrop-filter\s*:\s*[^;]*blur\(/.test(m[2])) found.push(m[1].trim());
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
