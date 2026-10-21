import {el,icon,button} from './capture-dom.mjs';
import {line} from './capture-lines.mjs';
import {latestEdit} from './capture-session.mjs';
import {KIND_ICON,NOUN,chipsFor,trayOptions,editPayload,isCurrent,hhmm,timeLabel} from './capture-chips.mjs';
import {whenOf} from './planner/task-values.mjs';
import {localDay} from './planner-state.mjs';

export const FULL_ITEMS=3;
export const SHOWN_ITEMS=6;
const ENTITY={task:'Task',block:'Block',project:'Project',goal:'Goal',area:'Area'};
const LONG_LIST=8;

/**
 * The receipt's created items as a kind icon, a title and chips. A chip tap opens one tray under its item;
 * a choice saves at once through edit-item and gets its own Undo in the change row.
 */
export function createChipCard({act,refresh,choices=()=>null,today=localDay}){
 const st={open:null,saving:null,failed:null,popped:null,expanded:new Set(),showAll:new Set(),held:null};
 const live=new Map();

 const itemKeyOf=(draft,row)=>`${draft.id}|${row.entity}:${row.id}`;
 const ctxOf=key=>key?live.get(key.slice(0,key.lastIndexOf('|'))):null;
 const opts=()=>({choices:choices(),today:today()});

 function closeTray(){
  const key=st.open;
  if(!key)return false;
  st.open=null;
  const ctx=ctxOf(key);
  if(!ctx)return true;
  if(key.endsWith('|title'))ctx.head.replaceWith(ctx.head=head(ctx));
  else{
   const chip=ctx.chips.get(key);
   chip?.classList.remove('open');chip?.setAttribute('aria-expanded','false');
   ctx.tray.classList.remove('open');ctx.tray.inert=true;
  }
  return true;
 }

 function toggle(ctx,key){
  st.held=ctx.draft.id;
  if(st.open===key){closeTray();return;}
  closeTray();
  st.open=key;st.failed=null;
  if(key.endsWith('|title')){ctx.head.replaceWith(ctx.head=head(ctx));ctx.head.focus?.();return;}
  fillTray(ctx,key);
  ctx.tray.querySelector?.('.current,textarea,input,button')?.focus?.({preventScroll:true});
 }

 async function save(ctx,chipKey,choice,optimistic){
  const key=`${ctx.itemKey}|${chipKey}`,{draft,row}=ctx;
  const payload=editPayload(chipKey,row,choice,opts());
  if(!payload||(chipKey==='title'&&payload.clear)){closeTray();return null;}
  closeTray();
  st.saving={key,label:optimistic};st.failed=null;st.held=draft.id;
  refresh();
  const result=await act({kind:'edit-item',conversationId:draft.conversationId,draftId:draft.id,entity:row.entity,id:String(row.id),...payload});
  st.saving=null;
  if(result==null)st.failed=key;else st.popped=key;
  refresh();
  return result;
 }

 function chipNode(ctx,c){
  const key=`${ctx.itemKey}|${c.key}`,saving=st.saving?.key===key;
  const state=saving?'filled':c.state;
  const cls=['edit-chip',state,c.tone,st.open===key&&'open',saving&&'saving',st.failed===key&&'failed',st.popped===key&&'pop',c.readOnly&&'read-only'];
  const node=el(c.readOnly?'span':'button',cls.filter(Boolean).join(' '));
  node.dataset.chip=c.key;
  node.append(icon(c.icon,{fill:state==='lit'||c.tone==='must'}),el('span','chip-label tnum',saving?st.saving.label:c.label));
  node.setAttribute('aria-label',c.aria);
  if(st.popped===key)st.popped=null;
  if(c.readOnly)return node;
  node.type='button';
  node.setAttribute('aria-expanded',String(st.open===key));
  node.addEventListener('click',()=>toggle(ctx,key));
  ctx.chips.set(key,node);
  return node;
 }

 function pickNode(ctx,chipKey,o){
  const node=button(o.label,()=>{
   if(isCurrent(chipKey,ctx.row,o.choice,opts())){closeTray();return;}
   save(ctx,chipKey,o.choice,o.label);
  },{role:'text',cls:['tray-pick',o.current&&'current'].filter(Boolean).join(' '),ariaLabel:o.aria===o.label?null:o.aria});
  node.setAttribute('aria-pressed',String(!!o.current));
  return node;
 }

 function textField(value,{label,cls,onSave}){
  const field=el('textarea',cls);
  field.value=value;field.rows=1;
  field.setAttribute('aria-label',label);
  field.setAttribute('enterkeyhint','done');
  let done=false;
  const finish=keep=>{if(done)return;done=true;keep?onSave(field.value):closeTray();};
  field.addEventListener('keydown',e=>{
   if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();finish(true);}
   else if(e.key==='Escape'){e.preventDefault();finish(false);}
  });
  field.addEventListener('blur',()=>finish(true));
  return field;
 }

 function timeRange(ctx,tray){
  const {day}=whenOf(ctx.row.edit),r=tray.range;
  const input=el('input','time-range');
  input.type='range';input.min=String(r.min);input.max=String(r.max);input.step=String(r.step);input.value=String(r.value);
  const label=()=>timeLabel(day||today(),hhmm(Number(input.value)));
  input.setAttribute('aria-label','Time');input.setAttribute('aria-valuetext',label());
  input.addEventListener('input',()=>{
   input.setAttribute('aria-valuetext',label());
   const chip=ctx.chips.get(`${ctx.itemKey}|time`)?.querySelector?.('.chip-label');
   if(chip)chip.textContent=label();
  });
  input.addEventListener('change',()=>save(ctx,'time',hhmm(Number(input.value)),label()));
  return input;
 }

 function fillTray(ctx,key){
  const chipKey=key.slice(key.lastIndexOf('|')+1),tray=trayOptions(chipKey,ctx.row,opts());
  const chip=ctx.chips.get(key);
  chip?.classList.add('open');chip?.setAttribute('aria-expanded','true');
  const inner=el('div','tray-inner');
  if(tray.type==='text'){
   inner.append(textField(tray.value,{label:NOUN[chipKey]==='purpose'?'Purpose':chipKey,cls:'tray-text',
    onSave:v=>v.trim()===tray.value.trim()?closeTray():save(ctx,chipKey,v,v.trim()||'Add purpose')}));
  }else{
   const picks=el('div',chipKey==='day'?'tiles tray-picks':['tray-picks',tray.options.length>LONG_LIST&&'long'].filter(Boolean).join(' '));
   picks.append(...tray.options.map(o=>pickNode(ctx,chipKey,o)));
   inner.append(picks);
   if(tray.type==='time')inner.append(timeRange(ctx,tray));
  }
  ctx.tray.replaceChildren(inner);
  ctx.tray.classList.add('open');ctx.tray.inert=false;
 }

 function head(ctx){
  const {row}=ctx,key=`${ctx.itemKey}|title`,noun=ENTITY[row.entity]??'Item';
  if(st.open===key){
   return textField(row.title??'',{label:`${noun} title`,cls:'item-title-edit',
    onSave:v=>v.trim()===String(row.title??'').trim()?closeTray():save(ctx,'title',v,v.trim())});
  }
  const saving=st.saving?.key===key;
  const node=el('button',['item-head',saving&&'saving',st.failed===key&&'failed'].filter(Boolean).join(' '));
  node.type='button';
  node.append(icon(KIND_ICON[row.entity]??'check_circle'),el('span','item-title',saving?st.saving.label:row.title||'Untitled'));
  node.setAttribute('aria-label',`${noun}: ${row.title||'Untitled'}. Change title`);
  node.addEventListener('click',()=>toggle(ctx,key));
  return node;
 }

 function fullItem(draft,row){
  const ctx={itemKey:itemKeyOf(draft,row),draft,row,chips:new Map()};
  live.set(ctx.itemKey,ctx);
  ctx.node=el('li','chip-item');
  ctx.head=head(ctx);
  const chips=el('div','item-chips');
  chips.setAttribute('role','group');
  chips.setAttribute('aria-label',`${row.title||'Item'} details`);
  chips.append(...chipsFor(row,opts()).map(c=>chipNode(ctx,c)));
  ctx.tray=el('div','chip-tray');ctx.tray.inert=true;
  const open=st.open&&ctxOf(st.open)===ctx&&!st.open.endsWith('|title')?st.open:null;
  ctx.node.append(ctx.head,chips,ctx.tray);
  if(open)fillTray(ctx,open);
  return ctx.node;
 }

 function compactItem(draft,row){
  const node=el('li','chip-item compact');
  const open=el('button','item-compact');
  open.type='button';
  open.append(icon(KIND_ICON[row.entity]??'check_circle'),el('span','item-title',row.title||'Untitled'),icon('expand_more'));
  open.setAttribute('aria-label',`${ENTITY[row.entity]??'Item'}: ${row.title||'Untitled'}. Show details`);
  open.addEventListener('click',()=>{st.held=draft.id;st.expanded.add(itemKeyOf(draft,row));node.replaceWith(fullItem(draft,row));});
  node.append(open);
  return node;
 }

 function list(capture){
  const draft=capture.draft,rows=draft.lines??[],all=st.showAll.has(draft.id);
  const node=el('ul','chip-items');
  const shown=all||rows.length<=SHOWN_ITEMS?rows:rows.slice(0,SHOWN_ITEMS);
  node.append(...shown.map((row,i)=>!row.edit?line(row)
   :i<FULL_ITEMS||all||st.expanded.has(itemKeyOf(draft,row))?fullItem(draft,row):compactItem(draft,row)));
  if(shown.length<rows.length){
   const more=el('li','chip-item compact');
   const b=button(`+${rows.length-shown.length} more`,()=>{st.held=draft.id;st.showAll.add(draft.id);node.replaceWith(list(capture));},{role:'text',cls:'item-compact'});
   more.append(b);node.append(more);
  }
  return node;
 }

 /** The item list for one receipt card; a tap in the card outside the tray and chips closes the tray. */
 function items(capture,cardNode){
  cardNode.addEventListener('click',e=>{
   if(st.open&&!e.target?.closest?.('.chip-tray,.edit-chip,.item-head,.item-title-edit'))closeTray();
  });
  return list(capture);
 }

 /** "Time set to 7 PM · Undo" while that edit is still the latest Undo; the footer Undo still takes back all. */
 function changeRow(capture,undoId){
  const draft=capture.draft,edit=latestEdit(draft);
  if(!edit||!undoId||edit.undoId!==undoId)return null;
  const row=el('div','change-row');
  row.setAttribute('role','status');
  row.append(icon('undo'),el('span','change-label',edit.label??'Changed'),
   button('Undo',()=>act({kind:'undo-edit',conversationId:draft.conversationId,draftId:draft.id,undoId:edit.undoId}).then(refresh),
    {role:'text',ariaLabel:`Undo ${NOUN[edit.field]??'last'} change`}));
  return row;
 }

 return {items,changeRow,closeTray,held:draftId=>!!draftId&&st.held===draftId};
}
