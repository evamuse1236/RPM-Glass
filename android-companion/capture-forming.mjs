import {readForming} from '../intent-v2/src/forming.mjs';
import {pendingRow} from './capture-receipt.mjs';
import {rowFacts} from './capture-lines.mjs';
import {taskSymbol} from './task-symbol.mjs';
import {el,icon} from './capture-dom.mjs';

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
 const title=row.title||'Untitled',symbol=taskSymbol(title),pill=node.querySelector('.forming-pill');
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

export function installForming({host,platform,conversationId}){
 let text='',shown=true;
 const draw=state=>{
  if(!shown||!text.trim()){host.replaceChildren();return;}
  paintForming(host,state.rows??instantRows(text),{reading:state.reading});
  host.scrollTop=host.scrollHeight;
 };
 const gate=createReadGate({read:(words,signal)=>platform.previewCapture?.(words,{conversationId:conversationId(),signal})??null,onChange:draw});
 return {
  update(next,{enabled,visible}){text=next;shown=visible;gate.type(visible?next:'',{enabled:enabled&&visible});},
  sent(){text='';gate.sent();},
 };
}
