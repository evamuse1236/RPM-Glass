import test from 'node:test';
import assert from 'node:assert/strict';
import {wordStarts, wordFirst, searchOrder} from './planner/search.mjs';

test('a search hit counts only where the query starts a word, so "rm" is never bolded inside "format"', () => {
  assert.deepEqual(wordStarts('Check the upload format', 'rm'), []);
  assert.deepEqual(wordStarts('Term 1 coursework', 'rm'), []);
  assert.deepEqual(wordStarts('Sit RM Quiz I', 'rm'), [4]);
  assert.deepEqual(wordStarts('rm-notes and (RM) recap', 'rm'), [0, 14]);
  assert.deepEqual(wordStarts('anything', ''), []);
});

test('word-start matches lead within a group and every match stays listed', () => {
  const items = [{title: 'Check the upload format'}, {title: 'Buy a notebook for RM'}, {title: 'Term 1 coursework'}, {title: 'RM quiz'}];
  assert.deepEqual(wordFirst(items, 'rm').map(item => item.title),
    ['Buy a notebook for RM', 'RM quiz', 'Check the upload format', 'Term 1 coursework']);
});

test('search order puts open tasks before done ones and Musts first', () => {
  const rows = [{title: 'B', done: true}, {title: 'C'}, {title: 'A', must: true}];
  assert.deepEqual(rows.sort(searchOrder).map(row => row.title), ['A', 'C', 'B']);
});
