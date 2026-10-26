import {readForming} from '../intent-v2/src/forming.mjs';
import {pendingRow} from './capture-receipt.mjs';
import {rowFacts} from './capture-lines.mjs';
import {taskSymbol} from './task-symbol.mjs';
import {KIND_ICON} from './capture-chips.mjs';
import {el,icon} from './capture-dom.mjs';
import {EASE,DURATION,MOTION,reducedMotion} from './motion-core.mjs';

export const READ_IDLE_MS=900;
export const READ_MIN_CHARS=12;
export const READ_MIN_WORDS=3;
export const READ_MAX_CHARS=1500;
export const READS_PER_DRAFT=4;

export const instantRows=(text,{now=new Date()}={})=>readForming(text,{now}).map(row=>pendingRow(row,now));

export function worthReading(text){
 const said=String(text??'').trim();
 return said.length>=READ_MIN_CHARS&&said.length<READ_MAX_CHARS&&(said.match(/\p{L}+/gu)??[]).length>=READ_MIN_WORDS;
}

export function createReadGate({read,onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,idleMs=READ_IDLE_MS,limit=READS_PER_DRAFT}){
 let text='',allowed=false,timer=null,flight=null,count=0;
 const answers=new Map();
 const waiting=()=>allowed&&!answers.has(text)&&(timer!==null||flight?.text===text);
 const state=()=>({text,rows:answers.get(text)??null,reading:waiting(),reads:count});
 const emit=()=>onChange(state());
 const stop=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const abort=()=>{flight?.controller.abort();flight=null;};
 function start(){
  timer=null;
  if(!allowed||answers.has(text)||flight?.text===text||count>=limit){emit();return;}
  abort();
  const controller=new AbortController(),asked=text;
  flight={text:asked,controller};count++;
  emit();
  Promise.resolve().then(()=>read(asked,controller.signal)).catch(()=>null).then(result=>{
   if(flight?.controller===controller)flight=null;
   if(controller.signal.aborted)return;
   answers.set(asked,result?.status==='read'&&result.rows?.length?result.rows:null);
   if(asked===text)emit();
  });
 }
 return {
  type(next,{enabled=false}={}){
   const permit=enabled&&worthReading(next);
   if(next===text&&permit===allowed){emit();return;}
   text=next;allowed=permit;
   stop();
   if(flight&&(flight.text!==next||!allowed))abort();
   if(allowed&&!answers.has(next)&&count<limit&&flight?.text!==next)timer=setTimer(start,idleMs);
   emit();
  },
  sent(){stop();flight=null;count=0;answers.clear();text='';allowed=false;emit();},
  state,
 };
}

const factKey=node=>node.classList.contains('fact-reading')?'reading':node.querySelector('.ms')?.textContent??node.textContent;

function readingChip(){
 const chip=el('li','fact fact-reading');
 chip.append(icon('auto_awesome'),el('span','fact-now','Reading'));
 return chip;
}

function syncFacts(list,next){
 const kept=new Map([...list.children].map(n=>[factKey(n),n]));
 const order=next.map(chip=>{
  const key=factKey(chip),old=kept.get(key);
  kept.delete(key);
  if(!old){chip.classList.add('pop');return chip;}
  if(old.textContent!==chip.textContent)old.replaceChildren(...chip.childNodes);
  return old;
 });
 for(const node of kept.values())node.remove();
 order.forEach((node,i)=>{if(list.children[i]!==node)list.insertBefore(node,list.children[i]??null);});
}

function formingCard(){
 const node=el('section','card enter forming');
 const head=el('div','forming-head'),pill=el('span','forming-pill');
 pill.append(icon('task_alt',{fill:true}));
 head.append(pill,el('p','forming-title'));
 node.append(head,el('ul','facts'));
 return node;
}

function paintCard(node,row,{reading}){
 const title=row.title||'Untitled',symbol=row.entity==='task'?taskSymbol(title):KIND_ICON[row.entity],pill=node.querySelector('.forming-pill');
 if(pill.firstChild.textContent!==symbol)pill.firstChild.textContent=symbol;
 if(row.tone)pill.dataset.tone=row.tone;else delete pill.dataset.tone;
 const heading=node.querySelector('.forming-title');
 if(heading.textContent!==title)heading.textContent=title;
 node.setAttribute('aria-label',`Not saved yet: ${title}`);
 syncFacts(node.querySelector('.facts'),[...rowFacts(row),...(reading?[readingChip()]:[])]);
}

export function paintForming(host,rows,{reading=false}={}){
 while(host.children.length>rows.length)host.lastElementChild.remove();
 rows.forEach((row,i)=>{
  const node=host.children[i]??host.appendChild(formingCard());
  paintCard(node,row,{reading:reading&&i===rows.length-1});
 });
}

