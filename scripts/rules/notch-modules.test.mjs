import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';

const DIR = 'app/src/main/java/com/rpm/prototype';
const VIEW_NAMES = /\b(NotchParts|NotchContent|NotchController|IslandView)\b|\bandroid\.view\b/;

const code = text => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/"(?:\\.|[^"\\])*"/g, '""');

export function viewLeaks(files) {
  return Object.entries(files)
    .filter(([name]) => name.endsWith('Module.java'))
    .flatMap(([name, text]) => {
      const hit = code(text).match(VIEW_NAMES);
      return hit ? [`${name} names ${hit[0]}`] : [];
    });
}

export function unregistered(files) {
  const registry = code(files['NotchModules.java'] ?? '').match(/\bALL\s*=\s*List\.of\(([\s\S]*?)\);/);
  const listed = new Set([...(registry?.[1] ?? '').matchAll(/new\s+(\w+)\s*\(/g)].map(m => m[1]));
  return Object.values(files).flatMap(text => [...code(text)
    .matchAll(/\b(?:class|record|enum)\s+(\w+)[^{;]*?\bimplements\b[^{]*?\bNotchModule\b(?![\w.])/g)]
    .map(m => m[1])
    .filter(name => !listed.has(name)));
}

const tree = () => Object.fromEntries(readdirSync(DIR).filter(f => f.endsWith('.java'))
  .map(f => [f, readFileSync(`${DIR}/${f}`, 'utf8')]));

test('notch modules name no view class', () => {
  assert.deepEqual(viewLeaks(tree()), []);
});

test('every NotchModule is in NotchModules.ALL', () => {
  const files = tree();
  assert.ok(Object.keys(files).filter(f => f.endsWith('Module.java')).length >= 5);
  assert.deepEqual(unregistered(files), []);
});

test('the checks catch a view import and a missing registration', () => {
  const registry = 'final class NotchModules { static final List<NotchModule> ALL = List.of(new TasksModule()); }';
  assert.deepEqual(viewLeaks({'FocusModule.java': 'import android.view.View;\nclass FocusModule {}'}), ['FocusModule.java names android.view']);
  assert.deepEqual(viewLeaks({'FocusModule.java': 'class FocusModule { NotchParts p; }'}), ['FocusModule.java names NotchParts']);
  assert.deepEqual(viewLeaks({'FocusModule.java': '/** Unlike NotchContent, pure. */ class FocusModule { String s = "IslandView"; }'}), []);
  assert.deepEqual(unregistered({
    'NotchModules.java': registry,
    'TasksModule.java': 'final class TasksModule implements NotchModule {}',
    'FocusModule.java': 'final class FocusModule implements Comparable<String>, NotchModule {}',
  }), ['FocusModule']);
});
