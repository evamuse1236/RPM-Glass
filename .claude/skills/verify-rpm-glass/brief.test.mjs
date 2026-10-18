import test from 'node:test';
import assert from 'node:assert/strict';
import {briefUi} from './lib/brief.mjs';

test('brief ui prints role, quoted name, states and off-screen markers on one line per element', () => {
  const snapshot = {ok: true, title: 'Planner', elements: [
    {role: 'button', name: 'Blocks', inView: true, state: {pressed: 'true'}},
    {role: 'combobox', name: 'Add a task to the Plan', inView: false, state: {focused: 'true', value: 'Email "Prof."\nRao'}},
    {role: 'button', name: 'Send', state: {disabled: 'false'}},
    {role: 'textbox', name: 'Purpose'},
  ]};
  const before = JSON.stringify(snapshot);
  assert.equal(briefUi(snapshot), [
    'button "Blocks" [pressed=true]',
    'combobox "Add a task to the Plan" [focused=true, value="Email \\"Prof.\\"\\nRao"] (off-screen)',
    'button "Send" [disabled=false]',
    'textbox "Purpose"',
  ].join('\n'));
  assert.equal(JSON.stringify(snapshot), before, 'Formatting must leave the default JSON snapshot unchanged.');
});

test('brief ui escapes names, handles empty screens and falls back to native nodes', () => {
  assert.equal(briefUi({elements: []}), '');
  assert.equal(briefUi({elements: [{role: 'text', name: 'One\n"Two"'}]}), 'text "One\\n\\"Two\\""');
  assert.equal(briefUi({nodes: [{cls: 'android.widget.Button', text: 'Wait', clickable: true},
    {cls: 'android.view.View', text: '', desc: 'Back'}]}),
  'android.widget.Button "Wait" [clickable=true]\nandroid.view.View "Back"');
});
