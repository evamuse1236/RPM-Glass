const el=(tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const button=(label,detail,value,action)=>{const node=el('button','settings-row');node.type='button';node.dataset.action=action;const copy=el('span','settings-copy');copy.append(el('strong','',label));if(detail)copy.append(el('small','',detail));node.append(copy,el('span','settings-value',value??''));return node;};
const section=(title,id)=>{const node=el('section','settings-group');node.dataset.section=id;const heading=el('h2','',title);node.append(heading);return node;};
const safeScale=value=>Math.max(80,Math.min(160,Number.isInteger(value)?value:100));
export const settingsSectionAction=section=>{switch(section){case 'alarm_sound':return 'choose_alarm';case 'reminder_sound':return 'reminder_sound';case 'ai_connection':return 'connect_key';case 'notifications':return 'notifications';case 'exact_alarms':return 'exact_alarms';default:return null;}};
export const captureModeSetting=storage=>storage.getItem('rpm-capture-mode')==='glass'?'glass':'classic';

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
    const header=el('header','settings-header');header.append(el('h1','','Settings'),el('p','muted','Sounds, widget appearance, alerts, connection and private backups.'));page.append(header);
    const notice=el('p','settings-notice',noticeText);notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=!noticeText;notice.classList.toggle('error',noticeError);page.append(notice);

    const sounds=section('Sounds','sounds');
    settingRow(sounds,'Alarm sound','Ringing alarms use alarm volume',state.alarmSound,'choose_alarm');
    settingRow(sounds,state.previewing?'Stop alarm preview':'Preview alarm sound','Plays for 5 seconds at alarm volume',state.previewing?'Playing':'','preview_alarm');
    settingRow(sounds,'Reminder sound','Android notification channel',state.reminderSound,'reminder_sound');page.append(sounds);

    const appearance=section('Widget appearance','appearance'),textScale=safeScale(state.widgetTextScale);
    slider(appearance,'Widget text size','Relative to your Android system font size. The planner keeps its system size.',textScale,80,160,'set_widget_text_scale',true);
    slider(appearance,'Widget transparency','Higher values show more of the app behind RPM.',Math.max(0,Math.min(70,state.transparency??28)),0,70,'set_transparency');page.append(appearance);

    const launcher=section('Floating butterfly','launcher');
    if(!state.overlayAllowed)settingRow(launcher,'Allow floating butterfly','Open RPM over your other apps','Permission needed','overlay_permission');
    else settingRow(launcher,state.launcherRunning?'Butterfly is running':'Show butterfly','Tap to chat and drag to move',state.launcherRunning?'On':'Off','show_butterfly');
    settingRow(launcher,'Hide butterfly','RPM remains available from its app icon',state.launcherRunning?'Running':'Hidden','hide_butterfly');page.append(launcher);

    const alerts=section('Phone alerts','alerts');
    settingRow(alerts,'Notifications','Required for reminders and ringing alarms',state.notificationsAllowed?'Allowed':'Permission needed','notifications');
    settingRow(alerts,'Exact alarms','Required for alarms at the chosen time',state.exactAlarmsAllowed?'Allowed':'Permission needed','exact_alarms');
    if(state.fullScreenSupported)settingRow(alerts,'Lock-screen alarms','Controls full-screen ringing alerts',state.fullScreenAllowed?'Allowed':'Permission needed','full_screen_alarms');
    settingRow(alerts,'Check saved alerts','Retry scheduling after permission changes','','check_alerts');alerts.append(el('p','settings-note','Android battery restrictions can delay reminders. Keep RPM installed for saved alarms to ring.'));page.append(alerts);

    const capture=section('Thought capture','thought-capture'),captureMode=captureModeSetting(localStorage);
    settingRow(capture,'Classic assistant','Default · includes check-ins and app actions',captureMode==='classic'?'Selected':'','capture_classic');
    settingRow(capture,'Glass review pilot','Planner changes save only after your review',captureMode==='glass'?'Selected':'','capture_glass');
    capture.append(el('p','settings-note','A failed Glass interpretation keeps the captured thought for Retry. It does not switch to Classic automatically. Use Classic for check-ins and the older app actions while Glass focuses on reviewed planner changes.'));page.append(capture);

    const ai=section('AI connection','ai');
    settingRow(ai,state.aiConnected?'Replace AI key':'Connect AI key','OpenRouter · stored securely on this phone',state.aiConnected?'Connected':'Not connected','connect_key');
    if(state.aiConnected)settingRow(ai,'Remove AI key','Plans and conversations stay on this phone','','remove_key');page.append(ai);

    const context=section('Context & history','context-history');
    settingRow(context,'Import context copy','Backs up this phone first; imported alerts stay off','','import_context');
    settingRow(context,'Export context','Save conversations and plans as a personal JSON file','','export_context');
    settingRow(context,'Restore a backup','Pre-import copies saved privately on this phone',state.backupCount?String(state.backupCount):'None','restore_backup');
    settingRow(context,'Earlier RPM screens','Open the original planner','','earlier_screens');context.append(el('p','settings-note','Saved on this phone. Relevant context goes to OpenRouter only when you chat.'));page.append(context);

    if(state.working)page.querySelectorAll('button,input').forEach(node=>node.disabled=true);
    host.replaceChildren(page);host.scrollTop=scroll;if(focus)host.querySelector(`[data-action="${focus}"]`)?.focus({preventScroll:true});
    const sectionName=options.section==='import_export'?'context-history':options.section;
    if(sectionName&&!settingsSectionAction(sectionName))host.querySelector(`[data-section="${sectionName}"]`)?.scrollIntoView({block:'start'});
  }

  function loadError(message){const page=el('div','settings-page'),header=el('header','settings-header');header.append(el('h1','','Settings'));const problem=el('div','settings-load-error');problem.setAttribute('role','alert');problem.append(el('h2','','Settings unavailable'),el('p','error',message),el('button','secondary','Try again'));problem.querySelector('button').type='button';problem.querySelector('button').addEventListener('click',()=>{host.replaceChildren(el('p','settings-loading muted','Loading settings…'));refresh();});page.append(header,problem);host.replaceChildren(page);}
  async function refresh(){const current=++request;try{const next=await native('appSettings',{});if(destroyed||current!==request)return;state=next;render();if(!openedSection){openedSection=true;const initial=settingsSectionAction(options.section);if(initial)await act(initial);}}catch(error){if(destroyed)return;const message=error.message||'Settings could not be refreshed.';if(state)announce(message,true);else loadError(message);}}
  async function act(action,payload={}){if(destroyed)return;try{host.querySelectorAll('button,input').forEach(node=>node.disabled=true);if(['capture_glass','capture_classic'].includes(action)){const mode=action==='capture_glass'?'glass':'classic';localStorage.setItem('rpm-capture-mode',mode);window.dispatchEvent(new Event('rpm-capture-mode'));noticeText=mode==='glass'?'Glass review selected.':'Classic assistant selected.';noticeError=false;render();return;}const next=await native('settingsAction',{action,...payload});if(destroyed)return;state=next;noticeText=next.message??'';noticeError=false;render();}catch(error){if(!destroyed){render();announce(error.message||'That setting could not be changed.',true);}}}
  function handleBack(){if(destroyed)return false;if(options.onBack)options.onBack();else if(state?.previewing)native('settingsAction',{action:'stop_preview'}).catch(()=>{});return true;}
  function destroy(){if(destroyed)return;destroyed=true;window.removeEventListener('rpm-settings-refresh',onRefresh);window.removeEventListener('keydown',onKey);if(state?.previewing)native('settingsAction',{action:'stop_preview'}).catch(()=>{});host.replaceChildren();}

  host.replaceChildren(el('p','settings-loading muted','Loading settings…'));window.addEventListener('rpm-settings-refresh',onRefresh);window.addEventListener('keydown',onKey);refresh();
  return {refresh,destroy,handleBack};
}
