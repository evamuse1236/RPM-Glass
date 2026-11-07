/** Capture's voice card helpers: the words streaming in, and where a changed row opens in the planner. */
import {el} from './capture-dom.mjs';
import {reducedMotion} from './capture-presentation.mjs';
import {voiceMark,holdStage} from './voice-marks.mjs';

const COLLECTION={task:'tasks',block:'blocks',project:'projects',goal:'goals',area:'areas'};
const GONE=new Set(['Moved to Trash','Trash']);

/**
 * Words as they are heard, released at a steady pace (one word every `every` ms, two when far behind), each blurring in.
 * A transcript that rewrites earlier words, or Reduce Motion, shows the new text at once.
 */
export function wordStream(node,{every=110,reduced=reducedMotion,onWords=()=>{}}={}){
 let shown='',queue=[],timer=null;
 const tick=()=>{
  timer=null;
  for(const word of queue.splice(0,queue.length>12?2:1))node.append(el('span','w',word));
  if(node.querySelector('.w')){voiceMark('T5');onWords();}
  if(queue.length)timer=setTimeout(tick,every);
 };
 return {
  set(text,placeholder=''){
   if(text&&text===shown)return;
   if(text&&!shown)holdStage('T5');
   if(!text||!text.startsWith(shown)||reduced()){
    clearTimeout(timer);timer=null;queue=[];shown=text;node.textContent=text||placeholder;
    if(text){voiceMark('T5');onWords();}
    return;
   }
   if(!shown)node.textContent='';
   queue.push(...text.slice(shown.length).match(/\s*\S+\s*/g)??[]);
   shown=text;
   timer??=setTimeout(tick,0);
  },
 };
}

/** Where a tap opens a row in the planner, or null for a row with nothing left to edit (it went to the Trash). */
export function openTarget(row){
 const collection=COLLECTION[row.entity];
 if(!collection||row.id==null||GONE.has(row.verb))return null;
 return {collection,id:collection==='tasks'?Number(row.id):row.id};
}
