import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSpine} from '../../android-companion/spine-model.mjs';
import {gridLayout, GRID_SCALE} from '../../android-companion/planner/day-grid.mjs';
import {snapStart, snapLength} from '../../android-companion/spine-drag.mjs';

const DAY = '2026-10-19';
const at = time => +new Date(`${DAY}T${time}`);
const task = (id, time, minutes) => ({id, title: id, start: at(time), minutes, result: 'Pass the DAD exam', tone: 'area-3'});
const grid = (tasks, now = at('14:45'), live = true) =>
  gridLayout(buildSpine({day: DAY, now, live, tasks, meals: []}), {day: DAY, now, live});
const row = (model, id) => model.rows.find(r => r.task?.id === id || r.id === id || r.title === id);

test('on the wide grid a row sits at its clock time and is as tall as its length', () => {
  const model = grid([task('Read', '09:00', 60), task('Draft', '11:30', 30)]);
  assert.equal(model.grid.start, at('07:00'));
  assert.equal(model.grid.end, at('22:00'));
  assert.equal(model.grid.hour, 60 * GRID_SCALE);
  assert.equal(model.grid.span, 15 * 60 * GRID_SCALE);
  assert.equal(model.grid.hours.length, 16);
  const read = row(model, 'Read');
  const draft = row(model, 'Draft');
  assert.equal(read.top, 120 * GRID_SCALE);
  assert.equal(read.height, 60 * GRID_SCALE);
  assert.equal(draft.top, 270 * GRID_SCALE);
  assert.equal(draft.height, 30 * GRID_SCALE);
});

test('overlapping rows split the width into lanes; rows apart keep the whole width', () => {
  const model = grid([task('A', '09:00', 60), task('B', '09:30', 60), task('C', '16:00', 30)]);
  assert.deepEqual([row(model, 'A'), row(model, 'B')].map(r => [r.lane, r.lanes]), [[0, 2], [1, 2]]);
  assert.deepEqual([row(model, 'C').lane, row(model, 'C').lanes], [0, 1]);
});

test('a short task keeps a readable height and the range grows to fit an early start', () => {
  const model = grid([task('Pills', '06:10', 5)]);
  assert.equal(model.grid.start, at('06:00'));
  assert.equal(row(model, 'Pills').height, 24);
});

test('the now line sits at the current minute only while the day is live', () => {
  const live = grid([task('Read', '09:00', 60)]);
  const now = live.rows.find(r => r.kind === 'now');
  assert.equal(now.top, Math.round((at('14:45') - at('07:00')) / 60000 * GRID_SCALE));
  assert.equal(live.nowKey, 'now');
  const later = grid([task('Read', '09:00', 60)], at('14:45'), false);
  assert.equal(later.rows.some(r => r.kind === 'now'), false);
});

test('a day with nothing timed keeps the list instead of an empty grid', () => {
  assert.equal(gridLayout({rows: [{kind: 'gap', start: at('08:00'), plan: null}], shape: ''}, {day: DAY, now: at('14:45'), live: true}).grid, null);
});

test('dragging on the grid moves and stretches by its own scale in 15-minute steps', () => {
  const dayStart = at('00:00');
  assert.equal(snapStart(at('09:00'), 30 * GRID_SCALE, dayStart, GRID_SCALE), at('09:30'));
  assert.equal(snapStart(at('09:00'), 10 * GRID_SCALE, dayStart, GRID_SCALE), at('09:15'));
  assert.equal(snapLength(60, 30 * GRID_SCALE, GRID_SCALE), 90);
});

test('the grid shows only on a wide window and its hover hints stay inside the wide rules', () => {
  const day = readFileSync(new URL('../../android-companion/planner/today-day.mjs', import.meta.url), 'utf8');
  assert.match(day, /app\.api\.wide\?\.\(\) \? gridLayout\(/);
  const css = readFileSync(new URL('./day-grid.css', import.meta.url), 'utf8');
  assert.match(css, /^@media \(width >= 1080px\) \{/);
  assert.equal(css.split('\n@media').every(block => /\(width >= 1080px\)/.test(block)), true);
});
