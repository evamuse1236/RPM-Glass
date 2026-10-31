import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {dropNode,dropPlayer,dropDirector,drawDrop,MODE,SIZE} from './capture-drop.mjs';

function recordingCanvas(){
 const calls=[];
 const ctx=new Proxy({},{get:(_,name)=>name==='calls'?calls:(...args)=>calls.push([name,...args]),set:(_,name,value)=>{calls.push(['set',name,value]);return true;}});
 return {ctx,calls,canvas:{dataset:{},getContext:()=>ctx,setAttribute(){}}};
}
const arcs=calls=>calls.filter(([name])=>name==='arc').map(([,x,y,r])=>({x,y,r}));
const still=()=>true;

test('every shape the drop draws is centred on the canvas, so the resting mic sits in the middle of its disc', () => {
 const {ctx,calls}=recordingCanvas();
 drawDrop(ctx,{mode:'idle',radius:16,split:0,level:0,savedAt:null,color:'#a8c7fa',still:true},0);
 assert.deepEqual(arcs(calls),[{x:SIZE/2,y:SIZE/2,r:16}]);
 for(const mode of ['working','speaking']){
  calls.length=0;
  drawDrop(ctx,{mode,radius:8,split:mode==='speaking'?1:0,level:.5,savedAt:null,color:'#a8c7fa',still:true},0);
  const xs=arcs(calls).map(a=>a.x),mid=(Math.min(...xs)+Math.max(...xs))/2;
  assert.equal(mid,SIZE/2,`${mode} is balanced around the centre`);
  assert.ok(arcs(calls).every(a=>a.y===SIZE/2),`${mode} sits on the centre line`);
 }
});

test('each call phase has one drop mode, and anything else is the resting mic button', () => {
 assert.deepEqual(MODE,{connecting:'listening',listening:'listening',working:'working',speaking:'speaking'});
 const {canvas}=recordingCanvas();
 const player=dropPlayer(canvas,{reduced:still,frame:null,clock:()=>0,dpr:()=>2});
 const follow=dropDirector(player);
 for(const [phase,mode] of [['connecting','listening'],['working','working'],['speaking','speaking'],['failed','idle'],[null,'idle']]){
  follow({phase});
  assert.equal(canvas.dataset.drop,mode,String(phase));
 }
 assert.equal(canvas.width,SIZE*2,'the canvas is drawn at the screen density');
});

test('a save ticks once while the call is live, and never at rest', () => {
 const {canvas}=recordingCanvas();
 const player=dropPlayer(canvas,{reduced:still,frame:null,clock:()=>0});
 player.saved();
 assert.equal(canvas.dataset.saved,undefined,'no tick on the resting button');
 player.set('listening');
 player.saved();
 assert.equal(canvas.dataset.saved,'1');
});

test('the frame loop stops once the drop settles at rest', () => {
 const {canvas}=recordingCanvas();
 const queue=[];
 let t=0;
 const player=dropPlayer(canvas,{reduced:()=>false,frame:fn=>queue.push(fn),clock:()=>t});
 player.set('listening');
 for(let i=0;i<5;i++){t+=.016;queue.shift()?.();}
 assert.ok(queue.length>0,'it animates while listening');
 player.set('idle');
 for(let i=0;i<200&&queue.length;i++){t+=.016;queue.shift()();}
 assert.equal(queue.length,0,'the loop ends at rest');
});

test('the composer gets a canvas drop with no style attribute', () => {
 installFakeDom();
 const node=dropNode();
 assert.equal(node.className,'drop');
 assert.equal(node.getAttribute('aria-hidden'),'true');
 assert.equal(node.getAttribute('style'),null);
});
