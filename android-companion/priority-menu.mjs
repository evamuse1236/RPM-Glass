// Anchored choices work in the app's minimal WebView as well as a browser.
export function openPriorityMenu(anchor,{count,current,onSelect,onClose=()=>{}}){
  const menu=document.createElement('div');menu.className='priority-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Choose priority');anchor.setAttribute('aria-expanded','true');
  let closed=false;
  const close=(focus=true)=>{if(closed)return;closed=true;menu.remove();anchor.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',keys,true);window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',scrolled,true);if(focus&&anchor.isConnected)anchor.focus({preventScroll:true});onClose();};
  const outside=e=>{if(!menu.contains(e.target)&&!anchor.contains(e.target))close(false);};
  const dismiss=()=>close(false),scrolled=e=>{if(e.target!==menu)close(false);};
  const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const choices=[...menu.children],i=choices.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?count-1:(i+(e.key==='ArrowDown'?1:-1)+count)%count;choices[next].focus();}};
  for(let i=1;i<=count;i++){const b=document.createElement('button');b.type='button';b.textContent='Priority '+i;b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(i===current));b.addEventListener('click',()=>{close();if(i!==current)onSelect(i);});menu.append(b);}
  document.body.append(menu);const r=anchor.getBoundingClientRect(),height=Math.min(menu.scrollHeight,320,window.innerHeight-24),width=menu.getBoundingClientRect().width;menu.style.maxHeight=height+'px';menu.style.left=Math.max(12,Math.min(r.right-width,window.innerWidth-width-12))+'px';menu.style.top=Math.max(12,Math.min(window.innerHeight-height-12,r.bottom+height+8<window.innerHeight?r.bottom+4:r.top-height-4))+'px';menu.scrollTop=Math.max(0,(menu.children[current-1]?.offsetTop??0)-height/2);
  document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',keys,true);window.addEventListener('resize',dismiss);document.addEventListener('scroll',scrolled,true);menu.children[current-1]?.focus({preventScroll:true});return close;
}
