import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nestedRings, finishedMark, MAX_RINGS} from './planner/rings.mjs';
import {toggleProject, projectTasks, filteredProjects} from './planner/projects.mjs';
import {resultStatus} from './review-state.mjs';

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

test('every Project card\'s outer ring has one weight, inner rings are thinner with one gap, and a finished Project marks its open centre with a check', () => {
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
    assert.ok(r > 0 && r < inner.r - inner.width / 2, 'the finished check sits inside the innermost ring');
  }
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
  for (const stroke of ['.nest-value {', '.ring-value {']) {
    const start = css.indexOf(stroke);
    assert.ok(start >= 0, stroke);
    assert.ok(css.slice(start, css.indexOf('}', start)).includes('stroke: var(--progress'), `${stroke} uses --progress`);
  }
});

test('a Project counts only one-time tasks, the same as its Block rows, so a repeating task never keeps it unfinished', () => {
  const block = {id: 'b1', title: 'Get fit', projectId: 'p1'};
  const data = {planner: {blocks: [block], projects: [{id: 'p1', title: 'Health'}], areas: [], goals: []}, entries: [
    {id: 1, kind: 'plan', title: 'Buy shoes', blockId: 'b1', done: true},
    {id: 2, kind: 'plan', title: 'Book coach', blockId: 'b1', done: true},
    {id: 3, kind: 'plan', title: 'Run', blockId: 'b1', recurrence: 'daily', planned: '2026-11-10T07:00:00.000Z'},
  ]};
  const app = {data: () => data, activeBlocks: () => [block]};
  const {stats} = projectTasks(app, {id: 'p1'});
  const status = resultStatus(data, 'b1');
  assert.deepEqual([stats.done, stats.total], [status.done, status.total]);
  assert.deepEqual(stats, {done: 2, total: 2, percent: 100});
});

test('a Projects Area filter left on a deleted Area shows every Project, as its chip reads Area: All', () => {
  const health = {id: 'health', title: 'Health'};
  const run = {id: 'p1', title: 'Run 10K', goalId: 'g1'};
  const read = {id: 'p2', title: 'Read more', goalId: 'g2'};
  const goals = [{id: 'g1', areaId: 'health'}, {id: 'g2', areaId: 'mind'}];
  const make = (areas, projectFilter) => {
    const plan = {areas, projects: [run, read]};
    return {p: () => plan, state: {projectFilter},
      projectArea: pr => areas.find(area => area.id === goals.find(g => g.id === pr.goalId)?.areaId)};
  };
  assert.deepEqual(filteredProjects(make([], 'health')).projects, [run, read]);
  assert.equal(filteredProjects(make([], 'health')).current, undefined);
  assert.deepEqual(filteredProjects(make([health], 'health')).projects, [run]);
  assert.deepEqual(filteredProjects(make([health, {id: 'empty', title: 'Empty'}], 'empty')).projects, []);
  assert.deepEqual(filteredProjects(make([health], null)).projects, [run, read]);
});
