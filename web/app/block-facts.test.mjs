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

for (const wide of [false, true]) {
  test(`${wide ? 'on wide' : 'on the phone'} a Block card puts the deadline alone, then tasks done and the Musts left in Block detail's words`, () => {
    const [due, progress, ...rest] = facts(wide);
    assert.match(due, /^Overdue since [^·]*$/);
    assert.match(progress, /^0 of 3 done · .*1\sh of Musts left$/);
    assert.deepEqual(rest, []);
  });
}
