import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWeeklyReview} from './weekly-review.mjs';

// The flow itself is exercised in a browser harness; this guards the module contract.
test('weekly review exports the mount contract', () => {
  assert.equal(typeof mountWeeklyReview, 'function');
});
