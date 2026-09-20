// Vertical movement belongs to scrolling. Horizontal swipes reveal their intent
// before release; cancellation and short gestures never mutate the plan.
export function swipeAction(dx,dy){return Math.abs(dx)>=90&&Math.abs(dx)>Math.abs(dy)*1.5?(dx>0?'archive':'remove'):null;}
export function attachTaskSwipe(row,actions){
  let start=null,dragged=false;
  const reset=()=>{start=null;row.style.removeProperty('--swipe-offset');delete row.dataset.swipe;};
  row.addEventListener('pointerdown',e=>{if(e.isPrimary===false||e.button>0||e.target.closest('select,input,textarea'))return;start={x:e.clientX,y:e.clientY};dragged=false;});
  row.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>16&&Math.abs(dy)>Math.abs(dx)){reset();return;}if(Math.abs(dx)>16&&Math.abs(dx)>Math.abs(dy)*1.5){dragged=true;row.setPointerCapture?.(e.pointerId);row.dataset.swipe=dx>0?'Archive':'Delete';row.style.setProperty('--swipe-offset',Math.max(-110,Math.min(110,dx))+'px');}});
  row.addEventListener('pointerup',e=>{const action=start&&swipeAction(e.clientX-start.x,e.clientY-start.y);reset();if(action){dragged=true;actions[action]();}setTimeout(()=>dragged=false,0);});
  row.addEventListener('pointercancel',reset);
  row.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopImmediatePropagation();}},true);
}
