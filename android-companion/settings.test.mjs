import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsSectionAction} from './settings.mjs';

test('direct settings destinations map only to native person-controlled flows',()=>{
  assert.deepEqual(['alarm_sound','reminder_sound','ai_connection','notifications','exact_alarms'].map(settingsSectionAction),['choose_alarm','reminder_sound','connect_key','notifications','exact_alarms']);
  for(const section of ['settings','import_export','unknown','__proto__'])assert.equal(settingsSectionAction(section),null);
});

test('every deep-link section opens the page that holds it; unknown ones open the home list',async()=>{
  const {settingsPageFor,SETTINGS_PAGES}=await import('./settings.mjs');
  for(const [section,page] of Object.entries({alarm_sound:'alerts',exact_alarms:'alerts',ai_connection:'ai',import_export:'sync',
    'context-history':'sync','planner-appearance':'appearance',diagnostics:'diagnostics',voice:'voice'}))assert.equal(settingsPageFor(section),page,section);
  for(const section of ['settings',null,'unknown','__proto__'])assert.equal(settingsPageFor(section),null);
  for(const page of Object.keys(SETTINGS_PAGES))assert.equal(settingsPageFor(page),page);
});

async function mounted(state,page=null){
  const {installFakeDom,FakeElement}=await import('./fake-dom.mjs');
  const doc=installFakeDom();
  doc.activeElement=null;doc.body=new FakeElement('body');
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const {mountSettings}=await import('./settings.mjs');
  const host=new FakeElement('div'),opened=[];
  mountSettings(async action=>action==='appSettings'?state:state,host,{page,openPage:p=>opened.push(p)});
  await new Promise(r=>setTimeout(r,0));
  const rows=[...host.querySelectorAll('.settings-row')];
  return {host,opened,rows,labels:rows.map(r=>r.querySelector('.settings-label')?.textContent)};
}

test('home is one short list of pages; each row pushes its page',async()=>{
  const {rows,labels,opened}=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true});
  assert.deepEqual(labels,['Appearance','Notch & widgets','Alarms & reminders','Voice','AI keys','Sync & backup','Diagnostics','About']);
  rows[2].click();
  assert.deepEqual(opened,['alerts']);
});

test('a blocked alarm permission is said once: one red row above the list names what to allow, and its page lists Permissions first with a red Allow',async()=>{
  const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:false});
  assert.equal(home.labels[0],'Alarms may not ring');
  assert.equal(home.rows[0].dataset.tone,'error');
  assert.equal(home.rows[0].querySelector('.settings-detail').textContent,'Allow exact alarms so they ring on time');
  const row=home.rows.findLast(r=>r.dataset.action==='open_alerts');
  assert.equal(row.dataset.tone,undefined);
  assert.equal(row.querySelector('.settings-value'),null);
  const both=await mounted({});
  assert.equal(both.rows[0].querySelector('.settings-detail').textContent,'Allow notifications and exact alarms so they ring on time');
  const fine=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true});
  assert.notEqual(fine.labels[0],'Alarms may not ring');
  home.rows[0].click();
  assert.deepEqual(home.opened,['alerts']);
  const alerts=await mounted({notificationsAllowed:true,exactAlarmsAllowed:false},'alerts');
  assert.deepEqual([...alerts.host.querySelectorAll('.settings-group')].map(g=>g.dataset.section),['permissions','sounds']);
  const exact=alerts.rows.find(r=>r.dataset.action==='exact_alarms');
  assert.equal(exact.dataset.tone,'error');
  assert.equal(exact.querySelector('.settings-value').textContent,'Allow');
});

test('a missing key reads Not set on its own row, and Voice says what the mic uses without one',async()=>{
  const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true});
  const value=action=>home.rows.find(r=>r.dataset.action===action).querySelector('.settings-value')?.textContent;
  assert.equal(value('open_voice'),'Dictation');
  assert.equal(value('open_ai'),'Not set');
});

test('remove rows show only for connected keys, last, in red',async()=>{
  const none=await mounted({},'ai');
  assert.ok(!none.rows.some(r=>/^remove_/.test(r.dataset.action)));
  const one=await mounted({claudeKey:true},'ai');
  const last=one.rows.at(-1);
  assert.equal(last.dataset.action,'remove_claude_key');
  assert.equal(last.dataset.tone,'error');
});