const forms=op=>op?.kind==='create'&&op.opId&&op.title&&KIND_ICON[op.entity];

const opRow=(op,row)=>{
 if(op.entity!=='task')return {...pendingRow({id:op.opId,title:op.title}),entity:op.entity};
 const when=op.time?instantRows(`${op.title} ${op.time}`)[0]?.when:null;
 return {...(row?.entity==='task'?row:pendingRow({title:op.title})),id:op.opId,title:op.title,when:when??row?.when??null,minutes:op.minutes??row?.minutes??null};
};

function glide(item,from,still){
 if(still||!from||!item.animate)return;
 const to=item.getBoundingClientRect(),dx=from.left-to.left,dy=from.top-to.top;
 if(dx||dy)item.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:DURATION.medium1,easing:EASE.emphasizedDecelerate});
}

function pairUp(cards,items){
 const pairs=new Map(),free=new Set(items);
 for(const c of cards){
  const item=c.op&&items.find(n=>free.has(n)&&n.dataset.op===c.op);
  if(item){free.delete(item);pairs.set(c,item);}
 }
 for(const c of cards){
  if(pairs.has(c)||!free.size)continue;
  const [item]=free;
  free.delete(item);pairs.set(c,item);
 }
 return pairs;
}

export function installForming({host,platform,conversationId}){
 let text='',shown=true,held=null,reading=false,kept=false;
 const leaving=new Set();
 const draw=state=>{
  if(held||kept&&shown&&!text.trim())return;
  kept=false;
  for(const node of leaving)node.remove();
  leaving.clear();
  if(!shown||!text.trim()){host.replaceChildren();return;}
  paintForming(host,state.rows??instantRows(text),{reading:state.reading});
  host.scrollTop=host.scrollHeight;
 };
 const gate=createReadGate({read:(words,signal)=>platform.previewCapture?.(words,{conversationId:conversationId(),signal})??null,onChange:draw});
 const paintHeld=()=>{
  held.forEach((h,i)=>{
   h.node??=formingCard();
   paintCard(h.node,h.row,{reading:reading&&i===held.length-1});
   h.node.dataset.op=h.op??'';
   const after=i?held[i-1].node.nextSibling:host.firstChild;
   if(h.node!==after)host.insertBefore(h.node,after);
  });
  host.scrollTop=host.scrollHeight;
 };
 function leave(node,still){
  if(still||!node.animate){node.remove();return;}
  leaving.add(node);
  node.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px)'}],{duration:MOTION.exit,easing:EASE.emphasizedAccelerate,fill:'forwards'})
   .finished.catch(()=>{}).then(()=>{if(leaving.delete(node))node.remove();});
 }
 return {
  update(next,{enabled,visible}){text=next;shown=visible;gate.type(visible?next:'',{enabled:enabled&&visible});},
  hold(words,{reading:read=false}={}){
   if(!words.trim())return false;
   const guess=words===text?gate.state().rows:null,rows=guess??instantRows(words);
   host.setAttribute('aria-busy','true');
   kept=false;
   for(const node of leaving)node.remove();
   leaving.clear();
   const shown=rows.length?rows:[pendingRow({title:words.trim()})];
   paintForming(host,shown);
   held=shown.map((row,i)=>({op:null,row,node:host.children[i]}));
   reading=read;text='';
   gate.sent();
   paintHeld();
   return true;
  },
  fill(operations){
   if(!held)return;
   const free=held.filter(h=>!operations.some(op=>forms(op)&&op.opId===h.op));
   const next=operations.filter(forms).map(op=>{
    const slot=held.find(h=>h.op===op.opId)??free.shift()??{op:null,row:null,node:null};
    return {...slot,op:op.opId,row:opRow(op,slot.row)};
   });
   for(const h of held)if(h.node&&!next.some(n=>n.node===h.node))leave(h.node,reducedMotion());
   held=next;
   paintHeld();
  },
  lift(){
   if(!held)return ()=>false;
   const cards=held.map(h=>({op:h.op,node:h.node,from:h.node.getBoundingClientRect?.()??null}));
   return (content,{keep=false}={})=>{
    const rows=held.map(h=>h.row);
    held=null;host.removeAttribute('aria-busy');
    const pairs=pairUp(cards,content.querySelectorAll('.chip-items > li[data-op]')),still=reducedMotion();
    if(keep&&!pairs.size){
     if(text.trim())draw(gate.state());else{kept=true;paintForming(host,rows);}
     return false;
    }
    for(const c of cards){
     const item=pairs.get(c);
     if(!item){leave(c.node,still);continue;}
     c.node.remove();
     item.closest('.card')?.classList.replace('enter','kept');
     glide(item,c.from,still);
    }
    if(text.trim())draw(gate.state());
    return pairs.size>0;
   };
  },
  release(){held=null;host.removeAttribute('aria-busy');},
 };
}
