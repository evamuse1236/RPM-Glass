import {LONG_PRESS} from './task-swipe.mjs';

/** Capture's handle: a tap opens the planner; a hold, a right click or the menu key opens More (History, Context, Settings). */
export function installSheet({platform,setView}){
 const $=id=>document.getElementById(id);
 const sheet=$('sheet'),scrim=$('scrim'),more=$('more');
 const GO={
  planner:()=>platform.openPlans(),
  history:()=>setView('history'),
  context:()=>setView('context'),
  settings:()=>platform.action('settings').catch(()=>{}),
 };
 const isOpen=()=>!sheet.hidden;
 function open(){
  scrim.hidden=false;sheet.hidden=false;
  more.setAttribute('aria-expanded','true');
  sheet.querySelector('button')?.focus({preventScroll:true});
 }
 function close({focus=true}={}){
  if(!isOpen())return false;
  scrim.hidden=true;sheet.hidden=true;
  more.setAttribute('aria-expanded','false');
  if(focus)more.focus({preventScroll:true});
  return true;
 }
 let timer=0,from=null,heldOpen=false;
 const cancel=()=>{clearTimeout(timer);from=null;};
 more.addEventListener('pointerdown',e=>{
  if(e.button>0||e.isPrimary===false)return;
  heldOpen=false;from={x:e.clientX,y:e.clientY};
  timer=setTimeout(()=>{from=null;heldOpen=true;navigator.vibrate?.(10);open();},LONG_PRESS);
 });
 document.addEventListener('pointermove',e=>{if(from&&Math.hypot(e.clientX-from.x,e.clientY-from.y)>8)cancel();},true);
 document.addEventListener('pointerup',cancel,true);
 document.addEventListener('pointercancel',cancel,true);
 more.addEventListener('contextmenu',e=>{e.preventDefault();cancel();if(!heldOpen)open();});
 more.addEventListener('click',()=>{
  if(heldOpen){heldOpen=false;return;}
  if(isOpen())close();else platform.openPlans();
 });
 scrim.addEventListener('click',()=>close());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){e.preventDefault();close();}});
 for(const row of sheet.querySelectorAll('[data-go]'))row.addEventListener('click',()=>{
  close({focus:false});
  GO[row.dataset.go]();
 });
 let start=null;
 const grab=sheet.querySelector('.grab');
 sheet.addEventListener('pointerdown',e=>{if(e.target===grab||sheet.scrollTop<=0&&e.target.closest('.grab'))start={y:e.clientY,id:e.pointerId};});
 sheet.addEventListener('pointerup',e=>{if(start&&e.pointerId===start.id&&e.clientY-start.y>48)close();start=null;});
 sheet.addEventListener('pointercancel',()=>{start=null;});
 return {open,close,isOpen};
}
