import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {commit} from './planner/app.mjs';
import {judge} from './review-deck.mjs';
import {bodyApi} from './planner/body-api.mjs';
import {runNotchRequest} from './notch-ops.mjs';
import {bodyOf} from './body-store.mjs';

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

test('an offered Undo names its change: after another save it refuses instead of taking back that save', () => {
  const data = freshStore(), now = new Date('2026-11-16T05:00:00Z');
  editPlan(data, {type: 'saveTask', fields: {title: 'Call bank'}}, now);
  const id = data.entries[0].id;
  editPlan(data, {type: 'saveTask', id, fields: {done: true}}, now);
  const offered = data.planner.undo?.id;
  assert.equal(typeof offered, 'string', 'each Undo carries its own id');
  // A meal guess or a snooze keeps the same Undo, so the offered Undo still works after one.
  const kept = structuredClone(data);
  editPlan(kept, {type: 'snoozeWater', until: null, keepUndo: true}, now);
  editPlan(kept, {type: 'undo', undoId: offered}, now);
  assert.equal(kept.entries.find(e => e.id === id).done, false);
  // The notch saves a glass of water before the user taps Undo (or a retried commit replays it after a reload).
  runNotchRequest(data, {action: 'drink'}, now);
  const before = structuredClone(data);
  assert.throws(() => editPlan(data, {type: 'undo', undoId: offered}, now), /This changed on another device\./);
  assert.deepEqual(data, before);
  assert.equal(bodyOf(data).water.glasses.length, 1);
  assert.equal(data.entries.find(e => e.id === id).done, true);
});

test('the planner sheets offer Undo with the id of the change they name', async () => {
  const {readdirSync, readFileSync} = await import('node:fs');
  const bare = [];
  for (const file of readdirSync('android-companion/planner').filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))) {
    const source = readFileSync(`android-companion/planner/${file}`, 'utf8');
    for (const match of source.matchAll(/commit\(\{type: 'undo'([^}]*)\}/g)) if (!/undoId/.test(match[1])) bare.push(file);
  }
  assert.deepEqual(bare, [], 'an Undo with no undoId takes back whatever was saved last');
});

