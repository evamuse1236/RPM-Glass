import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from '../../android-companion/fake-dom.mjs';
import {planner} from '../../android-companion/planner-state.mjs';
import {seed} from '../../android-companion/review-fixtures.mjs';

installFakeDom();
const {blockCard} = await import('../../android-companion/planner/blocks.mjs');

const facts = wide => {
  const {d, home} = seed();
  const block = planner(d).blocks.find(b => b.id === home);
  const app = {data: () => d, tone: () => 'a', blockArea: () => null, openBlock() {}, api: {wide: () => wide}};
  const main = blockCard(app, block, {project: false}).children.find(c => c.className.includes('card-main'));
  return main.children.filter(c => c.className.includes('card-facts')).map(c => c.textContent);
};

test('on wide a Block card puts "N of M done" on its own line, so it never wraps alone after the Musts', () => {
  const [first, done] = facts(true);
  assert.match(first, /^Overdue since .*1\sh$/);
  assert.equal(done, '0 of 3 done');
});

test('on the phone a Block card keeps one facts line', () => {
  const lines = facts(false);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /1\sh · 0 of 3 done$/);
});
