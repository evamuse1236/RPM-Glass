import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom, FakeElement} from './fake-dom.mjs';
import {editPlan, planner} from './planner-state.mjs';
import {reviewProgress, leftoverChoice} from './review-state.mjs';
import {seed, WEEK, LAST, entry, task} from './review-fixtures.mjs';
import {mountWeeklyReview} from './weekly-review.mjs';
import {sheetLayer} from './review-step-three.mjs';

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

test('Create Result submitted twice before the save lands makes one Result that holds the task', async () => {
  const {d} = seed();
  const id = editPlan(d, {type: 'saveTask', fields: {title: 'Book flights'}});
  const ui = {sheet: {kind: 'new', taskId: id}, newBlock: {title: 'Trip planned', purpose: 'Rest'}};
  const labels = [];
  let queue = Promise.resolve();
  const api = {ui, week: WEEK, data: () => d, now: () => new Date('2026-09-26T10:00:00+05:30'), render() {},
    groupList: () => d.entries.filter(t => t.id === id),
    run(op, label) { labels.push(label); queue = queue.then(async () => { await settle(); editPlan(d, op); }); return queue; }};
  const form = sheetLayer(api).querySelector('form');
  form.dispatch('submit');
  form.dispatch('submit');
  await queue;
  const made = planner(d).blocks.filter(b => b.title === 'Trip planned');
  assert.equal(made.length, 1, 'the second submit creates no second Result');
  assert.equal(d.entries.find(t => t.id === id).blockId, made[0].id, 'the task sits in that Result');
  assert.deepEqual(labels, ['New Result: Trip planned']);
});

/* The planner's own review commit, over a commit that like planner/app.mjs returns undefined while a save runs. */
async function plannerReview(d) {
  const {reviewCommit} = await import('./planner/screens.mjs');
  const app = {saving: false, data: () => d};
  app.commit = async op => {
    if (app.saving) return undefined;
    app.saving = true;
    try { await settle(); return editPlan(d, op); } finally { app.saving = false; }
  };
  let closed = 0;
  const box = document.createElement('div');
  const review = mountWeeklyReview(box, {getData: () => d, close() { closed++; }, openBlock() {}, openCapture() {},
    commit: reviewCommit(app), day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
  return {app, box, review, closed: () => closed};
}

test('step 2: a task added while a swipe Delete saves waits for that save and is kept', async () => {
  const {d} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 2}});
  const {app, box, review} = await plannerReview(d);
  try {
    app.saving = true; // a swipe Delete (persist -> app.commit) is mid-save
    const form = box.querySelector('form');
    form.querySelector('input').value = 'Call the plumber about the leak';
    form.dispatch('submit');
    await settle(); await settle();
    app.saving = false;
    for (let i = 0; i < 10; i++) await settle(); // the review retries every 50ms, then its save takes a tick
    assert.ok(d.entries.some(t => t.title === 'Call the plumber about the leak'), 'the words are saved as a task');
  } finally {
    review.destroy();
  }
});

test('Finish tapped while another planner save is in flight saves the finish before the review closes', async () => {
  const {d, rest, home} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4, focusDraft: [home, rest]}});
  const {app, box, review, closed} = await plannerReview(d);
  try {
    app.saving = true;
    box.querySelector('.wr-next').click();
    await settle(); await settle();
    app.saving = false;
    for (let i = 0; i < 10; i++) await settle(); // the review retries every 50ms, then its save takes a tick
    assert.equal(closed(), 1);
    assert.ok(planner(d).reviews?.[WEEK]?.finishedAt, 'the finish is saved');
  } finally {
    review.destroy();
  }
});

test('Carry, or Carry all, tapped twice before the save lands carries once, so Undo brings the task back to undecided', async () => {
  for (const which of ['row', 'all']) {
    const {d, home, meals, kitchen} = seed();
    editPlan(d, {type: 'setWeekFocus', week: LAST, ids: [home]});
    editPlan(d, {type: 'markAchieved', id: home, achieved: false, verdict: 'notyet', week: LAST});
    const box = document.createElement('div');
    let saves = 0;
    const review = mountWeeklyReview(box, {getData: () => d, close() {}, openBlock() {}, openCapture() {},
      commit: async op => { await settle(); if (op.type !== 'reviewProgress') saves++; editPlan(d, op); },
      day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
    try {
      await settle();
      const tap = which === 'row'
        ? box.querySelector(`[data-key="carry:${meals}"]`)
        : [...box.querySelectorAll('button')].find(n => n.textContent.includes('Carry all'));
      assert.ok(tap, `${which}: the carry button shows`);
      tap.click();
      tap.click();
      for (let i = 0; i < 8; i++) await settle();
      const choice = id => leftoverChoice(entry(d, id), WEEK);
      assert.equal(choice(meals), 'carry', `${which}: carried`);
      assert.equal(saves, 1, `${which}: one carry saved`);
      editPlan(d, {type: 'undo'});
      assert.equal(choice(meals), null, `${which}: Undo takes the carry back`);
      if (which === 'all') assert.equal(choice(kitchen), null, 'Undo takes back every task Carry all carried');
    } finally {
      review.destroy();
    }
  }
});

test('a step 4 Must row tapped twice before the save lands toggles on then off, and Undo takes back the second tap', async () => {
  const {d, home, laundry} = seed();
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4, focusDraft: [home]}});
  const box = document.createElement('div');
  const labels = [];
  const review = mountWeeklyReview(box, {getData: () => d, close() {}, openBlock() {}, openCapture() {},
    commit: async (op, label) => { await settle(); if (op.type === 'saveTask') labels.push(label); editPlan(d, op); },
    day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
  try {
    await settle();
    box.querySelector(`[data-key="open:${home}"]`).click();
    const row = box.querySelector(`[data-key="must:${laundry}"]`);
    assert.ok(row, 'the Must row shows');
    row.click();
    row.click();
    for (let i = 0; i < 8; i++) await settle();
    assert.ok(!entry(d, laundry).must, 'the second tap toggles the saved Must off');
    assert.deepEqual(labels, ['Marked Must', 'No longer a Must']);
    editPlan(d, {type: 'undo'});
    assert.equal(entry(d, laundry).must, true, 'Undo takes back the second tap');
  } finally {
    review.destroy();
  }
});

test('Give it this day tapped twice before the save lands gives the day once, so Undo takes it back', async () => {
  const {d, home} = seed();
  const must = task(d, {title: 'Write the shopping list', blockId: home, minutes: 30, must: true});
  editPlan(d, {type: 'reviewProgress', week: WEEK, patch: {step: 4, focusDraft: [home]}});
  const box = document.createElement('div');
  const review = mountWeeklyReview(box, {getData: () => d, close() {}, openBlock() {}, openCapture() {},
    readCalendar: () => ({status: 'ready', events: []}),
    commit: async op => { await settle(); editPlan(d, op); },
    day: () => '2026-09-26', now: () => new Date('2026-09-26T10:00:00+05:30')});
  try {
    await settle();
    const go = box.querySelector('[data-key="place"]');
    assert.ok(go, 'the suggested day shows');
    go.click();
    go.click();
    for (let i = 0; i < 8; i++) await settle();
    assert.equal(entry(d, must).plannedDate, '2026-09-27', 'the Must is given the suggested day');
    editPlan(d, {type: 'undo'});
    assert.equal(entry(d, must).plannedDate ?? null, null, 'Undo takes the given day back');
  } finally {
    review.destroy();
  }
});
