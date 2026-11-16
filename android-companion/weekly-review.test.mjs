import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
import {editPlan} from './planner-state.mjs';
import {reviewProgress} from './review-state.mjs';
import {seed, WEEK} from './review-fixtures.mjs';
import {mountWeeklyReview} from './weekly-review.mjs';

// The flow itself is exercised in a browser harness; this guards the module contract.
test('weekly review exports the mount contract', () => {
  assert.equal(typeof mountWeeklyReview, 'function');
});

/* Just enough of a browser for the review to mount and re-render in node. */
installFakeDom();
Object.assign(FakeElement.prototype, {
  get style() { return this._style ??= {setProperty() {}, removeProperty() {}}; },
  get isConnected() { return true; },
  get clientHeight() { return 0; }, get scrollHeight() { return 0; }, get clientWidth() { return 400; },
  contains() { return false; },
  getBoundingClientRect() { return {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0}; },
  animate() { return {finished: Promise.resolve(), cancel() {}}; },
  scrollBy() {}, scrollTo() {}, prepend(...nodes) { this.append(...nodes); },
});
Object.assign(globalThis.document, {activeElement: null, getElementById: () => null, querySelector: () => null, addEventListener() {}});
globalThis.window ??= {addEventListener() {}, removeEventListener() {}, matchMedia: () => ({matches: true})};
globalThis.matchMedia ??= () => ({matches: true});
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.CSS ??= {escape: s => s};
globalThis.requestAnimationFrame ??= () => 0;
globalThis.innerHeight ??= 800;
globalThis.innerWidth ??= 400;

const settle = () => new Promise(resolve => setTimeout(resolve, 20));
function mountOn(d) {
  const box = document.createElement('div');
  const review = mountWeeklyReview(box, {getData: () => d, commit: async op => editPlan(d, op), close() {}, openBlock() {},
    openCapture() {}, day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
  return {box, review};
}

test('two open reviews of one week: a step change on one keeps the Results, kept tasks and clash choices the other saved', async () => {
  const {d, rest, home, inbox} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4}});
  const phone = mountOn(d), web = mountOn(d);
  try {
    phone.box.querySelector(`[data-key="focus:${home}"]`).click();
    await settle();
    phone.review.refresh();
    phone.box.querySelector(`[data-key="focus:${rest}"]`).click();
    await settle();
    assert.deepEqual([...reviewProgress(d, WEEK).focusDraft].sort(), [home, rest].sort(), 'the phone saved its picks');
    editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {keptIds: [inbox], clashes: {x: 'later'}}});
    web.review.refresh();
    assert.equal(web.box.querySelector(`[data-key="focus:${home}"]`).getAttribute('aria-checked'), 'true',
      'the website shows the picks the phone saved');
    web.box.querySelector('.wr-back').click();
    await settle();
    const after = reviewProgress(d, WEEK);
    assert.equal(after.step, 3, 'the website moved back a step');
    assert.deepEqual([...after.focusDraft].sort(), [home, rest].sort(), 'and the phone\'s picks survive');
    assert.deepEqual(after.keptIds, [inbox], 'so do the kept tasks');
    assert.deepEqual(after.clashes, {x: 'later'}, 'and the clash choices');
  } finally {
    phone.review.destroy();
    web.review.destroy();
  }
});
