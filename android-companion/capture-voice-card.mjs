/** Capture's voice card: an orb that follows the voice, the words streaming in, and the changes on a spine. */
import {el,icon,iconButton} from './capture-dom.mjs';
import {reducedMotion} from './capture-presentation.mjs';

const GLYPH={Added:'add_task','New Block':'stacks','New Project':'folder','New Goal':'flag','New Area':'category',
 Done:'check',Reopened:'replay','Moved to Trash':'delete',Trash:'delete',Moved:'drive_file_move',Reordered:'swap_vert',Changed:'edit_note'};
const COLLECTION={task:'tasks',block:'blocks',project:'projects',goal:'goals',area:'areas'};
const GONE=new Set(['Moved to Trash','Trash']);

/** The voice orb. `level(0..1)` swells it with the mic or RPM's voice; it never redraws the card. */
export function orb(state='listening'){
 const node=el('span',`orb ${state}`);
 node.setAttribute('aria-hidden','true');
 node.append(el('i'),el('i'),el('i'));
 return node;
}
export function setLevel(node,level){node?.style.setProperty('--level',Math.max(0,Math.min(1,level)).toFixed(2));}

/**
 * Words as they are heard, released at a steady pace (one word every `every` ms, two when far behind), each blurring in.
 * A transcript that rewrites earlier words, or Reduce Motion, shows the new text at once.
 */
export function wordStream(node,{every=110,reduced=reducedMotion}={}){
 let shown='',queue=[],timer=null;
 const tick=()=>{
  timer=null;
  for(const word of queue.splice(0,queue.length>12?2:1))node.append(el('span','w',word));
  if(queue.length)timer=setTimeout(tick,every);
 };
 return {
  set(text,placeholder=''){
   if(text&&text===shown)return;
   if(!text||!text.startsWith(shown)||reduced()){
    clearTimeout(timer);timer=null;queue=[];shown=text;node.textContent=text||placeholder;return;
   }
   if(!shown)node.textContent='';
   queue.push(...text.slice(shown.length).match(/\s*\S+\s*/g)??[]);
   shown=text;
   timer??=setTimeout(tick,0);
  },
 };
}

/** Where Edit opens a row in the planner, or null for a row with nothing left to edit (it went to the Trash). */
export function openTarget(row){
 const collection=COLLECTION[row.entity];
 if(!collection||row.id==null||GONE.has(row.verb))return null;
 return {collection,id:collection==='tasks'?Number(row.id):row.id};
}

function details(row){
 if(row.was&&row.when)return [el('s','',row.was),` ${row.when}`];
 const parts=[row.when,row.where&&row.where!=='Inbox'?row.where:null,row.alert==='alarm'?'alarm':row.alert?'reminder':null].filter(Boolean);
 return parts.length?[parts.join(', ')]:[row.verb==='Added'?'Inbox':row.verb];
}

/** One change on the spine. Rows with an open target are buttons that only act while the card is editing. */
export function spineRow(row,{open,editing}){
 const item=el('li','spine-row');
 const glyph=el('span','spine-glyph');
 glyph.append(icon(GLYPH[row.verb]??'edit_note'));
 const text=el('span','spine-text');
 const when=el('span','spine-when');when.append(...details(row));
 text.append(el('span','spine-title',row.title||'Untitled'),when);
 const target=open&&openTarget(row);
 if(!target){item.classList.add('plain');item.append(glyph,text);return item;}
 const button=el('button','spine-open');
 button.type='button';
 button.setAttribute('aria-label',`Edit ${row.title||'this item'}`);
 button.tabIndex=-1;
 button.append(glyph,text,icon('chevron_right',{cls:'spine-chevron'}));
 button.addEventListener('click',()=>{if(editing())open(target);});
 item.append(button);
 return item;
}

export function spine(rows,options){
 const list=el('ul','spine');
 list.append(...rows.map(row=>spineRow(row,options)));
 return list;
}

/** The scroll box under the card's top: the card keeps a solid edge and the list scrolls inside it. */
export function scrollBox(...children){
 const box=el('div','voice-scroll');
 box.append(...children);
 return box;
}

export function tools(...buttons){
 const dock=el('div','voice-dock'),capsule=el('div','voice-tools');
 capsule.append(...buttons.filter(Boolean));
 dock.append(capsule);
 return dock;
}

/** Discard, Edit and Open planner as symbols. Edit with one editable change opens it; with more, rows become buttons. */
export function receiptTools(node,{rows,discard,openPlanner,openItem}){
 const editable=rows.map(openTarget).filter(Boolean);
 let edit=null;
 if(editable.length){
  edit=iconButton('edit','Edit the changes',()=>{
   if(editable.length===1){openItem(editable[0]);return;}
   const on=node.classList.toggle('editing');
   edit.setAttribute('aria-pressed',String(on));
   for(const b of node.querySelectorAll('.spine-open'))b.tabIndex=on?0:-1;
  },{pressed:false});
 }
 const bin=discard?iconButton('delete','Discard this ramble',discard,{cls:'danger'}):null;
 return tools(bin,edit,iconButton('open_in_new','Open planner',openPlanner));
}
