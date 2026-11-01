/** The phone's Gemini Live voice and persona: kept on this phone, read by Capture each time voice mode starts. */
import {VOICES,PERSONA_MAX,voiceName,personaText} from './voice-tools.mjs';

const key=name=>'rpm-voice:'+name;
const defaultStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
const read=(storage,name)=>{try{return storage?.getItem(key(name))??null;}catch{return null;}};
function write(storage,name,value){try{if(value)storage?.setItem(key(name),value);else storage?.removeItem(key(name));}catch{}}

/** {voice, persona}: voice is an offered name or null (Gemini's default); persona is one clean line or ''. */
export function voiceChoice(storage=defaultStorage()){
  return {voice:voiceName(read(storage,'name')),persona:personaText(read(storage,'persona'))};
}
export function setVoice(value,storage=defaultStorage()){write(storage,'name',voiceName(value));return voiceChoice(storage);}
export function setPersona(value,storage=defaultStorage()){write(storage,'persona',personaText(value));return voiceChoice(storage);}

export const DEFAULT_VOICE='Gemini default';
export const voiceLabel=voice=>{const v=VOICES.find(x=>x.name===voice);return v?`${v.name} · ${v.feel}`:DEFAULT_VOICE;};

const element=(document,tag,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
function actions(document,dialog,...extra){
  const row=element(document,'div','dialog-actions');
  const cancel=element(document,'button','text-btn','Cancel');
  cancel.type='button';
  cancel.addEventListener('click',()=>dialog.close());
  row.append(cancel,...extra);
  dialog.append(row);
}
function shell(document,title){
  const dialog=element(document,'dialog','m3-dialog');
  dialog.setAttribute('aria-label',title);
  dialog.append(element(document,'h2','',title));
  dialog.addEventListener('close',()=>dialog.remove());
  return dialog;
}

/** M3 dialog with one radio per voice; choosing saves at once. */
export function voiceDialog(document,current,onChoose){
  const dialog=shell(document,'Voice');
  for(const value of [null,...VOICES.map(v=>v.name)]){
    const row=element(document,'label','dialog-choice');
    const radio=element(document,'input');
    radio.type='radio';
    radio.name='voice';
    radio.checked=value===current;
    radio.addEventListener('change',()=>{onChoose(value);dialog.close();});
    row.append(radio,element(document,'span','',voiceLabel(value)));
    dialog.append(row);
  }
  actions(document,dialog);
  return dialog;
}

/** M3 dialog with one outlined field; Save stores the cleaned line, an empty field clears it. */
export function personaDialog(document,current,onSave){
  const dialog=shell(document,'Persona');
  const wrap=element(document,'label','text-field');
  const input=element(document,'textarea');
  input.maxLength=PERSONA_MAX;
  input.value=current;
  input.placeholder=' ';
  const count=element(document,'small','field-helper tnum');
  const counted=()=>{count.textContent=`Tone only; the planner rules still apply · ${input.value.length}/${PERSONA_MAX}`;};
  input.addEventListener('input',counted);
  counted();
  wrap.append(input,element(document,'span','field-label','Speak as'),count);
  dialog.append(wrap);
  const save=element(document,'button','text-btn','Save');
  save.type='button';
  save.addEventListener('click',()=>{onSave(input.value);dialog.close();});
  actions(document,dialog,save);
  return dialog;
}
