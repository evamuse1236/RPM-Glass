/** Capture's voice table: one row per item a call changed, updated in place as the call goes on. */
import {el,icon} from './capture-dom.mjs';
import {reducedMotion} from './capture-presentation.mjs';
import {openTarget} from './capture-voice-card.mjs';
import {EASE,DURATION} from './motion-core.mjs';

const ICON={task:'task_alt',block:'stacks',project:'folder',goal:'flag',area:'category'};
const GONE=new Set(['Moved to Trash','Trash']);
const SAYS=new Set(['Done','Reopened','Moved']);
const NEW=new Set(['Added','New Block','New Project','New Goal','New Area']);

/**
 * One ordered list of rows from the call's requests, oldest first. A row is keyed `${entity}:${id}` (a row with no id
 * keeps its own key), in order of first appearance. A later row for the same key keeps its place: its non-null fields
 * win and its verb becomes the row's verb. `added` stays true once the call added the item.
 */
export function mergeVoiceRows(sources){
 const merged=new Map();
 for(const {request,rows=[]} of sources){
  rows.forEach((row,index)=>{
   const key=row.id==null?`new:${request}:${index}`:`${row.entity}:${row.id}`;
   const prior=merged.get(key);
   const next={...(prior??{}),key,requests:[...new Set([...(prior?.requests??[]),request])],added:!!prior?.added||NEW.has(row.verb)};
   for(const [field,value] of Object.entries(row))if(value!=null)next[field]=value;
   next.verb=row.verb;
   merged.set(key,next);
  });
 }
 return [...merged.values()];
}

const gone=row=>GONE.has(row.verb);
/** The second line: a new task's Block, the verb for Done, Reopened, Moved and the Trash, and nothing for a plain change. */
export function rowNote(row){
 if(gone(row))return 'Moved to Trash';
 if(SAYS.has(row.verb))return row.verb;
 if(row.entity==='task'&&row.added)return row.where??'';
 return '';
}

const play=(node,frames,options)=>{
 if(reducedMotion()||!node.animate)return Promise.resolve();
 const motion=node.animate(frames,{fill:'both',...options});
 return motion.finished.then(()=>motion,()=>null);
};

/** Swaps a cell's words: the old ones blur out upwards while the new ones blur in. The first value just appears. */
function morph(cell,text){
 if(cell.dataset.v===text)return false;
 const first=cell.dataset.v===undefined;
 cell.dataset.v=text;
 const old=[...cell.children].find(v=>!v.classList.contains('out')),fresh=el('span','v',text);
 cell.append(fresh);
 if(first||!old||reducedMotion()||!old.animate){old?.remove();return !first;}
 old.classList.add('out');
 play(old,[{opacity:1,filter:'blur(0)',transform:'none'},{opacity:0,filter:'blur(4px)',transform:'translateY(-4px)'}],
  {duration:DURATION.short4,easing:EASE.emphasizedAccelerate}).then(()=>old.remove());
 play(fresh,[{opacity:0,filter:'blur(4px)',transform:'translateY(4px)'},{opacity:1,filter:'blur(0)',transform:'none'}],
  {duration:DURATION.short4,delay:DURATION.short1,easing:EASE.emphasizedDecelerate}).then(motion=>motion?.cancel());
 return true;
}

function flash(item){item.classList.remove('flash');void item.offsetWidth;item.classList.add('flash');}
const frame=win=>new Promise(resolve=>(win.requestAnimationFrame??(fn=>setTimeout(fn,16)))(resolve));

/**
 * The table. `setRows(rows)` takes merged rows and changes only what differs: a new key folds in with a flash, a changed
 * cell blurs to its new value, a new entity slides the row's content out and back, and a missing key collapses.
 * Row nodes are never re-created. A row with somewhere to open is a button; a Trash row is not. A `still` table
 * (a past capture) shows its rows at once.
 */
