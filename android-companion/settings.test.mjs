import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsSectionAction,captureModeSetting} from './settings.mjs';

test('direct settings destinations map only to native person-controlled flows',()=>{
  assert.deepEqual(['alarm_sound','reminder_sound','ai_connection','notifications','exact_alarms'].map(settingsSectionAction),['choose_alarm','reminder_sound','connect_key','notifications','exact_alarms']);
  for(const section of ['settings','import_export','unknown','__proto__'])assert.equal(settingsSectionAction(section),null);
});

test('Classic is the safe default and Glass remains explicitly selectable',()=>{
 const values=new Map();const storage={getItem:key=>values.get(key)??null};
 assert.equal(captureModeSetting(storage),'classic');values.set('rpm-capture-mode','glass');assert.equal(captureModeSetting(storage),'glass');values.set('rpm-capture-mode','unexpected');assert.equal(captureModeSetting(storage),'classic');
});
