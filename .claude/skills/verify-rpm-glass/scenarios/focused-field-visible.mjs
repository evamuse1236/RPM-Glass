import {openBlock, waitForKeyboard, focusCoverage, seededBlockName} from './lib.mjs';

export const id = 'focused-field-visible';
export const rule = 'The field you are typing into stays visible with the keyboard open: not under the keyboard, the bottom nav bar, a snackbar or a FAB. Checked on Quick add (Today > Add task) and on the Plan add field of a Block you come back to.';
export const enforces = 'Covered-content corrections: "I can\'t see the top part, I have to scroll up" (2026-09-28); "docked snackbar never covers rows" (074a8ba); "no FAB over a Must star" (cf4803c); DESIGN.md snackbar rule.';

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  await t.do('open', 'planner');
  await t.do('wait', '--role', 'button', '--name', 'Add task');
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
  await t.do('tap', '--role', 'combobox', '--name', 'Add a task to the Plan');
  await waitForKeyboard(t);
  await t.do('key', 'back');
  await t.do('key', 'back');
  await t.do('tap', '--name', await seededBlockName(t));
  await waitForKeyboard(t);
  const planAdd = await t.read(focusCoverage);
  await t.shot('plan-add');
  t.facts.planAdd = planAdd;

  t.expect(quickAdd.field && !quickAdd.covers.length, `Quick add title is covered by ${quickAdd.covers.join(', ')}`, quickAdd);
  t.expect(planAdd.field && !planAdd.covers.length, `Plan add field is covered by ${planAdd.covers.join(', ')}`, planAdd);
}
