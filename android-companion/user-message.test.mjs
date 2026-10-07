import test from 'node:test';
import assert from 'node:assert/strict';
import {userMessage, FAULT_TEXT} from './user-message.mjs';

const quiet = fn => { const original = console.error; console.error = () => {}; try { return fn(); } finally { console.error = original; } };

test('a script fault never reaches the screen as raw text', () => {
  let fault;
  try { null.querySelectorAll('li'); } catch (error) { fault = error; }
  const shown = quiet(() => userMessage(fault));
  assert.equal(shown, FAULT_TEXT);
  assert.doesNotMatch(shown, /querySelectorAll|Cannot read|null|undefined/);
  assert.equal(quiet(() => userMessage(new ReferenceError('app is not defined'), 'That change could not be saved.')), 'That change could not be saved.');
});

test('messages written for the user pass through unchanged', () => {
  assert.equal(userMessage(new Error('Saved data changed. Reopen RPM before retrying.')), 'Saved data changed. Reopen RPM before retrying.');
  assert.equal(userMessage({message: 'The OpenRouter connection failed. Check your key and internet connection.'}), 'The OpenRouter connection failed. Check your key and internet connection.');
  assert.equal(userMessage(new Error(''), 'Could not load settings.'), 'Could not load settings.');
});
