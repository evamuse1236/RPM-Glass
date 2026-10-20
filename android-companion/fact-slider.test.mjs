import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSlider, nearestStop, TIME_STOPS, LENGTH_STOPS} from './planner/fact-slider.mjs';

function fakeRange() {
  const input = new EventTarget();
  return Object.assign(input, {value: '0', dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }});
}

test('the Time slider runs every half hour from 6:00 AM to 11:00 PM; the Length slider from 5 min to 4 h', () => {
  assert.equal(TIME_STOPS[0], '06:00');
  assert.equal(TIME_STOPS.at(-1), '23:00');
  assert.equal(TIME_STOPS.length, 35);
  assert.deepEqual([LENGTH_STOPS[0], LENGTH_STOPS.at(-1)], [5, 240]);
});

test('an off-grid value puts the thumb on the nearest stop', () => {
  assert.equal(TIME_STOPS[nearestStop('time', '10:10')], '10:00');
  assert.equal(TIME_STOPS[nearestStop('time', '10:20')], '10:30');
  assert.equal(TIME_STOPS[nearestStop('time', '05:00')], '06:00');
  assert.equal(LENGTH_STOPS[nearestStop('length', 50)], 45);
  assert.equal(LENGTH_STOPS[nearestStop('length', null)], 30, 'no length starts the thumb at 30 min');
});

test('letting go writes the snapped value once and names it for TalkBack; moving only shows it', () => {
  const input = fakeRange();
  const saved = [], live = [];
  const slider = bindSlider(input, {kind: 'length', text: n => `${n} min`, save: n => saved.push(n), onLive: words => live.push(words)});
  assert.equal(input.max, String(LENGTH_STOPS.length - 1));
  slider.set(null);
  assert.equal(input.attributes['aria-valuetext'], 'Not set');
  assert.ok('unset' in input.dataset);
  input.value = '6';
  input.dispatchEvent(new Event('input'));
  assert.deepEqual(saved, [], 'a drag does not save');
  assert.equal(input.attributes['aria-valuetext'], '45 min');
  assert.equal('unset' in input.dataset, false);
  input.value = '7';
  input.dispatchEvent(new Event('change'));
  assert.deepEqual(saved, [60]);
  assert.equal(input.attributes['aria-valuetext'], '60 min');
  assert.deepEqual(live, ['Not set', '45 min', '60 min']);
});

test('a saved time shows as itself even off the grid', () => {
  const input = fakeRange();
  const slider = bindSlider(input, {kind: 'time', text: time => `at ${time}`, save: () => {}});
  slider.set('10:21');
  assert.equal(TIME_STOPS[Number(input.value)], '10:30');
  assert.equal(input.attributes['aria-valuetext'], 'at 10:21');
});
