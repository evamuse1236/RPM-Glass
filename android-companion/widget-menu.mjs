// The Capture options menu. More (in the header) and a held Send open the same menu; a held
// gesture can never submit, and the exact draft is kept before any route opens.

export function createHoldGesture(open,{delay=380,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let timer=null,start=null,held=false,suppress=false;
 const clear=()=>{
  if(timer!==null)clearTimer(timer);
  timer=null;
 };
 return {
  down(x,y){
   clear();held=false;suppress=false;start={x,y};
   timer=setTimer(()=>{timer=null;held=true;suppress=true;open();},delay);
  },
  move(x,y){
   if(start&&Math.hypot(x-start.x,y-start.y)>12){clear();suppress=true;return true;}
   return false;
  },
  up(){clear();start=null;},
  cancel(){clear();start=null;suppress=true;},
  consumeClick(){
   const result=suppress||held;
   suppress=false;held=false;
   return result;
  },
 };
}

/** Keep the menu eight pixels above the composer and inside the panel. */
export function menuGeometry(panel,composer){
 const bottom=Math.max(8,panel.bottom-composer.top+8);
 return {bottom,maxHeight:Math.max(0,panel.height-bottom-8)};
}

function wireSendHold(send,gesture,{isOpen,close,canSend}){
 send.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  gesture.down(e.clientX,e.clientY);
  send.classList.add('is-pressing');
  send.setPointerCapture?.(e.pointerId);
 });
 // Keep the keyboard up when Send is pressed.
 send.addEventListener('mousedown',e=>e.preventDefault());
 send.addEventListener('pointermove',e=>{if(gesture.move(e.clientX,e.clientY))send.classList.remove('is-pressing');});
 send.addEventListener('pointerup',()=>{gesture.up();send.classList.remove('is-pressing');});
 send.addEventListener('pointercancel',()=>{gesture.cancel();send.classList.remove('is-pressing');});
 send.addEventListener('contextmenu',e=>e.preventDefault());
 send.addEventListener('click',e=>{
  if(gesture.consumeClick()){e.preventDefault();e.stopImmediatePropagation();return;}
  if(isOpen()){e.preventDefault();e.stopImmediatePropagation();close({focus:true,touch:e.detail>0});return;}
  if(!canSend())e.preventDefault();
 },true);
}

function wireMenuKeys(menu,items,{close,toggle,message}){
 menu.addEventListener('keydown',e=>{
  const list=items(),index=list.indexOf(document.activeElement);
  let next;
  if(e.key==='ArrowDown')next=(index+1)%list.length;
  if(e.key==='ArrowUp')next=(index-1+list.length)%list.length;
  if(e.key==='Home')next=0;
  if(e.key==='End')next=list.length-1;
  if(next!==undefined){e.preventDefault();list[next]?.focus();}
  if(e.key==='Tab'){
   e.preventDefault();close();
   (e.shiftKey?toggle:message).focus({preventScroll:true});
  }
 });
}

/**
 * Install the options menu. `rememberDraft()` must persist the exact composer
 * text synchronously; it runs before any menu destination's own handler.
 */
export function installCaptureMenu({rememberDraft,canSend,onChange=()=>{}}){
 const $=id=>document.getElementById(id);
 const panel=$('panel'),menu=$('quick-menu'),send=$('send'),toggle=$('menu-toggle'),message=$('message');
 let opened=false,returnFocus=toggle,restoreInput=false,hideTimer;
 const items=()=>[...menu.querySelectorAll('[role=menuitem]')].filter(n=>!n.disabled&&!n.hidden);
 const reduced=()=>panel.dataset.motion==='reduced';

 // More in the header drops the menu below it; a held Send opens it above the composer.
 const fromHeader=()=>panel.dataset.menuFrom==='top';
 function place(){
  const box=panel.getBoundingClientRect();
  if(fromHeader()){
   const top=Math.ceil(toggle.getBoundingClientRect().bottom-box.top);
   panel.style.setProperty('--menu-top',top+'px');
   panel.style.setProperty('--menu-max',Math.max(0,box.height-top-8)+'px');
   return;
  }
  const composer=$('composer').getBoundingClientRect();
  const geometry=menuGeometry({bottom:box.bottom,height:box.height},{top:composer.top});
  panel.style.setProperty('--menu-bottom',geometry.bottom+'px');
  panel.style.setProperty('--menu-max',geometry.maxHeight+'px');
 }
 function close({focus=false,touch=false}={}){
  if(!opened)return;
  opened=false;menu.inert=true;menu.classList.remove('is-open');panel.dataset.menuOpen='false';
  panel.style.minHeight='';
  clearTimeout(hideTimer);
  hideTimer=setTimeout(()=>{if(!opened)menu.hidden=true;},reduced()?0:150);
  send.classList.remove('is-holding','is-pressing');
  send.setAttribute('aria-expanded','false');toggle.setAttribute('aria-expanded','false');
  if(focus)(touch&&restoreInput?message:returnFocus).focus({preventScroll:true});
  onChange(false);
 }
 function open(origin=send,{keyboard=false,last=false}={}){
  clearTimeout(hideTimer);
  returnFocus=origin;restoreInput=document.activeElement===message;opened=true;
  $('planner-draft-note').hidden=!(rememberDraft()&&message.value.length);
  menu.hidden=false;menu.inert=false;panel.dataset.menuOpen='true';
  panel.dataset.menuFrom=origin===toggle?'top':'bottom';
  // Grow a short panel so the whole menu fits under the header or above the composer.
  const composerArea=$('composer').closest('.composer-area')??$('composer');
  const above=fromHeader()?toggle.getBoundingClientRect().bottom-panel.getBoundingClientRect().top:composerArea.offsetHeight;
  panel.style.minHeight=Math.ceil(menu.scrollHeight+above+16)+'px';
  onChange(true);place();
  void menu.offsetHeight;
  menu.classList.add('is-open');
  if(origin===send)send.classList.add('is-holding');
  send.setAttribute('aria-expanded','true');toggle.setAttribute('aria-expanded','true');
  if(keyboard){const list=items();(last?list.at(-1):list[0])?.focus({preventScroll:true});}
 }

 const gesture=createHoldGesture(()=>open(send));
 wireSendHold(send,gesture,{isOpen:()=>opened,close,canSend});
 toggle.addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
 toggle.addEventListener('click',e=>opened?close({focus:true,touch:e.detail>0}):open(toggle,{keyboard:e.detail===0}));
 toggle.addEventListener('keydown',e=>{
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(toggle,{keyboard:true,last:e.key==='ArrowUp'});}
 });
 // Persist before a destination's own listener runs. Do not steal keyboard focus.
 menu.addEventListener('click',e=>{if(e.target.closest('[role=menuitem]')){rememberDraft();close();}},true);
 wireMenuKeys(menu,items,{close,toggle,message});
 document.addEventListener('pointerdown',e=>{
  if(opened&&!menu.contains(e.target)&&!send.contains(e.target)&&!toggle.contains(e.target))close();
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&opened){e.preventDefault();close({focus:true});}
  if(e.target===send&&((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu')){e.preventDefault();open(send,{keyboard:true,last:true});}
 });
 window.addEventListener('resize',()=>{if(opened)place();});
 return {
  isOpen:()=>opened,
  place,
  dismiss(){if(!opened)return false;close({focus:true});return true;},
 };
}
