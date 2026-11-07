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

test('a blocked alarm permission is said once: "N off" on its home row, no banner, and Permissions first on its page with an Allow',async()=>{
  const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:false});
  assert.deepEqual(home.labels,['Appearance','Notch & widgets','Alarms & reminders','Voice','AI keys','Sync & backup','Diagnostics','About']);
  assert.ok(!home.rows.some(r=>r.dataset.tone==='error'),'no red banner row above the list');
  const row=home.rows.findLast(r=>r.dataset.action==='open_alerts');
  assert.equal(row.dataset.tone,'warn');
  assert.equal(row.querySelector('.settings-value').textContent,'1 off');
  const both=await mounted({});
  assert.equal(both.rows.findLast(r=>r.dataset.action==='open_alerts').querySelector('.settings-value').textContent,'2 off');
  const fine=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true});
  assert.equal(fine.rows.findLast(r=>r.dataset.action==='open_alerts').dataset.tone,undefined);
  row.click();
  assert.deepEqual(home.opened,['alerts']);
  const alerts=await mounted({notificationsAllowed:true,exactAlarmsAllowed:false},'alerts');
  assert.deepEqual(alerts.labels.slice(0,2),['Notifications','Exact alarms'],'permissions lead the page');
  assert.ok(!alerts.host.querySelector('.settings-caption')&&!alerts.host.querySelector('.settings-detail'),'no description lines or footnote');
  const exact=alerts.rows.find(r=>r.dataset.action==='exact_alarms');
  assert.equal(exact.dataset.tone,'error');
  assert.equal(exact.querySelector('.settings-value').textContent,'Allow');
});

test('remove rows show only for connected keys, last, in red',async()=>{
  const none=await mounted({},'ai');
  assert.ok(!none.rows.some(r=>/^remove_/.test(r.dataset.action)));
  const one=await mounted({claudeKey:true},'ai');
  const last=one.rows.at(-1);
  assert.equal(last.dataset.action,'remove_claude_key');
  assert.equal(last.dataset.tone,'error');
});
