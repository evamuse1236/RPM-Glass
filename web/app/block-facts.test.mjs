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
  test(`${wide ? 'on wide' : 'on the phone'} a Block card says where it stands on one line: the deadline, then tasks done; the Musts' time is Block detail's`, () => {
    const [line, ...rest] = facts(wide);
    assert.match(line, /^Overdue since [^·]* · 0 of 3 done$/);
    assert.doesNotMatch(line, /Musts/);
    assert.deepEqual(rest, []);
  });
}
