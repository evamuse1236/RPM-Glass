const APPEARANCES=new Set(['system','light','dark']);
const DAY_LAYOUTS=new Set(['day','list']);
export const BAR_TRANSPARENCY=Object.freeze({min:0,max:60,step:5,initial:20});
const key=name=>'rpm-clarity:'+name;
const barTransparency=value=>{
  const n=Number(value);
  if(value===null||value===''||!Number.isFinite(n))return BAR_TRANSPARENCY.initial;
  const stepped=Math.round(n/BAR_TRANSPARENCY.step)*BAR_TRANSPARENCY.step;
  return Math.min(BAR_TRANSPARENCY.max,Math.max(BAR_TRANSPARENCY.min,stepped));
};
const defaultStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};

function read(storage,name,fallback){try{return storage?.getItem(key(name))??fallback;}catch{return fallback;}}
function write(storage,name,value){try{storage?.setItem(key(name),value);}catch{}}

export function clarityPreferences(storage=defaultStorage()){
  const appearance=read(storage,'appearance','system'),dayLayout=read(storage,'today-layout','day');
  return {
    appearance:APPEARANCES.has(appearance)?appearance:'system',
    dayLayout:DAY_LAYOUTS.has(dayLayout)?dayLayout:'day',
    barTransparency:barTransparency(read(storage,'bar-transparency',null))
  };
}

export function applyClarityPreferences(preferences=clarityPreferences(),root=globalThis.document?.documentElement){
  if(!root)return preferences;
  if(preferences.appearance==='system')delete root.dataset.appearance;
  else root.dataset.appearance=preferences.appearance;
  root.style?.setProperty('--bar-fill',`${100-preferences.barTransparency}%`);
  root.dataset.barGlass=String(preferences.barTransparency>0);
  root.dataset.barThin=String(preferences.barTransparency>30);
  return preferences;
}

export function setClarityPreference(name,value,{storage=defaultStorage(),root=globalThis.document?.documentElement}={}){
  const current=clarityPreferences(storage),next={...current};
  if(name==='appearance')next.appearance=APPEARANCES.has(value)?value:'system';
  else if(name==='today-layout')next.dayLayout=DAY_LAYOUTS.has(value)?value:'day';
  else if(name==='bar-transparency')next.barTransparency=barTransparency(value);
  else return current;
  const stored={appearance:next.appearance,'today-layout':next.dayLayout,'bar-transparency':String(next.barTransparency)};
  write(storage,name,stored[name]);
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

/** Settings → Bar transparency: a slider with a live sample of the tab bar over a task row. */
function transparencyRow(document,current,onChange){
  const wrap=element(document,'div','settings-slider bar-transparency');
  const head=element(document,'div','settings-slider-head');
  const label=element(document,'label','','Tab bar transparency');
  label.htmlFor='bar-transparency';
  const shown=value=>value?`${value}%`:'Solid';
  const output=element(document,'output','settings-value tnum',shown(current));
  head.append(label,output);
  const slider=element(document,'input','fact-slider');
  Object.assign(slider,{id:'bar-transparency',type:'range',min:String(BAR_TRANSPARENCY.min),max:String(BAR_TRANSPARENCY.max),step:String(BAR_TRANSPARENCY.step),value:String(current)});
  slider.setAttribute('aria-valuetext',shown(current));
  const sample=element(document,'div','bar-sample');
  sample.setAttribute('aria-hidden','true');
  for(const [tone,title] of [[0,'Group call: merge sections'],[2,'Past paper 2019, section B']]){
    const line=element(document,'span','bar-sample-line',title);
    line.style.setProperty('--tone',`var(--area-${tone})`);
    sample.append(line);
  }
  sample.append(element(document,'span','bar-sample-bar','Today   Blocks   Projects   Life'));
  slider.addEventListener('input',()=>{
    const applied=onChange(slider.value);
    output.textContent=shown(applied);
    slider.setAttribute('aria-valuetext',shown(applied));
  });
  wrap.append(head,slider,element(document,'small','','How much of the page shows through the tab bar.'),sample);
  return wrap;
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
    section.append(transparencyRow(document,preferences.barTransparency,value=>{
      preferences=setClarityPreference('bar-transparency',value,{storage,root});
      return preferences.barTransparency;
    }));
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
