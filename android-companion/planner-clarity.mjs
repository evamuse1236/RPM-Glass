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
    solidNavigation:read(storage,'solid-navigation','false')==='true'
  };
}

export function applyClarityPreferences(preferences=clarityPreferences(),root=globalThis.document?.documentElement){
  if(!root)return preferences;
  if(preferences.appearance==='system')delete root.dataset.appearance;
  else root.dataset.appearance=preferences.appearance;
  root.dataset.solidNavigation=String(!!preferences.solidNavigation);
  return preferences;
}

export function setClarityPreference(name,value,{storage=defaultStorage(),root=globalThis.document?.documentElement}={}){
  const current=clarityPreferences(storage),next={...current};
  if(name==='appearance')next.appearance=APPEARANCES.has(value)?value:'system';
  else if(name==='day-layout')next.dayLayout=DAY_LAYOUTS.has(value)?value:'agenda';
  else if(name==='solid-navigation')next.solidNavigation=!!value;
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
    section.append(element(document,'h2','','Planner appearance'));
    const fieldset=element(document,'fieldset','clarity-choice-group'),legend=element(document,'legend','','Color appearance');fieldset.append(legend);
    for(const [value,label,detail] of [['system','System','Match Android'],['light','Light','Always light'],['dark','Dark','Always dark']]){
      const choice=element(document,'label','clarity-choice'),input=element(document,'input'),copy=element(document,'span','settings-copy');
      input.type='radio';input.name='rpm-planner-appearance';input.value=value;input.checked=preferences.appearance===value;
      copy.append(element(document,'strong','',label),element(document,'small','',detail));choice.append(input,copy);
      input.addEventListener('change',()=>{if(input.checked)preferences=setClarityPreference('appearance',value,{storage,root});});fieldset.append(choice);
    }
    section.append(fieldset);
    const solid=element(document,'label','clarity-choice clarity-solid-choice'),control=element(document,'input'),copy=element(document,'span','settings-copy');
    control.type='checkbox';control.checked=preferences.solidNavigation;copy.append(element(document,'strong','','Solid navigation'),element(document,'small','','Remove transparency from the bottom bar'));solid.append(control,copy);
    control.addEventListener('change',()=>{preferences=setClarityPreference('solid-navigation',control.checked,{storage,root});});section.append(solid);
    const notice=page.querySelector('.settings-notice');(notice??page.querySelector('.settings-header'))?.after(section);
  };
  const observer=new MutationObserver(()=>queueMicrotask(render));observer.observe(host,{childList:true,subtree:true});render();
  return {destroy(){destroyed=true;observer.disconnect();host.querySelector('[data-section="planner-appearance"]')?.remove();}};
}
