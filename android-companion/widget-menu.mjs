// Pointer and keyboard paths share one menu; a held gesture can never submit.
export function createHoldGesture(open,{delay=380,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let timer=null,start=null,held=false,suppress=false;
  const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  return {
    down(x,y){clear();held=false;suppress=false;start={x,y};timer=setTimer(()=>{timer=null;held=true;suppress=true;open();},delay);},
    move(x,y){if(start&&Math.hypot(x-start.x,y-start.y)>12){clear();suppress=true;}},
    up(){clear();start=null;},
    cancel(){clear();start=null;suppress=true;},
    consumeClick(){const result=suppress||held;suppress=false;held=false;return result;}
  };
}
export function installWidgetMenu(){
  const $=id=>document.getElementById(id),menu=$('quick-menu'),send=$('send'),toggle=$('menu-toggle');let returnFocus=send;
  const clearContext=document.createElement('button');clearContext.type='button';clearContext.className='info-button';const closeSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'),closePath=document.createElementNS(closeSvg.namespaceURI,'path');closeSvg.setAttribute('viewBox','0 0 24 24');closeSvg.setAttribute('aria-hidden','true');closePath.setAttribute('d','m6 6 12 12M18 6 6 18');closeSvg.append(closePath);clearContext.append(closeSvg);clearContext.setAttribute('aria-label','Clear planning context');clearContext.hidden=true;toggle.before(clearContext);clearContext.addEventListener('click',()=>{window.RPM_PLATFORM.clearPlanningFocus();clearContext.hidden=true;$('view-label').textContent='RPM';$('home').setAttribute('aria-label','Return to conversation');});
  const wave=document.createElement('div');wave.className='thinking-aurora';wave.setAttribute('role','status');wave.setAttribute('aria-label','Thinking');wave.hidden=true;
  for(let i=0;i<3;i++){const light=document.createElement('i');light.className=`aurora-light light-${i}`;wave.append(light);}
  document.querySelector('.assistant-card').append(wave);
  let wasThinking=false,waveExit;
  function showThinking(thinking){if(thinking===wasThinking)return;wasThinking=thinking;clearTimeout(waveExit);if(thinking){wave.hidden=false;void wave.offsetHeight;wave.classList.add('is-active');}else{wave.classList.remove('is-active');waveExit=setTimeout(()=>{if(!wasThinking)wave.hidden=true;},180);}}
  let opened=false,hideTimer;const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const close=(focus=false)=>{opened=false;menu.classList.remove('is-open');menu.inert=true;clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!opened)menu.hidden=true;},reduced()?0:220);send.classList.remove('is-holding');send.setAttribute('aria-expanded','false');toggle.setAttribute('aria-expanded','false');if(focus)returnFocus.focus({preventScroll:true});};
  const open=(origin=send)=>{clearTimeout(hideTimer);opened=true;returnFocus=origin;menu.hidden=false;menu.inert=false;void menu.offsetHeight;menu.classList.add('is-open');send.classList.add('is-holding');send.setAttribute('aria-expanded','true');toggle.setAttribute('aria-expanded','true');};
  const gesture=createHoldGesture(()=>open());
  send.addEventListener('pointerdown',e=>{if(e.button!==0)return;gesture.down(e.clientX,e.clientY);send.classList.add('is-holding');send.setPointerCapture?.(e.pointerId);});
  send.addEventListener('mousedown',e=>e.preventDefault());
  send.addEventListener('pointermove',e=>gesture.move(e.clientX,e.clientY));
  send.addEventListener('pointerup',()=>{gesture.up();if(menu.hidden)send.classList.remove('is-holding');});
  send.addEventListener('pointercancel',()=>{gesture.cancel();if(menu.hidden)send.classList.remove('is-holding');});
  send.addEventListener('contextmenu',e=>e.preventDefault());
  send.addEventListener('click',e=>{if(gesture.consumeClick()){e.preventDefault();return;}if(opened){e.preventDefault();close(true);return;}if(!$('message').value.trim()||$('panel').dataset.busy==='true'){e.preventDefault();}},true);
  toggle.addEventListener('click',()=>opened?close(true):open(toggle));$('menu-dismiss').addEventListener('click',()=>close(true));
  menu.addEventListener('click',e=>{if(e.target.closest('.menu-items button'))close();});
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!send.contains(e.target)&&!toggle.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();close(true);}if(e.target===send&&((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu')){e.preventDefault();open();}});
  window.rpmDismissMenu=()=>{if(!opened)return false;close(true);return true;};
  document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled||reduced())return;const rect=button.getBoundingClientRect(),ripple=document.createElement('i');ripple.className='ripple';const size=Math.max(rect.width,rect.height);Object.assign(ripple.style,{width:`${size}px`,height:`${size}px`,left:`${(e.clientX||rect.left+rect.width/2)-rect.left-size/2}px`,top:`${(e.clientY||rect.top+rect.height/2)-rect.top-size/2}px`});button.append(ripple);setTimeout(()=>ripple.remove(),600);});
  $('message').setAttribute('enterkeyhint','send');
  $('composer').addEventListener('submit',()=>{$('message').focus({preventScroll:true});});
  $('prompt-choices').addEventListener('pointerdown',e=>{if(e.target.closest('button')&&document.activeElement===$('message'))e.preventDefault();});
  // Some Android keyboards emit beforeinput instead of an Enter keydown.
  let shiftEnter=false;
  $('message').addEventListener('keydown',e=>{shiftEnter=e.key==='Enter'&&e.shiftKey;});
  $('message').addEventListener('keyup',()=>{shiftEnter=false;});
  $('message').addEventListener('beforeinput',e=>{if(e.inputType==='insertLineBreak'&&!e.isComposing&&!shiftEnter){e.preventDefault();$('composer').requestSubmit();}});
  return {onRender({view,busy}){$('panel').dataset.busy=String(busy);$('panel').dataset.view=view;showThinking(busy&&view==='chat');$('content').setAttribute('aria-busy',String(busy));const focus=window.RPM_PLATFORM.planningFocus?.(),name=focus?.task?.title??focus?.block?.title??focus?.project?.title??(focus?.date?new Date(focus.date+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}):null);clearContext.hidden=!name||view!=='chat';clearContext.disabled=busy;$('view-label').textContent=busy?'Thinking':view==='chat'?(name?'In '+name:'RPM'):view[0].toUpperCase()+view.slice(1);$('home').setAttribute('aria-label',name?'Planning context: '+name+'. Return to conversation':'Return to conversation');$('expand').querySelector('span').textContent=$('expand').getAttribute('aria-pressed')==='true'?'Compact':'Expand';}};
}
