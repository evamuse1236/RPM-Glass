import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const band = readFileSync(new URL('../app/src/main/java/com/rpm/prototype/IslandBand.java', import.meta.url), 'utf8');

test('the old and new digit share one slot and one curve', () => {
  assert.ok(band.includes('float y = leaving ? baseline - travel * p : baseline + travel * (1f - p);'));
});

test('the per-frame digit draw allocates nothing', () => {
  const rolled = band.slice(band.indexOf('private void drawRolled('), band.indexOf('private void drawChar('));
  assert.ok(rolled.length > 0);
  assert.doesNotMatch(rolled, /substring\(|String\.valueOf|\bnew |\+ ""/);
});
