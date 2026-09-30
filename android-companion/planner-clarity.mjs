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

/** Adds local planner display choices to the existing native-backed Settings destination. */
export function mountClaritySettings(host,{storage=defaultStorage(),root=globalThis.document?.documentElement}={}){
  const document=host.ownerDocument;let destroyed=false;
  const render=()=>{
    if(destroyed)return;const page=host.querySelector('.settings-page');
    if(!page||page.querySelector('[data-section="planner-appearance"]'))return;
    let preferences=applyClarityPreferences(clarityPreferences(storage),root);
    const section=element(document,'section','settings-group clarity-settings');section.dataset.section='planner-appearance';
    section.append(element(document,'h2','','Appearance'));
    const choice=element(document,'button','settings-row'),copy=element(document,'span','settings-copy');choice.type='button';copy.append(element(document,'strong','','Theme'),element(document,'small','',preferences.appearance[0].toUpperCase()+preferences.appearance.slice(1)));choice.append(copy);section.append(choice);
    choice.addEventListener('click',()=>{const dialog=element(document,'dialog','theme-dialog');dialog.append(element(document,'h2','','Theme'));for(const value of ['system','light','dark']){const row=element(document,'label','clarity-choice'),radio=element(document,'input');radio.type='radio';radio.name='appearance';radio.checked=value===preferences.appearance;row.append(radio,element(document,'span','',value[0].toUpperCase()+value.slice(1)));radio.addEventListener('change',()=>{preferences=setClarityPreference('appearance',value,{storage,root});copy.querySelector('small').textContent=value[0].toUpperCase()+value.slice(1);dialog.close();});dialog.append(row);}const close=element(document,'button','secondary','Close');close.addEventListener('click',()=>dialog.close());dialog.append(close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();});
    const notice=page.querySelector('.settings-notice');(notice??page.querySelector('.settings-header'))?.after(section);
  };
  const observer=new MutationObserver(()=>queueMicrotask(render));observer.observe(host,{childList:true,subtree:true});render();
  return {destroy(){destroyed=true;observer.disconnect();host.querySelector('[data-section="planner-appearance"]')?.remove();}};
}
