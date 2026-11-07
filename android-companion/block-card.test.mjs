import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {planner} from './planner-state.mjs';
import {seed, block} from './review-fixtures.mjs';

installFakeDom();
const {blockCard} = await import('./planner/blocks.mjs');

test('a Block with an empty Plan ends its card in an action: "Add the first task" opens quick add filed in that Block', () => {
  const {d} = seed();
  const id = block(d, {title: 'District profile ready', purpose: 'Real data, not guesses'});
  const empty = planner(d).blocks.find(b => b.id === id);
  const added = [];
  const app = {data: () => d, tone: () => 'a', blockArea: () => null, openBlock() {}, actions: {addTask: o => added.push(o)}};
  const card = blockCard(app, empty, {project: false});
  const main = card.children.find(c => c.className.includes('card-main'));
  assert.doesNotMatch(main.textContent, /No tasks in the Plan yet/, 'no dead-end words on the card');
  assert.match(main.getAttribute('aria-label'), /No tasks in the Plan yet/, 'a screen reader still hears where it stands');
  const last = card.children.at(-1);
  assert.equal(last.className, 'next-task first-task');
  assert.match(last.textContent, /Add the first task/);
  last.children[0].click();
  assert.deepEqual(added, [{blockId: id}]);
});