export function voiceTable({openItem=()=>{},win=globalThis.window,still=false}={}){
 const node=el('div','voice-table');
 node.setAttribute('role','list');
 const rows=new Map();

 function shell(){
  const row=el('div','voice-row shut'),clip=el('div','voice-row-clip'),lane=el('span','voice-lane');
  row.setAttribute('role','listitem');
  const glyph=el('span','voice-glyph'),what=el('span','voice-what');
  const title=el('span','voice-title cell'),note=el('span','voice-note cell');
  const right=el('span','voice-when'),alarm=icon('alarm',{cls:'voice-alarm'}),when=el('span','cell');
  what.append(title,note);right.append(alarm,when);lane.append(glyph,what,right);
  clip.append(lane);row.append(clip);
  return {row,clip,lane,glyph,title,note,when,alarm,item:null,data:null,pending:null};
 }

 function holder(entry,data){
  const target=gone(data)?null:openTarget(data);
  const wants=target?'button':'div';
  entry.target=target;
  if(entry.item&&entry.wants===wants)return;
  entry.wants=wants;
  const item=el(wants,'voice-item');
  if(target){item.type='button';item.addEventListener('click',()=>{if(entry.target)openItem(entry.target);});}
  item.append(entry.lane);
  entry.item?.remove();
  entry.clip.append(item);
  entry.item=item;
 }

 function paint(entry,data){
  holder(entry,data);
  entry.row.dataset.key=data.key;
  entry.row.dataset.verb=data.verb;
  entry.row.dataset.requests=data.requests.join(' ');
  entry.row.classList.toggle('gone',gone(data));
  if(entry.glyph.textContent!==ICON[data.entity])entry.glyph.replaceChildren(icon(ICON[data.entity]??'edit_note'));
  entry.alarm.hidden=data.alert!=='alarm';
  if(entry.target)entry.item.setAttribute('aria-label',[data.title||'Untitled',rowNote(data),data.when].filter(Boolean).join(', '));
  let changed=morph(entry.title,data.title||'Untitled');
  changed=morph(entry.note,rowNote(data))||changed;
  changed=morph(entry.when,data.when??'')||changed;
  entry.note.hidden=!rowNote(data);
  entry.data=data;
  return changed;
 }

 async function retype(entry,data){
  entry.pending=data;
  await play(entry.lane,[{transform:'none',opacity:1,filter:'blur(0)'},{transform:'translateX(48px)',opacity:0,filter:'blur(4px)'}],
   {duration:DURATION.short3,easing:EASE.emphasizedAccelerate});
  for(const cell of [entry.title,entry.note,entry.when]){delete cell.dataset.v;cell.replaceChildren();}
  paint(entry,entry.pending);
  entry.pending=null;
  for(const motion of entry.lane.getAnimations?.()??[])motion.cancel();
  play(entry.lane,[{transform:'translateX(-48px)',opacity:0,filter:'blur(4px)'},{transform:'none',opacity:1,filter:'blur(0)'}],
   {duration:DURATION.medium1,easing:EASE.emphasizedDecelerate}).then(motion=>motion?.cancel());
  flash(entry.item);
 }

 async function remove(key,entry){
  rows.delete(key);
  entry.row.classList.add('leaving');
  if(!reducedMotion()){entry.row.classList.add('gone');await new Promise(resolve=>setTimeout(resolve,DURATION.medium4));}
  entry.row.classList.add('shut');
  if(!reducedMotion())await new Promise(resolve=>setTimeout(resolve,DURATION.medium2));
  entry.row.remove();
 }

 function setRows(next){
  const keys=new Set(next.map(row=>row.key));
  for(const [key,entry] of rows)if(!keys.has(key))remove(key,entry);
  for(const data of next){
   let entry=rows.get(data.key);
   if(!entry){
    entry=shell();rows.set(data.key,entry);
    paint(entry,data);node.append(entry.row);
    if(still||reducedMotion())entry.row.classList.remove('shut');
    else frame(win).then(()=>frame(win)).then(()=>{entry.row.classList.remove('shut');flash(entry.item);});
    continue;
   }
   if(entry.pending){entry.pending=data;continue;}
   if(entry.data.entity!==data.entity){retype(entry,data);continue;}
   if(paint(entry,data))flash(entry.item);
  }
 }

 return {node,setRows,size:()=>rows.size};
}
