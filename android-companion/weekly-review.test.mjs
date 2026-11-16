import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
import {editPlan, planner} from './planner-state.mjs';
import {reviewProgress} from './review-state.mjs';
import {seed, WEEK, LAST} from './review-fixtures.mjs';
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

for (const [why, close] of [
  ['its Result is marked Achieved', (d, home) => editPlan(d, {type: 'markAchieved', id: home, achieved: true, week: LAST, verdict: 'achieved'})],
  ['its Block is archived', (d, home) => editPlan(d, {type: 'archiveBlock', id: home})],
]) {
  test(`step 3 lists every task it counts as Sorted, even when ${why}`, async () => {
    const {d, home, inbox} = seed();
    editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 3, inboxIds: [inbox]}});
    editPlan(d, {type: 'groupTasks', ids: [inbox], blockId: home});
    close(d, home);
    const {box, review} = mountOn(d);
    try {
      await settle();
      const sorted = box.querySelector('.wr-formed');
      assert.ok(sorted, 'the Sorted list shows');
      const heads = [...sorted.querySelectorAll('.wr-target-title')].map(n => n.textContent);
      assert.deepEqual(heads, ['Have home ready for the week'], 'under its Block');
      const rows = [...sorted.querySelectorAll('.wr-row-title')].map(n => n.textContent);
      assert.deepEqual(rows, ['Call the bank'], 'the counted task has a row');
      const back = sorted.querySelector(`[data-key="unmove:${inbox}"]`);
      assert.ok(back, 'with its Move back to the Inbox button');
      back.click();
      await settle();
      assert.equal(d.entries.find(e => e.id === inbox).blockId ?? null, null, 'which moves it back');
    } finally {
      review.destroy();
    }
  });
}

test('resuming step 4 after a picked Result was archived: Finish counts the same Results the list shows', async () => {
  const {d, rest, home} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4, focusDraft: [home, rest]}});
  editPlan(d, {type: 'archiveBlock', id: rest});
  const {box, review} = mountOn(d);
  try {
    assert.equal(box.querySelector('.wr-sub').textContent, '1 picked · aim for 3 to 5');
    const next = box.querySelector('.wr-next');
    assert.equal(next.getAttribute('aria-label'), 'Finish with 1 Result');
    assert.equal(next.querySelector('.wr-long').textContent, 'Finish with 1 Result');
    assert.deepEqual(reviewProgress(d, WEEK).focusDraft, [home, rest], 'showing it saves nothing');
  } finally {
    review.destroy();
  }
});

test('a tap applies even when another surface saved the week\'s drafts since the last refresh', async () => {
  const {d, home, inbox} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4}});
  const phone = mountOn(d);
  try {
    // The website's save lands before this review's next refresh.
    editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {keptIds: [inbox]}});
    phone.box.querySelector(`[data-key="focus:${home}"]`).click();
    await settle();
    assert.deepEqual(reviewProgress(d, WEEK).focusDraft, [home], 'the pick is saved');
    assert.deepEqual(reviewProgress(d, WEEK).keptIds, [inbox], 'beside the website\'s kept task');
    assert.equal(phone.box.querySelector(`[data-key="focus:${home}"]`).getAttribute('aria-checked'), 'true',
      'and the Result shows picked');
  } finally {
    phone.review.destroy();
  }
});

test('Finish tapped twice before the save lands commits one finish, so one Undo takes back the week\'s Results', async () => {
  const {d, rest, home} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4, focusDraft: [home, rest]}});
  const box = document.createElement('div');
  const finishes = [];
  let closed = 0;
  const review = mountWeeklyReview(box, {getData: () => d, close() { closed++; }, openBlock() {}, openCapture() {},
    commit: async op => { if (op.type === 'finishReview') finishes.push(op); await settle(); editPlan(d, op); },
    day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
  try {
    const next = box.querySelector('.wr-next');
    next.click();
    next.click();
    await settle(); await settle(); await settle();
    assert.equal(finishes.length, 1, 'the second tap commits no second finish');
    assert.equal(closed, 1);
    editPlan(d, {type: 'undo'});
    assert.equal(planner(d).weeks?.[WEEK]?.focus, undefined, 'Undo clears the week\'s Results');
  } finally {
    review.destroy();
  }
});

test('Finish can be tapped again after its save failed', async () => {
  const {d, rest, home} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4, focusDraft: [home, rest]}});
  const box = document.createElement('div');
  let tries = 0, closed = 0;
  const review = mountWeeklyReview(box, {getData: () => d, close() { closed++; }, openBlock() {}, openCapture() {},
    commit: async op => { if (op.type === 'finishReview' && ++tries === 1) throw new Error('offline'); editPlan(d, op); },
    day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
  try {
    box.querySelector('.wr-next').click();
    await settle();
    assert.equal(closed, 0, 'a failed finish keeps the review open');
    box.querySelector('.wr-next').click();
    await settle();
    assert.equal(tries, 2, 'the second tap tries again');
    assert.equal(closed, 1);
  } finally {
    review.destroy();
  }
});

test('a clash chip tapped twice, or a then b, before the save lands leaves one decision task on Today', async () => {
  const at = s => +new Date(`2026-09-30T${s}:00+05:30`);
  const events = [{title: 'DAD exam', start: at('09:00'), end: at('10:00')}, {title: 'GWBC session', start: at('09:30'), end: at('10:30')}];
  for (const [first, second] of [['a', 'a'], ['a', 'b']]) {
    const {d} = seed();
    editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4}});
    const box = document.createElement('div');
    const review = mountWeeklyReview(box, {getData: () => d, close() {}, openBlock() {}, openCapture() {},
      readCalendar: () => ({status: 'ready', events}),
      commit: async op => { await settle(); editPlan(d, op); },
      day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
    try {
      await settle();
      const chip = keep => [...box.querySelectorAll('.wr-choice')].find(n => n.dataset.key.startsWith(`clash:${keep}:`));
      assert.ok(chip(first), 'step 4 shows the clash');
      const second_ = chip(second);
      chip(first).click();
      second_.click();
      for (let i = 0; i < 8; i++) await settle();
      const made = d.entries.filter(t => /clash/i.test(t.title ?? ''));
      assert.equal(made.length, 1, `${first} then ${second}: one decision task`);
      assert.match(made[0].title, second === 'a' ? /keep DAD exam/ : /keep GWBC session/, 'saying the last choice');
    } finally {
      review.destroy();
    }
  }
});