test('Save ratings with no slider touched changes nothing and keeps the earlier Undo', async () => {
  const data = freshStore();
  const id = editPlan(data, {type: 'saveEntity', collection: 'areas', fields: {title: 'Health'}});
  editPlan(data, {type: 'rateAreas', ratings: [{id, rating: 7}]});
  const before = structuredClone(data);
  assert.throws(() => editPlan(data, {type: 'rateAreas', ratings: []}), /Choose a rating first/);
  assert.deepEqual(data, before);
  editPlan(data, {type: 'undo'});
  assert.equal(data.planner.areas.find(a => a.id === id).rating ?? null, null, 'Undo still takes back the rating');
  const life = await import('node:fs').then(fs => fs.readFileSync(new URL('./planner/life.mjs', import.meta.url), 'utf8'));
  assert.match(life, /if \(!ratings\.length\) return app\.closeSheet\(\);/, 'an empty Save ratings closes the sheet without a commit');
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

test('a meal guess saved with keepUndo survives an Undo of a change made while the guess ran', () => {
  const data = freshStore(), now = new Date('2026-11-16T03:00:00Z');
  const poha = editPlan(data, {type: 'saveMeal', meal: {name: 'Poha', slot: 'breakfast'}}, now);
  editPlan(data, {type: 'setMealGuess', id: poha, guess: {status: 'pending'}, keepUndo: true}, now);
  editPlan(data, {type: 'saveMeal', meal: {name: 'Banana', slot: 'snack'}}, now);
  const kept = data.planner.undo.id;
  editPlan(data, {type: 'setMealGuess', id: poha, guess: {status: 'ready', kcal: 300, protein: 8}, keepUndo: true}, now);
  assert.equal(data.planner.undo.id, kept);
  editPlan(data, {type: 'batch', ops: [{type: 'setMealGuess', id: poha, guess: {status: 'ready', kcal: 320, protein: 9}}], keepUndo: true}, now);
  editPlan(data, {type: 'undo'}, now);
  assert.deepEqual(bodyOf(data).meals.map(m => m.name), ['Poha']);
  assert.equal(bodyOf(data).mealGuesses[poha].status, 'ready');
  assert.equal(bodyOf(data).mealGuesses[poha].kcal, 320);
  // A guess for a meal the Undo image never had leaves that image alone.
  const fresh = freshStore();
  const toast = editPlan(fresh, {type: 'saveMeal', meal: {name: 'Toast', slot: 'breakfast'}}, now);
  editPlan(fresh, {type: 'setMealGuess', id: toast, guess: {status: 'pending'}, keepUndo: true}, now);
  editPlan(fresh, {type: 'undo'}, now);
  assert.deepEqual(bodyOf(fresh).meals, []);
  assert.equal(bodyOf(fresh).mealGuesses?.[toast], undefined);
});

test('a meal guess saved with keepUndo survives Capture\'s Undo of a change made while the guess ran', async () => {
  const {changePlanner} = await import('./planner-tools.mjs');
  const {undo} = await import('../chat-prototype/companion-tools.mjs');
  const {recordSnapshot} = await import('../chat-prototype/companion-state.mjs');
  const data = freshStore(), now = new Date(2026, 10, 16, 8), raw = 'Add buy milk';
  const poha = editPlan(data, {type: 'saveMeal', meal: {name: 'Poha', slot: 'breakfast'}}, now);
  const toast = editPlan(data, {type: 'saveMeal', meal: {name: 'Toast', slot: 'breakfast'}}, now);
  editPlan(data, {type: 'setMealGuess', id: poha, guess: {status: 'pending'}, keepUndo: true}, now);
  const r = await changePlanner(data, {operations: [{collection: 'tasks', fields: {title: 'Buy milk'}, id: null, type: 'create', ref: null, evidence: [raw]}], continuation: false, question: null, choices: []}, {raw, conversationId: data.conversations[0].id, now});
  // A second Capture Undo level; its image holds Poha too.
  data.undo = {id: 'edit', before: recordSnapshot(data), at: now.toISOString(), previous: data.undo};
  // An image without the meal (or with it skipped) stays as it was.
  data.undo.previous.previous = {id: 'old', before: structuredClone({...recordSnapshot(data), planner: {...data.undo.before.planner, body: {...data.undo.before.planner.body, meals: []}}}), at: now.toISOString()};
  const untouched = structuredClone(data.undo.previous.previous);
  editPlan(data, {type: 'setMealGuess', id: poha, guess: {status: 'ready', kcal: 300, protein: 8}, keepUndo: true}, now);
  assert.equal(data.undo.id, 'edit');
  assert.equal(data.undo.previous.id, r.undoId);
  editPlan(data, {type: 'batch', ops: [{type: 'setMealGuess', id: poha, guess: {status: 'ready', kcal: 320, protein: 9}}], keepUndo: true}, now);
  assert.equal(data.undo.id, 'edit');
  assert.deepEqual(data.undo.previous.previous, untouched);
  data.undo = data.undo.previous;
  undo(data, r.undoId);
  assert.ok(!data.entries.some(e => e.title === 'Buy milk'));
  assert.equal(bodyOf(data).mealGuesses[poha].status, 'ready');
  assert.equal(bodyOf(data).mealGuesses[poha].kcal, 320);
  assert.equal(bodyOf(data).mealGuesses?.[toast], undefined);
});

test('a keepUndo save (meal guess, snooze) keeps Capture\'s pending Undo as well as the planner\'s', async () => {
  const {changePlanner} = await import('./planner-tools.mjs');
  const {undo} = await import('../chat-prototype/companion-tools.mjs');
  for (const quiet of [{type: 'snoozeWater', until: null, keepUndo: true}, {type: 'batch', ops: [{type: 'snoozeWater', until: null}], keepUndo: true}]) {
    const data = freshStore(), now = new Date(2026, 8, 16, 8), raw = 'Add buy milk';
    const r = await changePlanner(data, {operations: [{collection: 'tasks', fields: {title: 'Buy milk'}, id: null, type: 'create', ref: null, evidence: [raw]}], continuation: false, question: null, choices: []}, {raw, conversationId: data.conversations[0].id, now});
    assert.equal(data.undo?.id, r.undoId);
    editPlan(data, quiet, now);
    assert.equal(data.undo?.id, r.undoId, `${quiet.type} keepUndo keeps Capture's Undo`);
    undo(data, r.undoId);
    assert.ok(!data.entries.some(e => e.title === 'Buy milk'));
  }
  const data = freshStore();
  data.undo = {id: 'cap-1'};
  editPlan(data, {type: 'saveTask', fields: {title: 'Newer'}});
  assert.equal(data.undo, null, 'a visible save still retires Capture\'s Undo');
});
