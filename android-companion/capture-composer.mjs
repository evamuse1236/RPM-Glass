// The Capture composer: an M3 filled field that is one line when empty and
// grows with text. The microphone becomes Send as soon as there is text.

const MAX_LINES=5;
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
  // Five lines at the current text size, then the field scrolls.
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
 $('dictate').addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
 $('dictate').addEventListener('click',onVoice);
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
 };
}

/**
 * Android's speech recognizer runs in its own system dialog and returns only
 * final text, so this state never shows a live transcript or audio levels.
 */
export function listeningCard(el,icon){
 const card=el('section','listening');
 card.setAttribute('role','status');
 const mic=el('div','mic-big');
 mic.append(icon('mic',{fill:true}));
 card.append(
  mic,
  el('p','listen-title','Listening with Android voice input'),
  el('p','listen-text','Speak in the voice input window. Your words will appear in the box so you can check them before sending.'),
 );
 return card;
}
