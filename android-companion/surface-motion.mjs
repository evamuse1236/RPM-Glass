/** Interruptible, local motion. Storage and navigation never wait on decoration. */
const running=new Map();
const layouts=new Map();
export const MOTION=Object.freeze({navigate:220,enter:240,exit:160,feedback:180,ease:'cubic-bezier(.2,.8,.2,1)'});
export const reducedMotion=()=>globalThis.document?.documentElement.dataset.reduceMotion==='true'||!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function stopMotion(node){const previous=running.get(node);if(previous){running.delete(node);previous.cancel();}}
export function playMotion(node,frames,{duration=MOTION.feedback}={}){
 if(!node)return Promise.resolve(true);stopMotion(node);
 if(reducedMotion()||!node.animate)return Promise.resolve(true);
 const animation=node.animate(frames,{duration,easing:MOTION.ease});running.set(node,animation);
 return animation.finished.then(()=>{if(running.get(node)!==animation)return false;running.delete(node);return true;},()=>false);
}
export function enterSurface(node,direction='fade'){
 const transform={up:'translateY(16px)',down:'translateY(-16px)',right:'translateX(24px)',left:'translateX(-24px)',sheet:'translateY(32px)',fade:'translateY(6px)'}[direction]??'translateY(6px)';
 return playMotion(node,[{opacity:direction==='sheet'?.65:.8,transform},{opacity:1,transform:'none'}],{duration:direction==='sheet'?MOTION.enter:MOTION.navigate});
}
export function exitSurface(node){return playMotion(node,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(24px)'}],{duration:MOTION.exit});}

// Read the old and final geometry once. Only the decorative surface scales;
// text and controls translate at their original resolution. Layout never runs
// in an animation frame loop. A new change starts from the current visual pose.
export function animateLayout(owner,regions,mutate,{duration=180,enabled=true}={}){
 const specs=regions.filter(r=>r.node?.isConnected&&r.node.getClientRects().length);
 const before=specs.map(({node,clip})=>{const rect=node.getBoundingClientRect();const inset=clip?getComputedStyle(node).clipPath.match(/^inset\(([-.\d]+)px(?: ([-.\d]+)px)?(?: ([-.\d]+)px)?/):null;return {rect,visibleHeight:rect.height-(Number(inset?.[1])||0)-(Number(inset?.[3]??inset?.[1])||0)};});
 layouts.get(owner)?.cancel();mutate();
 if(!enabled||reducedMotion())return Promise.resolve(true);
 const after=specs.map(({node})=>node.getBoundingClientRect()),animations=[];
 for(let i=0;i<specs.length;i++){
  const {node,scale,clip}=specs[i],old=before[i],next=after[i];if(!node.animate||!next.width||!next.height)continue;
  const dx=old.rect.left-next.left,dy=old.rect.top-next.top;
  const sx=scale?old.rect.width/next.width:1,sy=scale?old.rect.height/next.height:1;
  const cut=clip?Math.max(0,next.height-old.visibleHeight):0;
  if(Math.abs(dx)<.5&&Math.abs(dy)<.5&&Math.abs(sx-1)<.001&&Math.abs(sy-1)<.001&&cut<.5)continue;
  const first={translate:`${dx}px ${dy}px`},last={translate:'0px 0px'};
  if(scale){Object.assign(first,{scale:`${sx} ${sy}`,transformOrigin:'0 0'});Object.assign(last,{scale:'1 1',transformOrigin:'0 0'});}
  if(clip){first.clipPath=`inset(0px 0px ${cut}px 0px)`;last.clipPath='inset(0px 0px 0px 0px)';}
  animations.push(node.animate([first,last],{duration,easing:MOTION.ease}));
 }
 if(!animations.length)return Promise.resolve(true);
 const root=owner.ownerDocument.documentElement;
 const cleanup=()=>{if(layouts.get(owner)!==group)return;layouts.delete(owner);delete owner.dataset.layoutAnimating;if(!layouts.size)delete root.dataset.layoutAnimating;};
 const group={cancel(){for(const a of animations)a.cancel();cleanup();}};
 layouts.set(owner,group);owner.dataset.layoutAnimating='true';root.dataset.layoutAnimating='true';
 return Promise.all(animations.map(a=>a.finished.then(()=>true,()=>false))).then(results=>{cleanup();return results.every(Boolean);});
}

const cancelReduced=()=>{if(reducedMotion()){for(const node of running.keys())stopMotion(node);for(const group of layouts.values())group.cancel();}};
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change',cancelReduced);
globalThis.window?.addEventListener('rpm-phone-status',cancelReduced);
