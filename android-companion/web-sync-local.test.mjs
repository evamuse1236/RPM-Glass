import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Convex before 1.48 could not bundle a Node action that imports JSON with an import attribute (records.json).
test('Convex is pinned at 1.48.0 or later, so deploys bundle JSON imports with no local patch', () => {
  const pinned = JSON.parse(readFileSync('package.json', 'utf8')).dependencies?.convex ?? JSON.parse(readFileSync('package.json', 'utf8')).devDependencies?.convex;
  const [major, minor] = pinned.replace(/^[^\d]*/, '').split('.').map(Number);
  assert.ok(major > 1 || major === 1 && minor >= 48, `convex ${pinned}`);
});
