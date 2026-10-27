import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PHONE_TASK_ID_CEILING, PHONE_TASK_IDS, SERVER_TASK_IDS} from '../../android-companion/task-ids.mjs';

const MODULE = 'android-companion/task-ids.mjs';
const RANGE = new Set([1e9, 2 ** 31 - 1, 2 ** 31]);
const ROOTS = ['android-companion', 'chat-prototype', 'intent-v2', 'convex', 'web', 'cli', 'scripts', 'app/src/main/java'];
const isTest = file => /\.test\.[cm]?[jt]s$|(^|\/)(test|tests|_generated)\//.test(file);

const ALLOWED = new Map([
  ['scripts/web-sync/drive-blocks.mjs:1000000000', 'A sort key for Blocks with no priority, not a task ID.'],
  ['app/src/main/java/com/rpm/prototype/IslandView.java:1000000000', 'Nanoseconds per second for frame timing, not a task ID.'],
]);

function value(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''));
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken
    && ts.isNumericLiteral(node.left) && ts.isNumericLiteral(node.right)) return Number(node.left.text) ** Number(node.right.text);
  if (ts.isCallExpression(node) && node.expression.getText() === 'Math.pow' && node.arguments.length === 2
    && node.arguments.every(ts.isNumericLiteral)) return Number(node.arguments[0].text) ** Number(node.arguments[1].text);
  return null;
}

function rangeNumbers(text, file) {
  if (file.endsWith('.java')) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...code.matchAll(/(?<![\w.])(\d[\d_]*(?:\.\d+)?(?:e\d+)?)[lLfFdD]?(?![\w.])/g)]
      .map(match => Number(match[1].replace(/_/g, ''))).filter(number => RANGE.has(number));
  }
  if (file.endsWith('.json')) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = node => {
    const number = value(node);
    if (number !== null && RANGE.has(number)) { found.push(number); return; }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const sourceFiles = () => execFileSync('git', ['ls-files', '--', ...ROOTS], {encoding: 'utf8'}).split('\n')
  .filter(file => /\.(mjs|js|ts|java)$/.test(file) && !isTest(file) && file !== MODULE);

test(`task ID range numbers appear only in ${MODULE}`, () => {
  const seen = new Set(), problems = [];
  for (const file of sourceFiles()) {
    for (const number of rangeNumbers(readFileSync(file, 'utf8'), file)) {
      const key = `${file}:${number}`;
      if (ALLOWED.has(key)) seen.add(key);
      else problems.push(`${key}: import PHONE_TASK_IDS or SERVER_TASK_IDS from ${MODULE}`);
    }
  }
  assert.deepEqual(problems, []);
  assert.deepEqual([...ALLOWED.keys()].filter(key => !seen.has(key)), [], 'Remove allow-list entries that no longer match');
});

test('the range module keeps phone IDs below server IDs', () => {
  assert.deepEqual(PHONE_TASK_IDS, [1, PHONE_TASK_ID_CEILING]);
  assert.deepEqual(SERVER_TASK_IDS, [PHONE_TASK_ID_CEILING, 2 ** 31]);
});

test('the command schema caps task IDs at the last server ID', () => {
  const schema = readFileSync('web/contract/command.schema.json', 'utf8');
  const caps = [...schema.matchAll(/"maximum":\s*(\d+)/g)].map(match => Number(match[1]));
  assert.ok(caps.length > 0);
  assert.ok(caps.includes(SERVER_TASK_IDS[1] - 1), 'command.schema.json must cap task IDs at SERVER_TASK_IDS[1] - 1');
  assert.deepEqual(caps.filter(cap => cap >= PHONE_TASK_ID_CEILING && cap < Number.MAX_SAFE_INTEGER && cap !== SERVER_TASK_IDS[1] - 1), []);
});

test('the range lint sees literal forms and ignores names and comments', () => {
  assert.deepEqual(rangeNumbers('const a = 1000000000, b = 1e9, c = 2 ** 31, d = Math.pow(2, 31), e = 2147483647, f = 1_000_000_000;', 'x.ts'), [1e9, 1e9, 2 ** 31, 2 ** 31, 2 ** 31 - 1, 1e9]);
  assert.deepEqual(rangeNumbers('// 1000000000\nconst x = SERVER_TASK_IDS[1], y = "2147483648", z = 1000000001;', 'x.mjs'), []);
  assert.deepEqual(rangeNumbers('long a = 2147483648L; float b = 1e9f; // 1000000000\nint c = Integer.MAX_VALUE;', 'X.java'), [2 ** 31, 1e9]);
});
