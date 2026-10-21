import test from 'node:test';
import assert from 'node:assert/strict';
import {editPlan, localDay} from './planner-state.mjs';
import {reviewSummary, reviewWeek, markAchieved} from './review-state.mjs';
import {seedStore} from '../scripts/gauntlet/seed.mjs';
import {SWIPE_COMMIT, SWIPE_LOCK, lockAxis} from './task-swipe.mjs';
import {swipeVerdict, deckOf, SWIPE_VERDICTS, DECK_VERDICTS} from './review-deck.mjs';

test('a swipe past the commit distance gives the verdict; a short drag springs back', () => {
  assert.equal(swipeVerdict(SWIPE_COMMIT), 'achieved');
  assert.equal(swipeVerdict(160), 'achieved');
  assert.equal(swipeVerdict(-SWIPE_COMMIT), 'notyet');
  for (const dx of [0, 40, -40, SWIPE_COMMIT - 1, 1 - SWIPE_COMMIT]) assert.equal(swipeVerdict(dx), null);
  assert.deepEqual(SWIPE_VERDICTS, {right: 'achieved', left: 'notyet'});
  assert.deepEqual(DECK_VERDICTS.map(([value, label]) => [value, label]), [['notyet', 'Not yet'], ['partly', 'Partly'], ['achieved', 'Achieved']]);
});

test('the card locks to one axis after 8px, as task rows do', () => {
  assert.equal(SWIPE_LOCK, 8);
  assert.equal(lockAxis(7, 0), null);
  assert.equal(lockAxis(12, 2), 'x');
  assert.equal(lockAxis(2, 12), 'y');
});

test('a verdict takes the card off the deck and Undo brings it back', () => {
  const now = new Date();
  const {data} = seedStore(now);
  const week = reviewWeek(localDay(now));
  const deck = () => deckOf(reviewSummary(data, week, now).results.filter(r => !r.running));
  const before = deck().map(r => r.blockId);
  assert.ok(before.length >= 2, 'the sample week has Results to judge');
  const {lastWeek} = reviewSummary(data, week, now);
  markAchieved(data, before[0], {achieved: true, week: lastWeek, verdict: 'achieved'});
  assert.deepEqual(deck().map(r => r.blockId), before.slice(1));
  markAchieved(data, before[1], {achieved: false, week: lastWeek, verdict: 'partly'});
  assert.deepEqual(deck().map(r => r.blockId), before.slice(2));
  editPlan(data, {type: 'undo'});
  assert.deepEqual(deck().map(r => r.blockId), before.slice(1), 'Undo brings back the card just judged');
  assert.equal(deck()[0].blockId, before[1], 'and it is the top card again');
});
