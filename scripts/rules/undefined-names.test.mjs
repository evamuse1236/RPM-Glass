import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';

const ROOTS = ['android-companion', 'intent-v2/src', 'chat-prototype'];
const CANNOT_FIND_NAME = new Set([2304, 2552, 2662, 2663]);

function sources(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return /\.m?js$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name) ? [path] : [];
  });
}

export function undefinedNames(files) {
  const program = ts.createProgram(files, {
    allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: ['node'],
  });
  return ts.getPreEmitDiagnostics(program)
    .filter(d => CANNOT_FIND_NAME.has(d.code) && d.file)
    .map(d => {
      const {line} = d.file.getLineAndCharacterOfPosition(d.start);
      return `${d.file.fileName}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
    });
}

test('every name the app pages use is declared or imported', () => {
  assert.deepEqual(undefinedNames(ROOTS.flatMap(sources)), []);
});

test('a missing import is caught', () => {
  const found = undefinedNames(['scripts/rules/fixtures/missing-import.mjs']);
  assert.equal(found.length, 1);
  assert.match(found[0], /whenFields/);
});
