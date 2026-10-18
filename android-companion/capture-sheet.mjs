const UNBUILT={photos:'Photos',camera:'Camera',files:'Files'};
const TOAST_MS=2600;

export const SHEET_ROWS=Object.freeze({
 today:{send:'What’s planned today?'},
 result:{prefill:'Help me plan a Result: '},
 inbox:{send:'Sort my Inbox: place my loose tasks into Blocks.'},
 review:{open:'review'},
});

/**
 * The + sheet over a dimmed screen. Tiles open the planner, History, Context or Settings; Photos, Camera and Files
 * say they aren't built yet. Rows ask Capture, prefill the bar, or open the weekly review.
 */
export function installSheet({platform,send,prefill,setView}){
 const $=id=>document.getElementById(id);
 const sheet=$('sheet'),scrim=$('scrim'),plus=$('plus'),toast=$('toast');
 let toastTimer=null;
 const isOpen=()=>!sheet.hidden;
 function open(){
  scrim.hidden=false;sheet.hidden=false;
  plus.setAttribute('aria-expanded','true');
  sheet.querySelector('button')?.focus({preventScroll:true});
 }
 function close({focus=true}={}){
  if(!isOpen())return false;
  scrim.hidden=true;sheet.hidden=true;
  plus.setAttribute('aria-expanded','false');
  if(focus)plus.focus({preventScroll:true});
  return true;
 }
 function say(text){
  clearTimeout(toastTimer);
  toast.textContent=text;toast.hidden=false;
  toastTimer=setTimeout(()=>{toast.hidden=true;},TOAST_MS);
 }
 plus.addEventListener('click',()=>isOpen()?close():open());
 scrim.addEventListener('click',()=>close());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){e.preventDefault();close();}});
 for(const tile of sheet.querySelectorAll('[data-tile]'))tile.addEventListener('click',()=>{
  const name=tile.dataset.tile;
  close({focus:false});
  if(UNBUILT[name]){say(`${UNBUILT[name]} isn’t built yet`);return;}
  if(name==='planner')platform.openPlans();
  else if(name==='settings')platform.action('settings').catch(()=>{});
  else setView(name);
 });
 for(const row of sheet.querySelectorAll('[data-row]'))row.addEventListener('click',()=>{
  const plan=SHEET_ROWS[row.dataset.row];
  close({focus:false});
  if(plan.send)send(plan.send);
  else if(plan.prefill)prefill(plan.prefill);
  else platform.action('planner',{view:plan.open}).catch(()=>platform.openPlans());
 });
 let start=null;
 const grab=sheet.querySelector('.grab');
 sheet.addEventListener('pointerdown',e=>{if(e.target===grab||sheet.scrollTop<=0&&e.target.closest('.grab'))start={y:e.clientY,id:e.pointerId};});
 sheet.addEventListener('pointerup',e=>{if(start&&e.pointerId===start.id&&e.clientY-start.y>48)close();start=null;});
 sheet.addEventListener('pointercancel',()=>{start=null;});
 return {open,close,isOpen,say};
}
