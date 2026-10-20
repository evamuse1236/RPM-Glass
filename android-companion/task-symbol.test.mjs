import test from 'node:test';
import assert from 'node:assert/strict';
import {taskSymbol, routineSymbol, TASK_SYMBOL, ROUTINE_SYMBOL} from './task-symbol.mjs';

test('a task takes the icon of the first matching row, by whole words', () => {
  assert.equal(taskSymbol('Group call: merge sections'), 'groups');
  assert.equal(taskSymbol('Call home'), 'call');
  assert.equal(taskSymbol('Past paper 2019, section B'), 'school');
  assert.equal(taskSymbol('Draft my section of the critical review'), 'edit_note');
  assert.equal(taskSymbol('Read 10 pages'), 'menu_book');
  assert.equal(taskSymbol('Buy a birthday card for Amma'), 'redeem');
  assert.equal(taskSymbol('Recall the plot'), TASK_SYMBOL, '"call" inside another word does not count');
  assert.equal(taskSymbol('Something else'), TASK_SYMBOL);
});

test('a routine is a sun in the morning, a moon at night, otherwise a person', () => {
  assert.equal(routineSymbol('Morning routine'), 'wb_sunny');
  assert.equal(routineSymbol('Night wind-down'), 'bedtime');
  assert.equal(routineSymbol('Stretch'), ROUTINE_SYMBOL);
});
