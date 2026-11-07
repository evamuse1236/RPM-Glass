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
  test(`${wide ? 'on wide' : 'on the phone'} a Block card says the deadline on one line, with tasks done as a ring and "0/3" at its end; the title has the row to itself; the Musts' time is Block detail's`, () => {
    const main = card(wide);
    assert.ok(main.children.some(c => c.className === 'card-title'), 'the title is its own line, with no ring beside it');
    const [line, ...rest] = main.children.filter(c => c.className.includes('card-facts'));
    assert.deepEqual(rest, []);
    const [when, tally] = line.children;
    assert.match(when.textContent, /^Overdue since [^·]*$/);
    assert.doesNotMatch(line.textContent, /done|Musts/);
    assert.equal(tally.className, 'card-tally');
    const ring = tally.children.find(c => c.getAttribute?.('role') === 'progressbar');
    assert.equal(ring.getAttribute('aria-label'), '0 of 3 tasks done');
    assert.equal(tally.textContent, '0/3');
  });
}
