// Presentation only: geometry, insets and motion. This module never saves a
// plan and never invents request progress.
export {menuGeometry} from './widget-menu.mjs';

export function createRevealTracker(){
 const seen=new Set();
 let pending=false;
 return {
  begin(){pending=true;},
  settle(key,{failed=false}={}){
   const reveal=pending&&!failed&&!!key&&!seen.has(key);
   pending=false;
   if(key&&!failed)seen.add(key);
   return reveal;
  },
  observe(key){if(key)seen.add(key);},
 };
}

const prefersReduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

/** Reduced motion follows Android's animator setting or the web preference. */
export function reducedMotion(){
 return document.documentElement.dataset.reduceMotion==='true'||!!prefersReduced?.matches;
}

/** A short, interruptible entrance for new content. Resolves when finished. */
export function enter(node,{distance=8,duration=220}={}){
 if(!node||reducedMotion()||!node.animate)return Promise.resolve();
 const motion=node.animate(
  [{opacity:0,transform:`translateY(${distance}px)`},{opacity:1,transform:'none'}],
  {duration,easing:'cubic-bezier(.05,.7,.1,1)'},
 );
 return motion.finished.catch(()=>{});
}

function installInsets(panel){
 const root=document.documentElement;
 // Android passes the IME height above the navigation bar in physical pixels.
 window.rpmSurfaceInsets=({bottom,width})=>{
  if(!Number.isFinite(bottom)||!Number.isFinite(width)||width<=0)return;
  const inset=Math.max(0,bottom*innerWidth/width)+'px';
  if(root.style.getPropertyValue('--keyboard-inset')===inset)return;
  root.dataset.nativeInsets='true';
  root.style.setProperty('--keyboard-inset',inset);
 };
 if(window.rpmSurfaceInsetsValue)window.rpmSurfaceInsets(window.rpmSurfaceInsetsValue);
 window.rpmCaptureKeyboard=visible=>{
  panel.dataset.keyboard=String(visible);
  const message=document.getElementById('message');
  if(!visible&&document.activeElement===message)message.blur();
 };
}

function installSizeReport(panel,action){
 let frame,last='';
 const report=()=>{
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   if(document.fonts.status!=='loaded')return;
   const height=Math.ceil(panel.offsetHeight),width=Math.ceil(panel.offsetWidth),key=height+':'+width;
   if(!height||key===last)return;
   last=key;
   panel.dataset.measured='true';
   // The first report also fades the native window in.
   action?.('captureSize',{height,width,reducedMotion:reducedMotion()}).catch(()=>{last='';});
  });
 };
 new ResizeObserver(report).observe(panel);
 document.fonts.ready.then(report);
 window.addEventListener('rpm-settings-refresh',report);
 return report;
}

function installOverflow(content,overflow,message){
 const update=()=>{
  const more=content.scrollHeight-content.clientHeight-content.scrollTop>3;
  overflow.hidden=!more;
  content.dataset.more=String(more);
 };
 overflow.addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
 overflow.addEventListener('click',()=>{
  content.scrollBy({top:Math.max(48,content.clientHeight-48),behavior:reducedMotion()?'instant':'smooth'});
 });
 content.addEventListener('scroll',update,{passive:true});
 new ResizeObserver(update).observe(content);
 new MutationObserver(update).observe(content,{childList:true,subtree:true,characterData:true});
 content.addEventListener('toggle',update,true);
 return update;
}

/** Drag the handle or header down to close, like a bottom sheet. */
function installSwipeToClose(panel,close){
 let start=null;
 const zone=e=>e.target.closest('.grab,.panel-header')&&!e.target.closest('button');
 panel.addEventListener('pointerdown',e=>{
  if(e.button!==0||!zone(e))return;
  start={y:e.clientY,id:e.pointerId,dy:0};
  panel.setPointerCapture?.(e.pointerId);
 });
 panel.addEventListener('pointermove',e=>{
  if(!start||e.pointerId!==start.id)return;
  start.dy=Math.max(0,e.clientY-start.y);
  panel.style.transform=start.dy?`translateY(${start.dy}px)`:'';
 });
 const end=e=>{
  if(!start||e.pointerId!==start.id)return;
  const {dy}=start;start=null;
  if(dy>72){close();return;}
  if(!dy)return;
  panel.style.transition=reducedMotion()?'':'transform 200ms cubic-bezier(.2,0,0,1)';
  panel.style.transform='';
  setTimeout(()=>{panel.style.transition='';},220);
 };
 panel.addEventListener('pointerup',end);
 panel.addEventListener('pointercancel',end);
}

export function installCapturePresentation({action}){
 const $=id=>document.getElementById(id);
 const panel=$('panel'),content=$('content'),message=$('message');
 installInsets(panel);
 const report=installSizeReport(panel,action);
 const updateOverflow=installOverflow(content,$('capture-overflow'),message);
 const syncMotion=()=>{panel.dataset.motion=reducedMotion()?'reduced':'full';};
 prefersReduced?.addEventListener?.('change',syncMotion);
 window.addEventListener('rpm-phone-status',syncMotion);
 syncMotion();
 // A tap on the transparent host outside the panel closes Capture.
 document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target))action?.('minimize').catch(()=>{});});
 installSwipeToClose(panel,()=>action?.('minimize').catch(()=>{}));
 return {report,updateOverflow,syncMotion};
}
