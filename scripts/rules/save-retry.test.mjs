import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const ROOTS = ['android-companion', 'chat-prototype', 'intent-v2', 'cli', 'convex', 'scripts/web-sync'];
const isTest = file => /\.test\.[cm]?[jt]s$|(^|\/)(test|tests|_generated)\//.test(file);

const SAVES_OUTSIDE_RETRY = new Map([
  ['android-companion/runtime.mjs:save', 'The save helper itself; every caller is checked below.'],
  ['android-companion/runtime.mjs:intentBackend.save', 'Retried: a backend for createRepository, whose transact reloads and retries on a conflict.'],
  ['android-companion/runtime.mjs:<anonymous>', 'Exception: /api/turn carries the version the screen saw and refuses a stale one, so a conflict restores the copy and asks the screen to reopen; a silent replay would break that contract.'],
  ['android-companion/notch-actions.mjs:attempt', 'Retried: rpmNotchRun re-runs attempt with a fresh load when the save meets a newer version.'],
  ['android-companion/sync-runtime.mjs:save', 'Retried: a backend for syncReplica, which reloads and retries on changedUnderneath.'],
  ['intent-v2/src/repository.mjs:run', 'The retry loop itself: transact reloads and runs again on a version conflict.'],
  ['intent-v2/src/repository.mjs:save', 'Retried: captureBackend is a backend used only inside transact.'],
  ['chat-prototype/companion-store.mjs:openStore', 'Exception: the desktop prototype file store has one writer and no compare-and-swap.'],
  ['chat-prototype/companion-store.mjs:transaction', 'Exception: the desktop prototype file store has one writer and no compare-and-swap.'],
  ['android-companion/replica-sync.mjs:saveNext', 'Retried: syncReplica reloads and tries again when saveNext meets changedUnderneath.'],
  ['scripts/web-sync/capture-run.mjs:backend.save', 'Retried: a backend for createRepository; also an in-memory spike with one writer.'],
]);

const callee = node => ts.isIdentifier(node.expression) ? node.expression.text
  : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';

const versionFirst = node => /version|expected/i.test(node.arguments[0]?.getText() ?? '');
const isSave = node => ts.isCallExpression(node) && (
  (callee(node) === 'native' && ts.isStringLiteral(node.arguments[0] ?? {}) && node.arguments[0].text === 'save')
  || (callee(node) === 'save' && (node.arguments.length === 0 || versionFirst(node))));

const isFunction = node => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);

function nameOf(fn) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const parent = fn.parent;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    const owner = parent.parent.parent;
    return ts.isVariableDeclaration(owner) && ts.isIdentifier(owner.name) ? `${owner.name.text}.${parent.name.text}` : parent.name.text;
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return '<anonymous>';
}

const insideRetry = node => {
  for (let at = node; at; at = at.parent)
    if (isFunction(at) && ts.isCallExpression(at.parent) && callee(at.parent) === 'retryOnChange' && at.parent.arguments[0] === at) return true;
  return false;
};

export function unretriedSaves(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = node => {
    if (isSave(node) && !insideRetry(node)) {
      let fn = node.parent; while (fn && !isFunction(fn)) fn = fn.parent;
      found.push({key: `${file}:${fn ? nameOf(fn) : '<top>'}`, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1});
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const sourceFiles = () => execFileSync('git', ['ls-files', '--', ...ROOTS], {encoding: 'utf8'}).split('\n')
  .filter(file => /\.(mjs|js|ts)$/.test(file) && !isTest(file));

test('every save of the shared store retries on a conflict or has a listed reason', () => {
  const seen = new Set(), problems = [];
  for (const file of sourceFiles()) for (const {key, line} of unretriedSaves(readFileSync(file, 'utf8'), file)) {
    if (SAVES_OUTSIDE_RETRY.has(key)) seen.add(key);
    else problems.push(`${file}:${line} (${key}): wrap the save in retryOnChange, or list it with a reason`);
  }
  assert.deepEqual(problems, []);
  assert.deepEqual([...SAVES_OUTSIDE_RETRY.keys()].filter(key => !seen.has(key)), [], 'Remove entries that no longer match a save');
});

test('the runtime save helper is called inside retryOnChange except by /api/turn', () => {
  const file = 'android-companion/runtime.mjs';
  const bare = unretriedSaves(readFileSync(file, 'utf8'), file).filter(({key}) => key.endsWith(':<anonymous>'));
  assert.equal(bare.length, 1, `only the /api/turn handler calls save() without retryOnChange: ${JSON.stringify(bare)}`);
  const line = readFileSync(file, 'utf8').split('\n')[bare[0].line - 1];
  assert.match(line, /await save\(\);return response\(view\(\)\)/);
});

test('the save lint sees bare saves and accepts saves inside a retryOnChange callback', () => {
  assert.deepEqual(unretriedSaves(`async function f(){await native('save',{});}const b={save:async(expected,d)=>store.save(expected,d)};`, 'x.mjs').map(({key}) => key), ['x.mjs:f', 'x.mjs:b.save']);
  assert.deepEqual(unretriedSaves(`save({type:'saveTask'});ui.save(ctx,key);`, 'x.mjs'), []);
  assert.deepEqual(unretriedSaves(`await retryOnChange(async()=>{await save();await phone.save(data.version,d);},async()=>{});native('load');`, 'x.mjs'), []);
  assert.deepEqual(unretriedSaves(`await retryOnChange(run,async()=>{await save();});`, 'x.mjs').map(({key}) => key), ['x.mjs:<anonymous>']);
});
