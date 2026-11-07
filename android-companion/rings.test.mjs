import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nestedRings, finishedMark, ringSegments, MAX_RINGS, MAX_SEGMENTS} from './planner/rings.mjs';
import {toggleProject} from './planner/projects.mjs';

test('each Block ring\'s arc is its done/total, outermost first, fading inward', () => {
  const rings = nestedRings([{done: 2, total: 5}, {done: 4, total: 4}, {done: 0, total: 3}, {done: 0, total: 0}]);
  assert.deepEqual(rings.map(r => r.fraction), [0.4, 1, 0, 0]);
  for (let i = 1; i < rings.length; i++) {
    assert.ok(rings[i].r < rings[i - 1].r, 'the first Block is the outer ring');
    assert.ok(rings[i].opacity < rings[i - 1].opacity);
    assert.ok(rings[i - 1].r - rings[i].r >= rings[i].width, 'rings never overlap');
  }
  assert.equal(rings[0].opacity, 1);
  assert.ok(rings.at(-1).r - rings.at(-1).width / 2 > 0);
  assert.deepEqual(nestedRings([{done: 1, total: 3}]).map(({fraction, opacity}) => ({fraction, opacity})), [{fraction: 1 / 3, opacity: 1}]);
  assert.equal(nestedRings(Array.from({length: 9}, () => ({done: 1, total: 2}))).length, MAX_RINGS);
});

test('every Project card\'s outer ring has one weight, inner rings are thinner with one gap, and a finished Project fills its centre', () => {
  const full = nestedRings(Array.from({length: MAX_RINGS}, () => ({done: 1, total: 2})));
  const [one] = nestedRings([{done: 1, total: 2}]);
  assert.deepEqual([one.r, one.width], [full[0].r, full[0].width], 'a one-Block ring is the outer ring of a full set');
  assert.ok(full.slice(1).every(r => r.width < full[0].width && r.width >= 2), 'inner rings step down, never under 2');
  assert.equal(new Set(full.slice(1).map(r => r.width)).size, 1, 'one inner weight');
  const gaps = full.slice(1).map((r, i) => full[i].r - full[i].width / 2 - (r.r + r.width / 2));
  assert.equal(new Set(gaps).size, 1, 'one gap');
  assert.ok(gaps[0] >= full[0].width, 'the gap between rings is at least the outer stroke wide');
  assert.ok(full.at(-1).r - full.at(-1).width / 2 >= 8, 'the innermost ring keeps an open centre');
  for (const rings of [full, [one]]) {
    const {r} = finishedMark(rings), inner = rings.at(-1);
    assert.ok(r > 0 && r < inner.r - inner.width / 2, 'the finished disc sits inside the innermost ring');
  }
});

test('a Block row\'s segment ring has one arc per task, the done ones on', () => {
  const arcs = ringSegments(2, 5);
  assert.equal(arcs.length, 5);
  assert.deepEqual(arcs.map(a => a.on), [true, true, false, false, false]);
  assert.deepEqual(ringSegments(0, 0), []);
  assert.deepEqual(ringSegments(3, MAX_SEGMENTS + 1), [], 'past the cap it is one arc of the share done');
});

test('a card tap opens its Block list, a second tap closes it, and only one card is open', () => {
  const state = {projectOpen: null};
  assert.equal(toggleProject(state, 'p1'), 'p1');
  assert.equal(toggleProject(state, 'p2'), 'p2');
  assert.equal(toggleProject(state, 'p2'), null);
  assert.equal(state.projectOpen, null);
});

test('progress is drawn in the Area colour, or primary blue with no Area; never the neutral gray', () => {
  const css = ['planner.css', 'planner-pages.css'].map(f => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).join('\n');
  assert.ok(css.includes('[data-tone] { --tone: var(--outline); --progress: var(--primary); }'));
  assert.ok(css.includes('[data-tone^=area-] { --progress: var(--tone); }'));
  assert.doesNotMatch(css, /\.ring-track \{ stroke: var\(--surface-container-highest\)/, 'no later rule turns a Block ring\'s track gray');
  for (const stroke of ['.nest-value {', '.seg-on {']) {
    const start = css.indexOf(stroke);
    assert.ok(start >= 0, stroke);
    assert.ok(css.slice(start, css.indexOf('}', start)).includes('stroke: var(--progress'), `${stroke} uses --progress`);
  }
});
