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
