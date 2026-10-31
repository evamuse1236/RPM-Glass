// The Capture composer: one row, the field then one round button. The field is one line when empty and grows
// with text. At rest the button is the voice orb; it cross-fades to Send as soon as there is text, and while a
// voice session is open the orb is the voice itself and "Hang up".
import {orb,setLevel} from './capture-voice-card.mjs';

const MAX_LINES=6;
const ONE='one',MANY='many';

export function installComposer({onSubmit,onInput,onVoice}){
 const $=id=>document.getElementById(id);
 const form=$('composer'),message=$('message'),panel=$('panel');
 message.setAttribute('enterkeyhint','send');

 // Past one line the field rounds its corners less, as in Gemini, and Send stays on
 // the last line. It returns to one line only when the text is shorter than when
 // it grew, so the shape never flickers between the two.
 let grewAt=0;
 const fit=()=>{
  // Six lines at the current text size, then the field scrolls.
  const style=getComputedStyle(message);
  const line=parseFloat(style.lineHeight)||24,padding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
  const max=line*MAX_LINES+padding;
  const measure=()=>{
   message.style.height='auto';
   // Empty is always one line; a long placeholder is cut, not wrapped.
   return message.value?Math.min(message.scrollHeight,max):line+padding;
  };
  const wraps=height=>height>line+padding+2;
  let height=measure();
  if(form.dataset.lines!==MANY&&wraps(height)){form.dataset.lines=MANY;grewAt=message.value.length;height=measure();}
  else if(form.dataset.lines===MANY&&message.value.length<grewAt){
   form.dataset.lines=ONE;height=measure();
   if(wraps(height)){form.dataset.lines=MANY;height=measure();}
  }
  message.style.height=height+'px';
  message.style.overflowY=message.scrollHeight>max?'auto':'hidden';
  panel.dataset.hasText=String(!!message.value.trim());
 };
 message.addEventListener('input',()=>{fit();onInput(message.value);});
 form.addEventListener('submit',e=>{
  e.preventDefault();
  const text=message.value;
  if(text.trim())onSubmit(text);
  message.focus({preventScroll:true});
 });
 // Enter sends; Shift+Enter keeps a line break. Android IMEs report Enter as
 // an insertLineBreak input rather than a keydown, so handle both.
 let shiftEnter=false;
 message.addEventListener('keydown',e=>{
  shiftEnter=e.key==='Enter'&&e.shiftKey;
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}
 });
 message.addEventListener('keyup',()=>{shiftEnter=false;});
 message.addEventListener('beforeinput',e=>{
  if(e.inputType==='insertLineBreak'&&!e.isComposing&&!shiftEnter){e.preventDefault();form.requestSubmit();}
 });
 const dictate=$('dictate'),glow=orb('idle');
 dictate.insertBefore(glow,dictate.firstChild);
 dictate.addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
 dictate.addEventListener('click',onVoice);
 fit();
 // Android text zoom and width changes alter line wrapping without input events.
 window.addEventListener('rpm-settings-refresh',fit);
 window.addEventListener('rpm-phone-status',fit);
 document.fonts?.ready.then(fit);
 let width=0;
 new ResizeObserver(([entry])=>{
  const next=Math.round(entry.contentRect.width);
  if(next!==width){width=next;fit();}
 }).observe(form);
 return {
  fit,
  /** Put text in the field without sending it, keeping the caret at the end. */
  set(text,{focus=true}={}){
   message.value=text;
   message.dispatchEvent(new Event('input',{bubbles:true}));
   if(focus){
    message.focus({preventScroll:true});
    message.setSelectionRange(text.length,text.length);
   }
  },
  append(text){
   this.set([message.value.trimEnd(),text].filter(Boolean).join(' '));
  },
  voice(state){showVoice(panel,dictate,state);},
  level(value){setLevel(glow,value);},
 };
}

const LIVE=new Set(['connecting','listening','working','speaking']);

/**
 * The orb shows the voice: idle at rest, listening (fast spin, swells with the level) and working or speaking.
 * While a session is open Send stays hidden and the orb is "Hang up": a tap while RPM speaks only cuts the speech.
 */
export function showVoice(panel,dictate,{phase=null,listening=false,busy=false}={}){
 const live=LIVE.has(phase);
 panel.dataset.voice=live||listening?'on':'off';
 dictate.querySelector('.orb').className=`orb ${live?phase:listening?'listening':'idle'}`;
 dictate.setAttribute('aria-label',live?'Hang up':'Voice input');
 dictate.disabled=busy||listening;
 if(!live)setLevel(dictate.querySelector('.orb'),0);
}

/** A tap on the orb: it starts voice, or cuts RPM's speech, or hangs up. */
export const orbTap=(voiceMode,start)=>()=>voiceMode.active()?voiceMode.stop():start();

/** Android's speech recognizer runs in its own system dialog and returns only final text. */
export function listeningCard(el){
 const card=el('section','card enter listening');
 card.setAttribute('role','status');
 const mic=el('span','ms fill','mic');
 mic.setAttribute('aria-hidden','true');
 card.append(mic,el('p','card-title','Listening'),el('p','quiet','Speak in the voice input window. Your words appear in the bar so you can check them before sending.'));
 return card;
}
