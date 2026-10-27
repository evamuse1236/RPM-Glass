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
 const root=document.documentElement;
 const keyboardUp=()=>parseFloat(root.style.getPropertyValue('--keyboard-inset'))>0;
 let waiting=null;
 // The menu rises once: while the keyboard is up it first drops, then the menu shows in the space it leaves.
 function afterKeyboard(show){
  if(!keyboardUp())return show();
  document.getElementById('message')?.blur();
  const done=()=>{watch.disconnect();clearTimeout(timer);waiting=null;show();};
  const watch=new MutationObserver(()=>{if(!keyboardUp())done();});
  watch.observe(root,{attributes:true,attributeFilter:['style']});
  const timer=setTimeout(done,400);
  waiting=()=>{watch.disconnect();clearTimeout(timer);waiting=null;};
 }
 function open(){
  if(waiting)return;
  more.setAttribute('aria-expanded','true');
  afterKeyboard(()=>{
   scrim.hidden=false;sheet.hidden=false;
   sheet.querySelector('button')?.focus({preventScroll:true});
  });
 }
 function close({focus=true}={}){
  if(waiting){waiting();more.setAttribute('aria-expanded','false');return true;}
  if(!isOpen())return false;
  scrim.hidden=true;sheet.hidden=true;
  more.setAttribute('aria-expanded','false');
  if(focus)more.focus({preventScroll:true});
  return true;
 }
 more.addEventListener('click',()=>isOpen()||waiting?close():open());
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
