// Vertical movement belongs to scrolling. Horizontal swipes reveal their intent while dragging (Things and Todoist:
// right schedules, left deletes); cancellation and short gestures never change the plan.
export const SWIPE_COMMIT = 90;
export function swipeAction(dx,dy){return Math.abs(dx)>=SWIPE_COMMIT&&Math.abs(dx)>Math.abs(dy)*1.5?(dx>0?'schedule':'remove'):null;}

const REVEAL = {schedule: ['event_upcoming', 'Schedule'], remove: ['delete', 'Delete']};

/** The coloured layer under a dragged row: an icon and the word, so colour is never the only signal. */
function reveal(row, kind) {
  let layer = row.querySelector(':scope > .swipe-reveal');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'swipe-reveal';
    layer.setAttribute('aria-hidden', 'true');
    const symbol = document.createElement('span');
    symbol.className = 'ms';
    const word = document.createElement('span');
    word.className = 'swipe-word';
    layer.append(symbol, word);
    row.prepend(layer);
    // The row's own surface slides over the reveal, so the reveal shows only where the row has moved away.
    let surface = 'transparent';
    for (let node = row; node && surface === 'transparent'; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) surface = bg;
    }
    row.style.setProperty('--swipe-surface', surface === 'transparent' ? 'var(--surface)' : surface);
  }
  layer.dataset.kind = kind;
  const [symbol, word] = REVEAL[kind];
  layer.firstChild.textContent = symbol;
  layer.lastChild.textContent = word;
  return layer;
}

/**
 * actions: {schedule(row), remove(row)}. While dragging, the row follows the finger over its reveal; past the commit
 * distance the reveal fills (armed). On release a schedule springs the row back and opens the date choices; a delete
 * carries the row off the edge first, so the removal reads as the gesture's end.
 */
export function attachTaskSwipe(row,actions){
  let start=null,dragged=false;
  const motionOff=()=>document.documentElement.dataset.reduceMotion==='true'||matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clear=()=>{row.querySelector(':scope > .swipe-reveal')?.remove();row.style.removeProperty('--swipe-surface');delete row.dataset.swipe;delete row.dataset.armed;};
  const settle=()=>{
    start=null;
    if(!row.dataset.swipe){row.style.removeProperty('--swipe-offset');return;}
    row.classList.add('swipe-settling');
    row.style.setProperty('--swipe-offset','0px');
    const done=()=>{row.classList.remove('swipe-settling');row.style.removeProperty('--swipe-offset');clear();};
    if(motionOff())done();else setTimeout(done,200);
  };
  row.addEventListener('pointerdown',e=>{if(e.isPrimary===false||e.button>0||e.target.closest('select,input,textarea')||row.classList.contains('swipe-leaving'))return;start={x:e.clientX,y:e.clientY};dragged=false;row.classList.remove('swipe-settling');});
  row.addEventListener('pointermove',e=>{
    if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(!dragged&&Math.abs(dy)>16&&Math.abs(dy)>Math.abs(dx)){settle();return;}
    if(dragged||(Math.abs(dx)>16&&Math.abs(dx)>Math.abs(dy)*1.5)){
      dragged=true;row.setPointerCapture?.(e.pointerId);
      const kind=dx>0?'schedule':'remove';
      if(!actions[kind])return;
      reveal(row,kind);row.dataset.swipe=kind;
      row.dataset.armed=String(Math.abs(dx)>=SWIPE_COMMIT);
      const limit=row.offsetWidth*.6||160;
      row.style.setProperty('--swipe-offset',Math.max(-limit,Math.min(limit,dx))+'px');
    }
  });
  row.addEventListener('pointerup',e=>{
    const action=start&&swipeAction(e.clientX-start.x,e.clientY-start.y);
    if(!action||!actions[action]){settle();setTimeout(()=>dragged=false,0);return;}
    dragged=true;start=null;setTimeout(()=>dragged=false,0);
    if(action==='remove'){
      // Off the edge, then the row collapses where it was (the re-render keeps this row as its collapsing ghost).
      row.classList.add('swipe-settling','swipe-leaving');
      row.style.setProperty('--swipe-offset',-(row.offsetWidth+24)+'px');
      // A delete that did not happen brings the row back.
      const back=()=>{if(!row.isConnected)return;row.classList.remove('swipe-leaving');row.dataset.swipe='remove';settle();};
      const go=()=>{row.classList.remove('swipe-settling');Promise.resolve(actions.remove(row)).then(ok=>{if(ok===false)back();},back);};
      if(motionOff())go();else setTimeout(go,150);
      return;
    }
    settle();
    actions.schedule(row);
  });
  row.addEventListener('pointercancel',settle);
  row.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopImmediatePropagation();}},true);
}
