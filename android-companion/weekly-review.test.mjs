import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMinutes, mountWeeklyReview} from './weekly-review.mjs';

// The flow itself is exercised in a browser harness; this guards the module contract and time labels.
test('weekly review exports the mount contract and readable durations', () => {
  assert.equal(typeof mountWeeklyReview, 'function');
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(60), '1h');
  assert.equal(formatMinutes(310), '5h 10m');
});
