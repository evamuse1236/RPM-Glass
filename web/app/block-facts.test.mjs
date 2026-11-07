import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from '../../android-companion/fake-dom.mjs';
import {planner} from '../../android-companion/planner-state.mjs';
import {seed} from '../../android-companion/review-fixtures.mjs';

installFakeDom();
const {blockCard} = await import('../../android-companion/planner/blocks.mjs');

const card = wide => {
  const {d, home} = seed();
  const block = planner(d).blocks.find(b => b.id === home);
  const app = {data: () => d, tone: () => 'a', blockArea: () => null, openBlock() {}, api: {wide: () => wide}};
  return blockCard(app, block, {project: false}).children.find(c => c.className.includes('card-main'));
};

for (const wide of [false, true]) {
  test(`${wide ? 'on wide' : 'on the phone'} a Block card says the deadline on one line and tasks done as a ring on its title row; the Musts' time is Block detail's`, () => {
    const main = card(wide);
    const [line, ...rest] = main.children.filter(c => c.className.includes('card-facts')).map(c => c.textContent);
    assert.match(line, /^Overdue since [^·]*$/);
    assert.doesNotMatch(line, /done|Musts/);
    assert.deepEqual(rest, []);
    const head = main.children.find(c => c.className.includes('card-head'));
    const ring = head.children.find(c => c.getAttribute?.('role') === 'progressbar');
    assert.equal(ring.getAttribute('aria-label'), '0 of 3 tasks done');
  });
}
