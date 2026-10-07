import {openBlock, sleep} from './lib.mjs';

export const id = 'plan-add-in-place';
export const rule = "Adding a task in a Block's Plan changes the list in place: the rows already there are kept (not rebuilt), the add field keeps focus and empties, and the new task appears once and is saved under that Block.";
export const enforces = 'Re-render and motion corrections: "ugh the transitions everywhere are awful and now its like the widget refreshes everytume" (2026-09-28); rounds 202e181, adabcbc, 72f8e6d, 1aff6f3, 1c09739 ("Nodes thrown away per Enter: 63 -> 6").';
export const MAX_REMOVED = 12;

const TITLE = 'Email Prof. Rao about the citation format';

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  await openBlock(t);
  await t.do('tap', '--role', 'textbox', '--name', 'Add a task to the Plan');
  const before = await t.read(() => {
    window.__churn = 0;
    window.__rowsBefore = [...document.querySelectorAll('.plan-list .task-row')];
    new MutationObserver(list => {
      for (const m of list) for (const n of m.removedNodes) if (n.nodeType === 1) window.__churn += 1 + n.querySelectorAll('*').length;
    }).observe(document.getElementById('workspace'), {childList: true, subtree: true});
    return window.__rowsBefore.length;
  });
  await t.do('type', TITLE);
  await t.do('key', 'enter');
  await t.do('wait', '--role', 'button', '--name', TITLE);
  await sleep(1500);
  const after = await t.read(title => {
    const field = document.querySelector('[aria-label="Add a task to the Plan"]');
    const rows = [...document.querySelectorAll('.plan-list .task-row')];
    return {
      removedNodes: window.__churn,
      keptRows: window.__rowsBefore.filter(r => r.isConnected).length,
      rows: rows.length,
      newRows: rows.filter(r => r.textContent.includes(title)).length,
      fieldFocused: document.activeElement === field,
      fieldValue: field?.value ?? null,
    };
  }, TITLE);
  Object.assign(t.facts, {rowsBefore: before, ...after});
  await t.shot('added');
  t.expect(after.newRows === 1, `The new task should appear once in the Plan, found ${after.newRows}`, after);
  t.expect(after.keptRows === before, `Existing Plan rows were rebuilt: ${before - after.keptRows} of ${before} replaced`, after);
  t.expect(after.removedNodes <= MAX_REMOVED, `One Enter threw away ${after.removedNodes} nodes (limit ${MAX_REMOVED})`, after);
  t.expect(after.fieldFocused && after.fieldValue === '', 'The add field should keep focus and be empty for the next task', after);
  const saved = (await t.store()).entries.filter(e => e.title === TITLE);
  t.facts.saved = saved.map(e => ({title: e.title, raw: e.raw, blockId: e.blockId}));
  t.expect(saved.length === 1 && saved[0].blockId === 'block-1' && saved[0].raw === TITLE, 'The task should be saved once, in the RM critical review Block, with the typed words', t.facts.saved);
}
