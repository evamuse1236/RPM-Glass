import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {check} from './check-rules.mjs';

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-rules-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test('raw-error-text flags an error message shown on screen and names the fix', () => {
  const root = tree({'android-companion/planner/app.mjs': "try { save(); } catch (error) {\n  notice(app, error.message);\n}\n"});
  try {
    const problems = check(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^rule raw-error-text: android-companion\/planner\/app\.mjs:2: .*userMessage\(error\) from android-companion\/user-message\.mjs/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('raw-error-text accepts userMessage, comparisons, tests and reasoned exceptions', () => {
  const root = tree({
    'android-companion/a.mjs': "notice(app, userMessage(error));\nif (error.message === 'Failed to fetch') retry();\nlog({error: e.message/* rules-allow raw-error-text: diagnostics log */});\n",
    'android-companion/a.test.mjs': "assert.equal(error.message, 'x');\n",
  });
  try { assert.deepEqual(check(root), []); } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('raw-error-text sees renamed catch bindings, computed access, destructuring and a raw read after a comparison', () => {
  const root = tree({'intent-v2/src/x.mjs': [
    "try { a(); } catch (failure) { notice(app, failure.message); }",
    "p.catch(oops => show(oops['message']));",
    "try { a(); } catch ({message}) { show(message); }",
    "if (error.message === 'x') show(error.message);",
    "p.catch(async oops => show(oops.message));",
    "const {message} = err; show(message);",
  ].join('\n')});
  try {
    assert.deepEqual(check(root).map(p => p.match(/:(\d+): /)[1]), ['1', '2', '3', '4', '5', '6']);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('inline-style-attribute flags a style attribute in markup, which the companion CSP drops', () => {
  const root = tree({
    'android-companion/planner/meter.mjs': "const svg = `<g class=\"level\" style=\"transform:translateY(4px)\">`;\nnode.style.setProperty('--h', '4px');\n",
    'android-companion/planner.html': '<div id="dock"></div>\n',
  });
  try {
    const problems = check(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^rule inline-style-attribute: android-companion\/planner\/meter\.mjs:1: .*setProperty/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('task-id-counter rejects max-plus-one entry allocation but permits unrelated maxima and the allocator', () => {
  const root = tree({
    'android-companion/new-task.mjs': 'const id = Math.max(0, ...data.entries.map(e => e.id)) + 1;',
    'chat-prototype/other.mjs': 'const id = 1 + Math.max(0,\n ...data.entries.map(e => e.id));',
    'android-companion/priority.mjs': 'const priority = Math.max(0, ...data.entries.map(e => e.priority)) + 1;',
    'android-companion/task-ids.mjs': 'const id = Math.max(0, ...data.entries.map(e => e.id)) + 1;',
  });
  try {
    const problems = check(root);
    assert.equal(problems.length, 2);
    assert.ok(problems.every(p => p.startsWith('rule task-id-counter:') && p.includes('nextTaskId(data)')));
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
