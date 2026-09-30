import {animateLayout,enterSurface,playMotion,reducedMotion} from './surface-motion.mjs';
// Presentation only: this module never saves a plan or invents request progress.
export function createRevealTracker(){
  const seen=new Set();let pending=false;
  return {begin(){pending=true;},settle(key,{failed=false}={}){const reveal=pending&&!failed&&!!key&&!seen.has(key);pending=false;if(key&&!failed)seen.add(key);return reveal;},observe(key){if(key)seen.add(key);}};
}
export function menuGeometry(panel,composer){
  const bottom=Math.max(8,panel.bottom-composer.top+8);
  return {bottom,maxHeight:Math.max(0,panel.height-bottom-8)};
}
export function installCapturePresentation(){
  const $=id=>document.getElementById(id),panel=$('panel'),content=$('content'),message=$('message'),tracker=createRevealTracker();
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let view='chat',busy=false,request=null,transient=null,waitTimer,revealTimer,sendTimer,sizeFrame,lastSize='',waitingHeight=0;
  const outerHeight=node=>{if(!node||getComputedStyle(node).display==='none')return 0;const s=getComputedStyle(node);return node.offsetHeight+(parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0);};
  const scheduleSize=()=>{cancelAnimationFrame(sizeFrame);sizeFrame=requestAnimationFrame(()=>{
    const action=window.RPM_PLATFORM?.action;if(!action||!content.querySelector('.capture-stage')||document.fonts.status!=='loaded')return;
    const padding=getComputedStyle(content),border=getComputedStyle(panel);
    const chrome=outerHeight($('capture-actions'))+outerHeight(document.querySelector('.panel-header'))+outerHeight(document.querySelector('.capture-focus'))+outerHeight($('status'))+outerHeight(document.querySelector('.composer-area'));
    let height=chrome+[...content.children].reduce((n,node)=>n+outerHeight(node),0)+(parseFloat(padding.paddingTop)||0)+(parseFloat(padding.paddingBottom)||0)+(parseFloat(border.borderTopWidth)||0)+(parseFloat(border.borderBottomWidth)||0);
    if(panel.dataset.menuOpen==='true'){
      const menu=$('quick-menu'),items=menu.querySelector('.menu-items');
      height=Math.max(height,outerHeight(document.querySelector('.composer-area'))+outerHeight(menu.querySelector('.menu-heading'))+items.scrollHeight+outerHeight($('plans-view'))+32);
    }
    if(busy)height=Math.max(height,waitingHeight);
    const width=panel.offsetWidth,key=Math.ceil(height)+':'+width;if(key===lastSize)return;lastSize=key;
    resizePanel(()=>panel.style.height=Math.ceil(height)+'px');if(!panel.dataset.measured)requestAnimationFrame(()=>panel.dataset.measured='true');
    action('captureSize',{height:Math.ceil(height),width,reducedMotion:reducedMotion()}).catch(()=>{lastSize='';});
  });};
  const overflow=$('capture-overflow');
  let resizing=false,resizeEpoch=0;
  const updateOverflow=()=>{const more=!resizing&&content.scrollHeight-content.clientHeight-(overflow.hidden?0:overflow.offsetHeight)-content.scrollTop>3;overflow.hidden=!more;content.dataset.more=String(more);};
  const resizePanel=(mutate,{duration=180,enabled=true}={})=>{
    const epoch=++resizeEpoch;resizing=true;updateOverflow();
    const regions=[{node:panel.querySelector('.cap-shell'),scale:true},...['.panel-header','.capture-focus','#content','#capture-actions','#status','.composer-area'].map(selector=>({node:panel.querySelector(selector),clip:selector==='#content'}))];
    animateLayout(panel,regions,mutate,{duration,enabled:enabled&&panel.dataset.measured==='true'}).then(()=>{if(epoch===resizeEpoch){resizing=false;updateOverflow();}});
  };
  window.rpmSurfaceInsets=({bottom,width,animate})=>{if(!Number.isFinite(bottom)||!Number.isFinite(width)||width<=0)return;const root=document.documentElement,inset=Math.max(0,bottom*innerWidth/width)+'px';if(root.style.getPropertyValue('--keyboard-inset')===inset)return;resizePanel(()=>{root.dataset.nativeInsets='true';root.style.setProperty('--keyboard-inset',inset);},{duration:240,enabled:animate});};
  if(window.rpmSurfaceInsetsValue)window.rpmSurfaceInsets(window.rpmSurfaceInsetsValue);
  document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target))window.RPM_PLATFORM?.action('minimize').catch(()=>{});});
  overflow.addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
  overflow.addEventListener('click',()=>content.scrollBy({top:Math.max(48,content.clientHeight-40),behavior:motion.matches?'instant':'smooth'}));
  content.addEventListener('scroll',updateOverflow,{passive:true});
  const resize=new ResizeObserver(()=>{updateOverflow();scheduleSize();});for(const node of [content,$('capture-actions'),$('capture-overflow'),$('status'),document.querySelector('.composer-area'),document.querySelector('.panel-header')])resize.observe(node);
  new MutationObserver(()=>{updateOverflow();scheduleSize();}).observe(content,{childList:true,subtree:true,characterData:true});
  new MutationObserver(scheduleSize).observe(panel,{attributes:true,attributeFilter:['data-menu-open','data-view','data-busy']});
  new MutationObserver(scheduleSize).observe($('capture-actions'),{childList:true,subtree:true});
  content.addEventListener('toggle',()=>{updateOverflow();scheduleSize();},true);
  window.addEventListener('resize',scheduleSize);window.addEventListener('rpm-settings-refresh',scheduleSize);document.fonts.ready.then(scheduleSize);
  const make=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const state=value=>{panel.dataset.capState=value;};
  const syncMotion=()=>{panel.dataset.motion=reducedMotion()?'reduced':'full';panel.dataset.visible=String(!document.hidden);};
  motion.addEventListener('change',syncMotion);window.addEventListener('rpm-phone-status',syncMotion);document.addEventListener('visibilitychange',syncMotion);syncMotion();
  const key=()=>content.querySelector('[data-reply-key]')?.dataset.replyKey??null;
  const removeTransient=()=>{transient?.remove();transient=null;};
  const clearTimers=()=>{clearTimeout(waitTimer);clearTimeout(revealTimer);clearTimeout(sendTimer);};
  const settleState=()=>state(message.value?'composing':content.querySelector('.intent-review,.message')?'response':'idle');
  function attachWaiting(){
    if(view!=='chat'||!request)return;
    if(!transient){
      transient=make('section','cap-pending');transient.id='capture-pending';
      if(request.text)transient.append(make('p','user-text',request.text));
      const waiting=make('div','cap-waiting');waiting.setAttribute('role','status');waiting.setAttribute('aria-live','polite');waiting.append(make('span','',request.type==='message'||request.type==='intentRetry'?'Thinking…':'Saving…'));transient.append(waiting);
    }
    if(!transient.isConnected)content.prepend(transient);content.scrollTop=0;scheduleSize();
  }
  function editWords(text,origin){
    const apply=()=>{message.value=text;message.dispatchEvent(new Event('input',{bubbles:true}));message.focus({preventScroll:true});message.setSelectionRange(text.length,text.length);};
    if(!message.value||message.value===text){apply();return;}
    const holder=origin?.parentElement??content;
    if(holder.querySelector('.cap-replace-confirm'))return;
    const confirm=make('div','cap-replace-confirm');confirm.append(make('p','', 'Replace the draft you’re writing?'));
    const actions=make('div','actions');for(const [label,fn] of [['Keep current draft',()=>confirm.remove()],['Replace draft',()=>{confirm.remove();apply();}]]){const b=make('button','choice',label);b.type='button';b.addEventListener('click',fn);actions.append(b);}confirm.append(actions);holder.append(confirm);
  }
  message.addEventListener('input',()=>{if(!busy&&panel.dataset.capState!=='error')settleState();});
  return {
    editWords,
    begin(payload){
      waitingHeight=panel.offsetHeight;clearTimers();removeTransient();content.querySelectorAll('.cap-failure').forEach(n=>n.remove());panel.dataset.recovering='false';request=payload;tracker.begin();busy=true;state(payload.type==='message'?'sending':'waiting');attachWaiting();
      // This timer ends only the sending entrance, never the request itself.
      sendTimer=setTimeout(()=>{if(busy)state('waiting');},220);
      waitTimer=setTimeout(()=>{if(busy&&transient){const label=transient.querySelector('.cap-waiting span');if(label)label.textContent='Still working…';}},8000);
      $('status').textContent='';
    },
    onRender(info){
      view=info.view;busy=info.busy;panel.dataset.busy=String(busy);panel.dataset.view=view;
      if(busy){attachWaiting();}else if(!request){tracker.observe(key());settleState();}
      content.setAttribute('aria-busy',String(busy));
      scheduleSize();
    },
    beforeRender(){return {top:content.scrollTop,key:key(),view,open:[...content.querySelectorAll('details[open]')].map(d=>({messageId:d.closest('[data-message-id]')?.dataset.messageId,cls:d.className}))};},
    afterRender(position){
      panel.dataset.recovering=String(!!content.querySelector('.cap-failure'));
      // A new response starts at its beginning. Never inherit an old bottom
      // position when a draft becomes a review, saved receipt or correction.
      if(position){const same=position.key===key()&&position.view===view;if(same)for(const d of content.querySelectorAll('details'))if(position.open?.some(o=>o.messageId===d.closest('[data-message-id]')?.dataset.messageId&&o.cls===d.className))d.open=true;content.scrollTop=same?position.top:0;}
      if(busy)attachWaiting();
      if(!request){tracker.observe(key());if(position&&position.view!==view)enterSurface(content.querySelector('.capture-stage'),view==='chat'?'left':'right');}
    },
    finish(){
      clearTimers();removeTransient();busy=false;
      const latest=content.querySelector('.intent-review');const failed=!!latest?.querySelector('.intent-state.error');
      const shouldReveal=tracker.settle(key(),{failed});request=null;
      if(view!=='chat'){settleState();return;}
      if(failed){state('error');return;}
      waitingHeight=0;
      if(shouldReveal){state('revealing');enterSurface(latest).then(()=>{if(!busy)settleState();});playMotion($('capture-actions'),[{opacity:.65},{opacity:1}]);}else settleState();
      scheduleSize();
    },
    fail(error,{retry}={}){
      clearTimers();removeTransient();busy=false;waitingHeight=0;tracker.settle(key(),{failed:true});state('error');
      const payload=request;request=null;
      // A persisted capture has its own correctly identified retry action.
      if(!payload||view!=='chat'||content.querySelector('.intent-state.error'))return;
      $('status').textContent='';
      panel.dataset.recovering='true';
      const failure=make('section','cap-failure');panel.dataset.recoveryKind=payload.text?'message':'action';failure.append(make('p','',payload.type==='intentAction'?'Couldn’t save this change. Your draft is kept. Retry when you’re ready.':payload.text?'Couldn’t finish this request. Your words are kept. You can retry or edit them.':error||'Couldn’t finish this request. Your draft is kept.'));if(payload.text){const words=make('details','cap-details');words.append(make('summary','','Your words'),make('p','cap-original',payload.text));failure.append(words);}
      const actions=make('div','actions');if(retry){const b=make('button','primary','Retry');b.type='button';b.addEventListener('click',retry);if(payload.type==='intentAction'){$('capture-actions').querySelector('.primary')?.replaceWith(b);}else actions.append(b);}if(payload.text){const edit=make('button','choice','Edit');edit.type='button';edit.addEventListener('click',()=>editWords(payload.text,edit));actions.append(edit);}if(payload.text){actions.classList.add('cap-card-actions');$('capture-actions').replaceChildren(actions);}else if(actions.childElementCount)failure.append(actions);content.prepend(failure);content.scrollTop=0;updateOverflow();scheduleSize();
    }
  };
}
