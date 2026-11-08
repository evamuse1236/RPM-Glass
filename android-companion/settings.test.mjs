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

test('a blocked alarm permission shows one red card, wholly one button whose Allow starts the fix, and the Alarms row says it no second time',async()=>{
  const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:false});
  const alert=home.host.querySelector('.settings-alert');
  assert.equal(alert.querySelector('.settings-label').textContent,'Alarms may not ring');
  assert.equal(alert.querySelector('.settings-detail').textContent,'Exact alarms are off');
  assert.equal(alert.tagName.toLowerCase(),'button','a tap anywhere on the card starts the fix');
  assert.equal(alert.querySelector('.settings-alert-action').textContent,'Allow');
  assert.equal(alert.dataset.action,'exact_alarms');
  assert.equal(alert.getAttribute('aria-label'),'Allow exact alarms');
  assert.equal(alert.getAttribute('aria-description'),'Alarms may not ring. Exact alarms are off');
  assert.equal(alert.querySelector('.ms:not(.settings-icon .ms)'),null);
  const row=home.rows.find(r=>r.dataset.action==='open_alerts');
  assert.equal(row.dataset.tone,undefined);
  assert.equal(row.querySelector('.settings-value'),null,'the card says the alarms are blocked; the row does not repeat it');
  const both=await mounted({});
  assert.equal(both.host.querySelector('.settings-alert .settings-detail').textContent,'Notifications and alarms are off');
  assert.equal(both.host.querySelector('.settings-alert').dataset.action,'notifications');
  const fine=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true});
  assert.equal(fine.host.querySelector('.settings-alert'),null);
  assert.equal(fine.rows.find(r=>r.dataset.action==='open_alerts').querySelector('.settings-value').textContent,'On');
  const alerts=await mounted({notificationsAllowed:true,exactAlarmsAllowed:false},'alerts');
  assert.deepEqual([...alerts.host.querySelectorAll('.settings-group')].map(g=>g.dataset.section),['permissions','sounds']);
  const exact=alerts.rows.find(r=>r.dataset.action==='exact_alarms');
  assert.equal(exact.dataset.tone,'error');
  assert.equal(exact.querySelector('.settings-value').textContent,'Allow');
  assert.equal(alerts.rows.find(r=>r.dataset.action==='notifications').querySelector('.settings-value').textContent,'Allowed');
});

test('every row on the Alarms page ends in one style: a value with a chevron or one primary action word',async()=>{
  const alerts=await mounted({notificationsAllowed:false,exactAlarmsAllowed:false},'alerts');
  const word=action=>alerts.rows.find(r=>r.dataset.action===action).querySelector('.settings-act')?.textContent;
  assert.equal(word('check_alerts'),'Check');
  assert.equal(word('preview_alarm'),'Play');
  assert.ok(!alerts.rows.some(r=>r.querySelector('.settings-trail')));
  const classes=action=>alerts.rows.find(r=>r.dataset.action===action).querySelector('.settings-act').className;
  assert.deepEqual([classes('check_alerts'),classes('preview_alarm')],['settings-act','settings-act'],'Check and Play are action words like Allow, never value-grey');
});

test('a missing key reads Not set on its own row, and Voice says what the mic uses without one',async()=>{
  const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true});
  const value=action=>home.rows.find(r=>r.dataset.action===action).querySelector('.settings-value')?.textContent;
  assert.equal(value('open_voice'),'Dictation');
  assert.equal(value('open_ai'),'Not set');
});

test('Sync & backup says whether a browser is linked, at home and on its page, never Off (backups always work)',async()=>{
  for (const [cloudSync,word] of [[false,'Not linked'],[true,'Linked']]) {
    const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true,cloudSync});
    assert.equal(home.rows.find(r=>r.dataset.action==='open_sync').querySelector('.settings-value').textContent,word);
    const sync=await mounted({cloudSync},'sync');
    const row=sync.rows.find(r=>r.dataset.action==='cloud_web');
    assert.equal(row.querySelector('.settings-label').textContent,'Plan in a browser');
    assert.equal(row.querySelector('.settings-value').textContent,word);
    assert.equal(row.querySelector('.settings-detail'),null);
  }
});

test('Restore a backup rests dimmed with None yet until a backup exists, then opens with its count',async()=>{
  const none=(await mounted({},'sync')).rows.find(r=>r.dataset.action==='restore_backup');
  assert.ok(none.disabled&&none.dataset.idle,'nothing to restore yet');
  assert.equal(none.querySelector('.settings-value').textContent,'None yet');
  const two=(await mounted({backupCount:2},'sync')).rows.find(r=>r.dataset.action==='restore_backup');
  assert.ok(!two.disabled&&!two.dataset.idle);
  assert.equal(two.querySelector('.settings-value').textContent,'2');
  assert.ok([...two.querySelectorAll('.ms')].some(icon=>icon.textContent==='chevron_right'));
});

test('remove rows show only for connected keys, last, in red',async()=>{
  const none=await mounted({},'ai');
  assert.ok(!none.rows.some(r=>/^remove_/.test(r.dataset.action)));
  const one=await mounted({claudeKey:true},'ai');
  const last=one.rows.at(-1);
  assert.equal(last.dataset.action,'remove_claude_key');
  assert.equal(last.dataset.tone,'error');
});

test('every key lives once, in AI keys; Voice without a Gemini key starts with a Gemini key row that opens AI keys and dims the voice rows with their starting values',async()=>{
  const voice=await mounted({},'voice');
  assert.equal(voice.host.querySelector('.settings-caption'),null,'no footnote: the way to a key is the first row');
  assert.deepEqual(voice.labels,['Gemini key','Voice','Persona']);
  const key=voice.rows[0];
  assert.equal(key.dataset.action,'open_ai','the row only opens AI keys; the key is set once, there');
  assert.equal(key.querySelector('.settings-value').textContent,'Add');
  assert.match(key.querySelector('.settings-detail').textContent,/Android dictation/);
  assert.ok([...key.querySelectorAll('.ms')].some(icon=>icon.textContent==='chevron_right'));
  assert.ok(!voice.rows.some(r=>/gemini_key$/.test(r.dataset.action)));
  key.click();
  assert.deepEqual(voice.opened,['ai']);
  for (const [action,value] of [['voice_name','Default'],['voice_persona','Not set']]) {
    const idle=voice.rows.find(r=>r.dataset.action===action);
    assert.ok(idle.disabled&&idle.dataset.idle,'a voice choice without a key cannot be opened');
    assert.ok(![...idle.querySelectorAll('.ms')].some(icon=>icon.textContent==='chevron_right'));
    assert.equal(idle.querySelector('.settings-value').textContent,value,'a dimmed row shows what a key would start with');
  }
  const keyed=await mounted({hasGeminiKey:true},'voice');
  assert.deepEqual(keyed.labels,['Voice','Persona']);
  assert.ok(!keyed.rows.some(r=>r.disabled||r.dataset.action==='open_ai'));
  const ai=await mounted({hasGeminiKey:true},'ai');
  assert.ok(ai.rows.some(r=>r.dataset.action==='connect_gemini_key'));
  assert.equal(ai.rows.at(-1).dataset.action,'remove_gemini_key');
  const home=await mounted({notificationsAllowed:true,exactAlarmsAllowed:true,hasGeminiKey:true});
  assert.equal(home.rows.find(r=>r.dataset.action==='open_ai').querySelector('.settings-value').textContent,'Gemini');
});
