const APPEARANCES=new Set(['system','light','dark']);
const DAY_LAYOUTS=new Set(['agenda','timeline']);
const key=name=>'rpm-clarity:'+name;
const defaultStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};

function read(storage,name,fallback){try{return storage?.getItem(key(name))??fallback;}catch{return fallback;}}
function write(storage,name,value){try{storage?.setItem(key(name),value);}catch{}}

export function clarityPreferences(storage=defaultStorage()){
  const appearance=read(storage,'appearance','system'),dayLayout=read(storage,'day-layout','agenda');
  return {
    appearance:APPEARANCES.has(appearance)?appearance:'system',
    dayLayout:DAY_LAYOUTS.has(dayLayout)?dayLayout:'agenda',
    solidNavigation:true
  };
}

export function applyClarityPreferences(preferences=clarityPreferences(),root=globalThis.document?.documentElement){
  if(!root)return preferences;
  if(preferences.appearance==='system')delete root.dataset.appearance;
  else root.dataset.appearance=preferences.appearance;
  root.dataset.solidNavigation='true';
  return preferences;
}

export function setClarityPreference(name,value,{storage=defaultStorage(),root=globalThis.document?.documentElement}={}){
  const current=clarityPreferences(storage),next={...current};
  if(name==='appearance')next.appearance=APPEARANCES.has(value)?value:'system';
  else if(name==='day-layout')next.dayLayout=DAY_LAYOUTS.has(value)?value:'agenda';
  else if(name==='solid-navigation')next.solidNavigation=true;
  else return current;
  write(storage,name,name==='solid-navigation'?String(next.solidNavigation):next[name==='day-layout'?'dayLayout':'appearance']);
  applyClarityPreferences(next,root);
  return next;
}

const element=(document,tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
const THEME_NAMES={system:'System default',light:'Light',dark:'Dark'};

/** M3 dialog with one radio per theme; choosing applies at once. */
function themeDialog(document,current,onChoose){
  const dialog=element(document,'dialog','m3-dialog theme-dialog');
  dialog.setAttribute('aria-label','Theme');
  dialog.append(element(document,'h2','','Theme'));
  for(const value of ['system','light','dark']){
    const row=element(document,'label','dialog-choice');
    const radio=element(document,'input');
    radio.type='radio';
    radio.name='appearance';
    radio.checked=value===current;
    radio.addEventListener('change',()=>{onChoose(value);dialog.close();});
    row.append(radio,element(document,'span','',THEME_NAMES[value]));
    dialog.append(row);
  }
  const actions=element(document,'div','dialog-actions');
  const close=element(document,'button','text-btn','Cancel');
  close.type='button';
  close.addEventListener('click',()=>dialog.close());
  actions.append(close);
  dialog.append(actions);
  dialog.addEventListener('close',()=>dialog.remove());
  return dialog;
}

/** Adds local planner display choices to the existing native-backed Settings destination. */
export function mountClaritySettings(host,{storage=defaultStorage(),root=globalThis.document?.documentElement}={}){
  const document=host.ownerDocument;
  let destroyed=false;
  const render=()=>{
    if(destroyed)return;
    const page=host.querySelector('.settings-page');
    if(!page||page.querySelector('[data-section="planner-appearance"]'))return;
    let preferences=applyClarityPreferences(clarityPreferences(storage),root);
    const section=element(document,'section','settings-group clarity-settings');
    section.dataset.section='planner-appearance';
    section.append(element(document,'h2','','Appearance'));
    const choice=element(document,'button','settings-row');
    choice.type='button';
    const copy=element(document,'span','settings-copy');
    const value=element(document,'small','',THEME_NAMES[preferences.appearance]);
    copy.append(element(document,'strong','','Theme'),value);
    choice.append(copy);
    section.append(choice);
    choice.addEventListener('click',()=>{
      const dialog=themeDialog(document,preferences.appearance,next=>{
        preferences=setClarityPreference('appearance',next,{storage,root});
        value.textContent=THEME_NAMES[next];
      });
      document.body.append(dialog);
      dialog.showModal();
    });
    page.querySelector('.settings-notice')?.after(section);
  };
  const observer=new MutationObserver(()=>queueMicrotask(render));
  observer.observe(host,{childList:true,subtree:true});
  render();
  return {destroy(){destroyed=true;observer.disconnect();host.querySelector('[data-section="planner-appearance"]')?.remove();}};
}
