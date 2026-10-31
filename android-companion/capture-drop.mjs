/**
 * The voice drop in the composer button: one canvas disc that is the mic button at rest, breathes with your voice while
 * it listens, turns into three dots while RPM saves, splits into two bouncing dots while RPM talks, and shows a tick cut
 * into the disc when a request saves. Every shape is drawn around the canvas centre.
 */
import {el} from './capture-dom.mjs';
import {reducedMotion} from './capture-presentation.mjs';

export const SIZE=40;
const C=SIZE/2;
const SAVED_S=0.9;

/** A call phase as the drop's mode. Anything else is the resting mic button. */
export const MODE=Object.freeze({connecting:'listening',listening:'listening',working:'working',speaking:'speaking'});

/** The disc's radius for each mode, before the voice level swells it. */
const RADIUS=Object.freeze({idle:16,listening:8,working:8,speaking:8});

export function dropNode(){
 const node=el('canvas','drop');
 node.setAttribute('aria-hidden','true');
 node.dataset.drop='idle';
 return node;
}

function primary(node){
 const value=globalThis.getComputedStyle?.(node)?.getPropertyValue?.('--bar-primary')?.trim();
 return value||'#a8c7fa';
}

function check(ctx,progress){
 const k=Math.min(1,progress),a=[C-5.5,C+.5],b=[C-1.5,C+4.5],l1=Math.hypot(4,4),l2=Math.hypot(7.5,9),length=(l1+l2)*k;
 ctx.save();ctx.globalCompositeOperation='destination-out';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(...a);
 if(length<=l1)ctx.lineTo(a[0]+4*length/l1,a[1]+4*length/l1);
 else{ctx.lineTo(...b);const q=(length-l1)/l2;ctx.lineTo(b[0]+7.5*q,b[1]-9*q);}
 ctx.stroke();ctx.restore();
}

/** Draws one frame. `o` is the drop's state; `t` is seconds. */
export function drawDrop(ctx,o,t){
 ctx.clearRect(0,0,SIZE,SIZE);
 ctx.fillStyle=o.color;
 const dot=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
 const saved=o.savedAt==null?-1:(t-o.savedAt)/SAVED_S;
 if(saved>=0&&saved<1&&o.mode!=='idle'){
  dot(C,C,9*(1+.25*Math.sin(Math.PI*Math.min(1,saved*1.6))));
  check(ctx,saved*2.2);
  return;
 }
 if(o.mode==='working'){
  for(let i=0;i<3;i++){
   const lift=o.still?0:Math.max(0,Math.sin(t*6-i*.9));
   ctx.globalAlpha=.35+.65*(o.still?1:lift);
   dot(C+(i-1)*8,C-lift*2,3);
  }
  ctx.globalAlpha=1;
  return;
 }
 if(o.split>.05){
  for(const side of [-1,1]){
   const lift=o.still?0:Math.sin(t*7+(side>0?Math.PI:0))*o.level*3;
   dot(C+side*7*o.split,C-lift,(5+2.5*o.level)*(.6+.4*o.split));
  }
  return;
 }
 dot(C,C,o.radius);
}

/**
 * Plays the drop on `canvas`. `set(mode)` changes what it shows and `saved()` plays the tick once. The frame loop runs
 * only while something moves, so the resting button costs nothing. Reduce Motion draws each mode once, still.
 */
export function dropPlayer(canvas,{reduced=reducedMotion,frame=globalThis.requestAnimationFrame?.bind(globalThis),
 clock=()=>performance.now()/1000,dpr=()=>globalThis.devicePixelRatio||1}={}){
 const ctx=canvas.getContext?.('2d')??null;
 const o={mode:'idle',level:0,target:0,radius:RADIUS.idle,split:0,savedAt:null,color:'#a8c7fa',still:false};
 let running=false;
 if(ctx){
  const scale=dpr();
  canvas.width=SIZE*scale;canvas.height=SIZE*scale;
  ctx.setTransform(scale,0,0,scale,0,0);
 }
 const settled=t=>o.mode==='idle'&&Math.abs(o.radius-RADIUS.idle)<.05&&(o.savedAt==null||t-o.savedAt>SAVED_S);
 function step(){
  const t=clock();
  o.level+=(o.target-o.level)*.3;
  o.split+=((o.mode==='speaking'?1:0)-o.split)*.14;
  o.radius+=(RADIUS[o.mode]+(o.mode==='listening'?4*o.level:0)-o.radius)*.2;
  drawDrop(ctx,o,t);
  if(settled(t)){o.radius=RADIUS.idle;drawDrop(ctx,o,t);running=false;return;}
  frame(step);
 }
 function wake(){
  if(!ctx)return;
  o.color=primary(canvas);
  o.still=reduced()||!frame;
  if(o.still){
   o.split=o.mode==='speaking'?1:0;o.level=o.target;o.radius=RADIUS[o.mode]+(o.mode==='listening'?2:0);
   drawDrop(ctx,o,clock());
   return;
  }
  if(!running){running=true;frame(step);}
 }
 wake();
 return {
  set(mode){
   if(mode===o.mode)return;
   o.mode=mode;canvas.dataset.drop=mode;
   if(mode==='idle')o.target=0;
   wake();
  },
  saved(){
   if(o.mode==='idle')return;
   o.savedAt=clock();canvas.dataset.saved=String(Number(canvas.dataset.saved||0)+1);
   if(!o.still)wake();
  },
  level(value){
   o.target=Math.max(0,Math.min(1,value));
   if(o.mode!=='idle'&&!o.still)wake();
  },
  get mode(){return o.mode;},
 };
}

/** Follows the call: the phase picks the mode, and each new save moment plays the tick (a failed save does not). */
export function dropDirector(player){
 let moment=0;
 return function follow({phase=null,moment:saved=null}={}){
  player.set(MODE[phase]??'idle');
  if(saved&&saved.n!==moment){moment=saved.n;if(saved.kind!=='oops')player.saved();}
 };
}
