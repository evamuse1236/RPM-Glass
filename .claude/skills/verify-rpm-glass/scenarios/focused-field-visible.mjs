import {openBlock, waitForKeyboard, focusCoverage} from './lib.mjs';

export const id = 'focused-field-visible';
export const rule = 'The field you are typing into stays visible with the keyboard open: not under the keyboard, the bottom nav bar, a snackbar or a FAB. Checked on Quick add (Today > Add task) and on the Plan add field of a Block you come back to.';
export const enforces = 'Covered-content corrections: "I can\'t see the top part, I have to scroll up" (2026-09-28); "docked snackbar never covers rows" (074a8ba); "no FAB over a Must star" (cf4803c); DESIGN.md snackbar rule.';
export const knownBug = {
  since: '2026-10-07',
  failsWith: /^Plan add field is covered/,
  reason: 'Reopening a Block whose "Add a task to the Plan" field had focus puts focus back in the field and raises the keyboard, but leaves the field under the keyboard (field top 516 vs visible bottom 474 CSS px); scrolling then parks it under the bottom nav bar (361-409 vs nav 394). The "Task added" snackbar can cover it too.',
  evidence: '.verify/evidence/2026-10-07T13-37-30/03-plan-add-typed.png, 05-plan-add-focused-user-path.png, 30-probe-reopen-scroll.png',
  expires: '2026-11-07',
  approval: 'pending: needs Dara to accept or fix',
};

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  await t.do('open', 'planner');
  await t.do('tap', '--role', 'button', '--name', 'Add task');
  await t.do('wait', '--role', 'textbox', '--name', 'Task');
  await waitForKeyboard(t);
  const quickAdd = await t.read(focusCoverage);
  await t.shot('quick-add');
  t.facts.quickAdd = quickAdd;
  await t.do('key', 'back');
  await t.do('key', 'back');

  // Start typing a task in a Block's Plan, leave with Back twice, then come back to the same Block.
  await openBlock(t);
  await t.do('tap', '--role', 'textbox', '--name', 'Add a task to the Plan');
  await waitForKeyboard(t);
  await t.do('key', 'back');
  await t.do('key', 'back');
  await t.do('tap', '--name', 'RM critical review drafted');
  await waitForKeyboard(t);
  const planAdd = await t.read(focusCoverage);
  await t.shot('plan-add');
  t.facts.planAdd = planAdd;

  t.expect(quickAdd.field && !quickAdd.covers.length, `Quick add title is covered by ${quickAdd.covers.join(', ')}`, quickAdd);
  t.expect(planAdd.field && !planAdd.covers.length, `Plan add field is covered by ${planAdd.covers.join(', ')}`, planAdd);
}
