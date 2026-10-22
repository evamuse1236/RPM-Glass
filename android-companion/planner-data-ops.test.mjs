import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {commit} from './planner/app.mjs';
import {judge} from './review-deck.mjs';
import {bodyApi} from './planner/body-api.mjs';

test('planner commit and editPlan reject executable mutators before any effect or save', async () => {
  const data = freshStore(), before = structuredClone(data);
  let ran = false;
  const mutator = () => { ran = true; };
  for (const op of [mutator, {type: 'saveTask', fields: {title: mutator}}, {type: 'batch', ops: [mutator]}]) {
    assert.throws(() => editPlan(data, op), /JSON data ops/);
    await assert.rejects(commit({}, op), /JSON data ops/);
  }
  assert.equal(ran, false);
  assert.deepEqual(data, before);
});

test('review verdict dispatches data, and body keepUndo dispatches a flag rather than a closure', async () => {
  const calls = [], data = freshStore();
  await judge({ui: {}, run: op => calls.push(op)}, {lastWeek: '2026-10-12'}, {blockId: 'block-1'}, 'achieved');
  assert.deepEqual(calls.pop(), {type: 'markAchieved', id: 'block-1', achieved: true, week: '2026-10-12', verdict: 'achieved'});
  const app = {saving: false, data: () => data, state: {calendar: []}, commit: async op => { calls.push(op); return editPlan(data, op); }};
  await bodyApi(app).drink();
  assert.equal(calls[0].type, 'drinkWater');
});

test('batch changes are atomic with one Undo, and quiet progress and keepUndo preserve the previous Undo', () => {
  const data = freshStore(), now = new Date('2026-10-19T06:30:00Z');
  editPlan(data, {type: 'saveTask', fields: {title: 'First'}}, now);
  editPlan(data, {type: 'saveTask', fields: {title: 'Second'}}, now);
  const before = structuredClone(data), undo = structuredClone(data.planner.undo);
  editPlan(data, {type: 'reviewProgress', week: '2026-10-19', patch: {step: 2}}, now);
  assert.deepEqual(data.planner.undo, undo);
  assert.deepEqual(data.planner.weeks, before.planner.weeks);
  editPlan(data, {type: 'snoozeWater', until: null, keepUndo: true}, now);
  assert.deepEqual(data.planner.undo, undo);
  const ops = [1, 2].map(id => ({type: 'saveTask', id, fields: {planned: now.toISOString()}}));
  const original = structuredClone(data);
  assert.throws(() => editPlan(data, {type: 'batch', ops: [...ops, {type: 'saveTask', id: 999, fields: {title: 'Missing'}}]}, now));
  assert.deepEqual(data, original);
  editPlan(data, {type: 'batch', ops}, now);
  assert.ok(data.entries.every(t => t.planned === now.toISOString()));
  editPlan(data, {type: 'undo'}, now);
  assert.deepEqual(data.entries, original.entries);
});

test('planner modules pass ops at every direct commit and weekly-review run call', async () => {
  const ts = (await import('typescript')).default;
  const {readdirSync, readFileSync} = await import('node:fs');
  const roots = ['android-companion', 'android-companion/planner'];
  const errors = [];
  for (const root of roots) for (const file of readdirSync(root).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && (root.endsWith('/planner') || /^(planner|review|weekly-review)/.test(name)))) {
    const path = `${root}/${file}`, source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const visit = node => {
      if (ts.isCallExpression(node)) {
        const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(source);
        const first = node.arguments[0];
        if (['commit', 'run'].includes(name) && first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first))) errors.push(`${path}:${source.getLineAndCharacterOfPosition(first.pos).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(errors, [], 'Pass a JSON op; closures cannot cross the browser/phone boundary');
});
