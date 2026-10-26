import test from 'node:test';
import assert from 'node:assert/strict';
import {playMotion, stopMotion} from './motion-core.mjs';

const fakeNode = () => {
  const node = {animations: []};
  node.animate = (frames, options) => {
    let finish;
    const animation = {options, cancelled: false, finished: new Promise(resolve => { finish = resolve; }), cancel() { this.cancelled = true; }};
    animation.end = () => finish(animation);
    node.animations.push(animation);
    return animation;
  };
  return node;
};

test('stopMotion releases an end state held after the motion finished', async () => {
  const node = fakeNode();
  const leaving = playMotion(node, [{opacity: 1}, {opacity: 0}], {fill: 'forwards'});
  node.animations[0].end();
  assert.equal(await leaving, true);
  stopMotion(node);
  assert.equal(node.animations[0].cancelled, true);
});

test('a new motion on the node clears the old held end state, so a shown snackbar is not stuck faded', async () => {
  const node = fakeNode();
  const leaving = playMotion(node, [{opacity: 1}, {opacity: 0}], {fill: 'forwards'});
  node.animations[0].end(); await leaving;
  playMotion(node, [{opacity: 0}, {opacity: 1}]);
  assert.equal(node.animations[0].cancelled, true);
});

test('a motion without a held end state is not cancelled after it finishes', async () => {
  const node = fakeNode();
  const entering = playMotion(node, [{opacity: 0}, {opacity: 1}]);
  node.animations[0].end(); await entering;
  stopMotion(node);
  assert.equal(node.animations[0].cancelled, false);
});
