import {installCapturePresentation,menuGeometry} from './capture-presentation.mjs';
// Pointer and keyboard paths share one menu; a held gesture can never submit.
export function createHoldGesture(open,{delay=380,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let timer=null,start=null,held=false,suppress=false;
  const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  return {
    down(x,y){clear();held=false;suppress=false;start={x,y};timer=setTimer(()=>{timer=null;held=true;suppress=true;open();},delay);},
    move(x,y){if(start&&Math.hypot(x-start.x,y-start.y)>12){clear();suppress=true;return true;}return false;},
    up(){clear();start=null;},
    cancel(){clear();start=null;suppress=true;},
    consumeClick(){const result=suppress||held;suppress=false;held=false;return result;}
  };
}
export function installWidgetMenu(){
  const $=id=>document.getElementById(id),panel=$('panel'),menu=$('quick-menu'),send=$('send'),toggle=$('menu-toggle'),message=$('message'),presentation=installCapturePresentation();
  let opened=false,returnFocus=toggle,restoreInput=false,hideTimer,layoutFrame;
  const reduced=()=>panel.dataset.motion==='reduced';
  const items=()=>[...menu.querySelectorAll('[role=menuitem]')].filter(n=>!n.disabled&&!n.hidden);
  items().forEach((n,i,list)=>n.style.setProperty('--menu-order',String(list.length-1-i)));
  const rememberDraft=()=>{try{localStorage.setItem('rpm-native-draft',message.value);return true;}catch{return false;}};
  const layout=()=>{
    cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{
      const large=document.documentElement.dataset.largeText==='true';
      panel.dataset.composer=large||document.activeElement===message||message.value?'stacked':'inline';
      message.style.height='auto';message.style.height=message.scrollHeight+'px';
      // Use layout positions, not the transient FLIP pose of the composer.
      let composerTop=0;for(let node=$('composer');node&&node!==panel;node=node.offsetParent)composerTop+=node.offsetTop;
      const bounds={bottom:panel.offsetHeight,height:panel.offsetHeight},composer={top:composerTop},geometry=menuGeometry(bounds,composer);
      panel.style.setProperty('--cap-menu-bottom',geometry.bottom+'px');panel.style.setProperty('--cap-menu-max',geometry.maxHeight+'px');
      // Decide from space above the composer, not content height: hiding starter
      // chips must not change the measurement and cause a resize feedback loop.
      const room=composerTop;panel.dataset.room=room<180?'short':room<230?'tight':'full';
    });
  };
  const close=({focus=false,touch=false}={})=>{
    if(!opened)return;opened=false;menu.inert=true;menu.classList.remove('is-open');panel.dataset.menuOpen='false';
    clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!opened)menu.hidden=true;},reduced()?0:200);
    send.classList.remove('is-holding','is-pressing');send.setAttribute('aria-expanded','false');toggle.setAttribute('aria-expanded','false');
    if(focus)(touch&&restoreInput?message:returnFocus).focus({preventScroll:true});
  };
  const open=(origin=send,{keyboard=false,last=false}={})=>{
    clearTimeout(hideTimer);returnFocus=origin;restoreInput=document.activeElement===message;opened=true;
    $('planner-draft-note').hidden=!(rememberDraft()&&message.value.length);menu.hidden=false;menu.inert=false;panel.dataset.menuOpen='true';layout();
    void menu.offsetHeight;menu.classList.add('is-open');send.classList.add('is-holding');send.setAttribute('aria-expanded','true');toggle.setAttribute('aria-expanded','true');
    if(keyboard){const list=items();(last?list.at(-1):list[0])?.focus({preventScroll:true});}
  };
  const gesture=createHoldGesture(()=>open(send));
  send.addEventListener('pointerdown',e=>{if(e.button!==0)return;gesture.down(e.clientX,e.clientY);send.classList.add('is-pressing');send.setPointerCapture?.(e.pointerId);});
  send.addEventListener('mousedown',e=>e.preventDefault());
  send.addEventListener('pointermove',e=>{if(gesture.move(e.clientX,e.clientY))send.classList.remove('is-pressing');});
  send.addEventListener('pointerup',()=>{gesture.up();send.classList.remove('is-pressing');});
  send.addEventListener('pointercancel',()=>{gesture.cancel();send.classList.remove('is-pressing');});
  send.addEventListener('contextmenu',e=>e.preventDefault());
  send.addEventListener('click',e=>{
    if(gesture.consumeClick()){e.preventDefault();return;}
    if(opened){e.preventDefault();close({focus:true,touch:e.detail>0});return;}
    if(!message.value.trim()||panel.dataset.busy==='true')e.preventDefault();
  },true);
  toggle.addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
  toggle.addEventListener('click',e=>opened?close({focus:true,touch:e.detail>0}):open(toggle,{keyboard:e.detail===0}));
  toggle.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(toggle,{keyboard:true,last:e.key==='ArrowUp'});}});
  $('menu-dismiss').addEventListener('click',e=>close({focus:true,touch:e.detail>0}));
  // Persist before a destination's own listener runs. Do not steal keyboard focus.
  menu.addEventListener('click',e=>{if(e.target.closest('[role=menuitem]')){rememberDraft();close();}},true);
  menu.addEventListener('keydown',e=>{
    const list=items(),index=list.indexOf(document.activeElement);let next;
    if(e.key==='ArrowDown')next=(index+1)%list.length;
    if(e.key==='ArrowUp')next=(index-1+list.length)%list.length;
    if(e.key==='Home')next=0;if(e.key==='End')next=list.length-1;
    if(next!==undefined){e.preventDefault();list[next]?.focus();}
    if(e.key==='Tab'){e.preventDefault();close();(e.shiftKey?toggle:message).focus({preventScroll:true});}
  });
  document.addEventListener('pointerdown',e=>{if(opened&&!menu.contains(e.target)&&!send.contains(e.target)&&!toggle.contains(e.target))close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&opened){e.preventDefault();close({focus:true});}
    if(e.target===send&&((e.shiftKey&&e.key==='F10')||e.key==='ContextMenu')){e.preventDefault();open(send,{keyboard:true,last:true});}
  });
  window.rpmDismissMenu=()=>{if(!opened)return false;close({focus:true});return true;};
  window.addEventListener('pagehide',rememberDraft);
  const clearContext=document.createElement('button');clearContext.type='button';clearContext.className='info-button';clearContext.setAttribute('aria-label','Clear planning context');clearContext.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const focusLine=document.createElement('div'),focusLabel=document.createElement('span');focusLine.className='capture-focus';focusLine.hidden=true;focusLine.append(focusLabel,clearContext);document.querySelector('.panel-header').after(focusLine);
  clearContext.addEventListener('click',()=>{window.RPM_PLATFORM.clearPlanningFocus();focusLine.hidden=true;layout();});
  $('dictate')?.addEventListener('click',async()=>{const listening=$('listening');listening.hidden=false;layout();try{const result=await window.RPM_PLATFORM.action('dictate');if(result.text){message.value=[message.value,result.text].filter(Boolean).join(' ');message.dispatchEvent(new Event('input'));message.focus();}}catch(error){$('status').textContent=error.message;$('status').classList.add('error');}finally{listening.hidden=true;layout();}});
  message.setAttribute('enterkeyhint','send');message.addEventListener('input',layout);message.addEventListener('focus',layout);message.addEventListener('blur',layout);
  window.rpmCaptureKeyboard=visible=>{panel.dataset.keyboard=String(visible);if(!visible&&document.activeElement===message)message.blur();layout();};window.addEventListener('resize',layout);window.addEventListener('rpm-phone-status',layout);
  new ResizeObserver(layout).observe($('composer'));new ResizeObserver(layout).observe(panel);
  new MutationObserver(layout).observe(document.documentElement,{attributes:true,attributeFilter:['data-large-text']});
  $('composer').addEventListener('submit',()=>message.focus({preventScroll:true}));
  $('prompt-choices').addEventListener('pointerdown',e=>{if(e.target.closest('button')&&document.activeElement===message)e.preventDefault();});
  let shiftEnter=false;message.addEventListener('keydown',e=>{shiftEnter=e.key==='Enter'&&e.shiftKey;});message.addEventListener('keyup',()=>{shiftEnter=false;});
  message.addEventListener('beforeinput',e=>{if(e.inputType==='insertLineBreak'&&!e.isComposing&&!shiftEnter){e.preventDefault();$('composer').requestSubmit();}});
  layout();
  return {captureUI:presentation,onRender(info){
    presentation.onRender(info);layout();const {view,busy}=info;
    const focus=window.RPM_PLATFORM.planningFocus?.(),name=focus?.task?.title??focus?.block?.title??focus?.project?.title??null;
    focusLine.hidden=!name||view!=='chat';focusLabel.textContent=name?'For: '+name:'';clearContext.disabled=busy;
    $('view-label').textContent=view==='chat'?'RPM':view[0].toUpperCase()+view.slice(1);
    $('home').setAttribute('aria-label',name?'Planning context: '+name+'. Return to Capture':'Return to Capture');
    send.setAttribute('aria-description',busy?'Working on your capture. Hold for planner and more.':'Hold for planner and more.');
    $('expand').querySelector('span').textContent=$('expand').getAttribute('aria-pressed')==='true'?'Compact':'Expand';
  }};
}
