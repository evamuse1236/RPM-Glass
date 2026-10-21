import test from 'node:test';
import assert from 'node:assert/strict';
import {nestedRings, ringSegments, MAX_RINGS, MAX_SEGMENTS} from './planner/rings.mjs';
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
