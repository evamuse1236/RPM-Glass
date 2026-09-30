import {automationPreview} from './automation-preview-ui.mjs';
const el=(tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const button=(label,detail,value,action)=>{const node=el('button','settings-row');node.type='button';node.dataset.action=action;const copy=el('span','settings-copy');copy.append(el('strong','',label));if(detail)copy.append(el('small','',detail));if(value)copy.append(el('small','settings-value',value));node.append(copy);return node;};
const section=(title,id)=>{const node=el('section','settings-group');node.dataset.section=id;const heading=el('h2','',title);node.append(heading);return node;};
const safeScale=value=>Math.max(80,Math.min(160,Number.isInteger(value)?value:100));
export const settingsSectionAction=section=>{switch(section){case 'alarm_sound':return 'choose_alarm';case 'reminder_sound':return 'reminder_sound';case 'ai_connection':return 'connect_key';case 'notifications':return 'notifications';case 'exact_alarms':return 'exact_alarms';default:return null;}};
export const captureModeSetting=()=> 'glass';

/** Mount Settings as a destination inside PlannerActivity's existing workspace. */
export function mountSettings(api,host,options={}){
  const native=typeof api==='function'?api:(action,payload={})=>api.native(action,payload);
  let state=null,destroyed=false,request=0,noticeText='',noticeError=false,openedSection=false;
  const onRefresh=()=>refresh();
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();handleBack();}};

  function announce(value,error=false){noticeText=value??'';noticeError=error;const notice=host.querySelector('.settings-notice');if(notice){notice.textContent=noticeText;notice.classList.toggle('error',noticeError);notice.hidden=!noticeText;}}
  function settingRow(group,label,detail,value,action){const row=button(label,detail,value,action);row.addEventListener('click',()=>act(action));group.append(row);return row;}
  function slider(group,label,detail,value,min,max,action,preview=false){
    const wrap=el('div','settings-slider');wrap.dataset.action=action;const head=el('div','settings-slider-head');head.append(el('label','',label),el('output','settings-value',value+'%'));const input=el('input');input.type='range';input.min=String(min);input.max=String(max);input.step='1';input.value=String(value);input.setAttribute('aria-label',label);const note=el('small','',detail);wrap.append(head,input,note);
    let sample=null;if(preview){sample=el('p','widget-text-preview','A clear next action');sample.style.fontSize=(value/100)+'em';sample.setAttribute('aria-label','Widget text size preview');wrap.append(sample);}
    input.addEventListener('input',()=>{head.querySelector('output').textContent=input.value+'%';if(sample)sample.style.fontSize=(Number(input.value)/100)+'em';});
    input.addEventListener('change',()=>act(action,{value:Number(input.value)}));group.append(wrap);
  }
  function render(){
    if(destroyed||!state)return;const scroll=host.scrollTop,focus=document.activeElement?.dataset?.action;
    const page=el('div','settings-page');page.setAttribute('aria-label','Settings');
    const header=el('header','settings-header');const back=el('button','icon','←');back.type='button';back.setAttribute('aria-label','Back');back.addEventListener('click',handleBack);header.append(back,el('h1','','Settings'));page.append(header);
    const notice=el('p','settings-notice',noticeText);notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=!noticeText;notice.classList.toggle('error',noticeError);page.append(notice);

    const sounds=section('Sounds & alerts','sounds');
    settingRow(sounds,'Alarm sound','Ringing alarms use alarm volume',state.alarmSound,'choose_alarm');
    settingRow(sounds,state.previewing?'Stop alarm preview':'Preview alarm sound','Plays for 5 seconds at alarm volume',state.previewing?'Playing':'','preview_alarm');
    settingRow(sounds,'Reminder sound','Android notification channel',state.reminderSound,'reminder_sound');page.append(sounds);

    const appearance=section('Widgets','appearance'),textScale=safeScale(state.widgetTextScale);
    slider(appearance,'Widget text size','Relative to your Android system font size. The planner keeps its system size.',textScale,80,160,'set_widget_text_scale',true);
    page.append(appearance);

    const launcher=section('Floating butterfly','launcher');
    if(!state.overlayAllowed)settingRow(launcher,'Allow floating butterfly','Open RPM over your other apps','Permission needed','overlay_permission');
    else {const control=settingRow(launcher,'Floating butterfly','Open Capture over your other apps',state.launcherRunning?'On':'Off',state.launcherRunning?'hide_butterfly':'show_butterfly');control.setAttribute('role','switch');control.setAttribute('aria-checked',String(!!state.launcherRunning));}
    appearance.append(...[...launcher.children].slice(1));

    const alerts=section('Phone alerts','alerts');
    settingRow(alerts,'Notifications','Required for reminders and ringing alarms',state.notificationsAllowed?'Allowed':'Permission needed','notifications');
    settingRow(alerts,'Exact alarms','Required for alarms at the chosen time',state.exactAlarmsAllowed?'Allowed':'Permission needed','exact_alarms');
    if(state.fullScreenSupported)settingRow(alerts,'Lock-screen alarms','Controls full-screen ringing alerts',state.fullScreenAllowed?'Allowed':'Permission needed','full_screen_alarms');
    settingRow(alerts,'Check saved alerts','Retry scheduling after permission changes','','check_alerts');alerts.append(el('p','settings-note','Android battery restrictions can delay reminders. Keep RPM installed for saved alarms to ring.'));sounds.append(...[...alerts.children].slice(1));

    const ai=section('Account & backup','ai');
    settingRow(ai,state.aiConnected?'Replace AI key':'Connect AI key','OpenRouter · Luna chat + review-only Jev sorting',state.aiConnected?'Connected':'Not connected','connect_key');
    if(state.aiConnected)settingRow(ai,'Remove AI key','Plans and conversations stay on this phone','','remove_key');page.append(ai);

    const context=section('Context & history','context-history');
    settingRow(context,'Import context copy','Backs up this phone first; imported alerts stay off','','import_context');
    settingRow(context,'Export context','Save conversations and plans as a personal JSON file','','export_context');
    settingRow(context,'Restore a backup','Pre-import copies saved privately on this phone',state.backupCount?String(state.backupCount):'None','restore_backup');
    settingRow(context,'Earlier RPM screens','Open the original planner','','earlier_screens');context.append(el('p','settings-note','Plans stay on this phone. Relevant context goes to OpenRouter when you chat; connected diagnostics upload console output and error details.'));ai.append(...[...context.children].slice(1));

    const diagnostics=section('Diagnostics','diagnostics'),log=state.diagnostics??{};
    diagnostics.append(el('p','settings-note','Full app console output, errors and operation records may include capture content. Connected logs are private and expire after 14 days. Credentials are redacted.'));
    if(log.connected){
      const last=log.lastUpload?new Date(log.lastUpload).toLocaleString():'No upload yet';
      diagnostics.append(el('p','settings-note',`${log.message??'Connected'} · ${log.queued??0} queued · ${last}`));
      if(log.endpoint)diagnostics.append(el('p','settings-note',log.endpoint));
      if(log.dropped||log.rejected)diagnostics.append(el('p','settings-note',`${(log.dropped??0)+(log.rejected??0)} records lost to queue or capture limits.`));
      if(log.authError)settingRow(diagnostics,'Pair diagnostics again','The previous connection was revoked','','diagnostics_connect');
      else settingRow(diagnostics,log.paused?'Resume logging':'Pause logging','Controls capture and automatic upload',log.enabled?'On':'Paused',log.paused?'diagnostics_resume':'diagnostics_pause');
      if(log.enabled)settingRow(diagnostics,'Upload queued logs','Requires an internet connection','','diagnostics_upload');
      settingRow(diagnostics,'Disconnect diagnostics','Clears queued logs on this phone','','diagnostics_disconnect');
    }else settingRow(diagnostics,'Connect diagnostics','Use a code from your private RPM database','Not connected','diagnostics_connect');
    diagnostics.append(el('p','settings-note','Captures app console channels, not the phone’s system log. Offline storage holds up to 2,000 records or 2 MB; oversized records are truncated.'));page.append(diagnostics);

    const about=section('About','about');about.append(el('p','settings-note','RPM · Result, Purpose, Plan'),el('p','settings-note','Capture saves your words and asks before adding tasks or blocks.'));const previews=el('details');previews.append(el('summary','','Automation previews'),automationPreview());about.append(previews);page.append(about);
    if(state.working)page.querySelectorAll('button,input').forEach(node=>node.disabled=true);
    host.replaceChildren(page);host.scrollTop=scroll;if(focus)host.querySelector(`[data-action="${focus}"]`)?.focus({preventScroll:true});
    const sectionName=options.section==='import_export'?'context-history':options.section;
    if(sectionName&&!settingsSectionAction(sectionName))host.querySelector(`[data-section="${sectionName}"]`)?.scrollIntoView({block:'start'});
  }

  function loadError(message){const page=el('div','settings-page'),header=el('header','settings-header');header.append(el('h1','','Settings'));const problem=el('div','settings-load-error');problem.setAttribute('role','alert');problem.append(el('h2','','Settings unavailable'),el('p','error',message),el('button','secondary','Try again'));problem.querySelector('button').type='button';problem.querySelector('button').addEventListener('click',()=>{host.replaceChildren(el('p','settings-loading muted','Loading settings…'));refresh();});page.append(header,problem);host.replaceChildren(page);}
  async function refresh(){const current=++request;try{const next=await native('appSettings',{});if(destroyed||current!==request)return;const changed=JSON.stringify(state)!==JSON.stringify(next);state=next;if(changed)render();if(!openedSection){openedSection=true;const initial=settingsSectionAction(options.section);if(initial)await act(initial);}}catch(error){if(destroyed)return;const message=error.message||'Settings could not be refreshed.';if(state)announce(message,true);else loadError(message);}}
  async function act(action,payload={}){if(destroyed)return;try{host.querySelectorAll('button,input').forEach(node=>node.disabled=true);if(['capture_glass','capture_classic'].includes(action)){const mode=action==='capture_glass'?'glass':'classic';localStorage.setItem('rpm-capture-mode',mode);window.dispatchEvent(new Event('rpm-capture-mode'));noticeText=mode==='glass'?'Glass review selected.':'Classic assistant selected.';noticeError=false;render();return;}const next=await native('settingsAction',{action,...payload});if(destroyed)return;state=next;noticeText=next.message??'';noticeError=false;render();}catch(error){if(!destroyed){render();announce(error.message||'That setting could not be changed.',true);}}}
  function handleBack(){if(destroyed)return false;if(options.onBack)options.onBack();else if(state?.previewing)native('settingsAction',{action:'stop_preview'}).catch(()=>{});return true;}
  function destroy(){if(destroyed)return;destroyed=true;window.removeEventListener('rpm-settings-refresh',onRefresh);window.removeEventListener('keydown',onKey);if(state?.previewing)native('settingsAction',{action:'stop_preview'}).catch(()=>{});host.replaceChildren();}

  host.replaceChildren(el('p','settings-loading muted','Loading settings…'));window.addEventListener('rpm-settings-refresh',onRefresh);window.addEventListener('keydown',onKey);refresh();
  return {refresh,destroy,handleBack};
}
