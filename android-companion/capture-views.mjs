// Secondary Capture views reached from More: History, a past conversation,
// Context and About. Records are archived or restored, never deleted.
import {formattedReply} from '../chat-prototype/reply-format.mjs';
import {el,icon,button} from './capture-dom.mjs';
import {historyCard} from './capture-card.mjs';

function intro(frag,text){
 frag.append(el('p','view-intro',text));
}

function recordAction(row,collection,item,turn){
 const restore=item.archived;
 row.append(button(restore?'Restore':'Archive',()=>turn({type:restore?'restore':'archive',collection,id:item.id}),{role:'text'}));
}

export function renderHistory(frag,{state,conversationId,countFor,openConversation,turn}){
 const head=el('div','view-head');
 head.append(el('p','view-intro','Previous captures and conversations. New conversations keep your plans and memory.'));
 head.append(button('New conversation',()=>turn({type:'new'}),{role:'tonal',iconName:'add'}));
 frag.append(head);
 const list=el('div','list');
 for(const c of state.conversations.toReversed()){
  const row=el('div','list-row'+(c.archived?' archived':''));
  const open=el('button','list-main');
  open.type='button';
  open.append(icon(c.id===conversationId?'chat_bubble':'chat_bubble_outline'));
  const text=el('span','list-text');
  const total=c.messages.length+countFor(c.id);
  text.append(el('span','list-title',c.title),el('span','list-sub',`${total} ${total===1?'message':'messages'}${c.archived?' · archived':''}${c.id===conversationId?' · current':''}`));
  open.append(text);
  open.addEventListener('click',()=>openConversation(c.id));
  row.append(open);
  if(c.id!==conversationId||c.archived)recordAction(row,'conversations',c,turn);
  list.append(row);
 }
 frag.append(list);
}

function legacyMessage(m,{state,receiptsFor,turn}){
 if(m.role==='user'){
  return el('p','bubble user',m.text);
 }
 const row=el('div','bubble assistant');
 const receipts=receiptsFor(m);
 row.append(formattedReply(receipts.length&&m.text!=='Saved.'?'Saved.':m.text));
 for(const r of receipts)row.append(el('p','detail-note',[r.status,r.title].filter(Boolean).join(' · ')));
 if(m.undoId&&m.undoId===state.undoId)row.append(button('Undo this change',()=>turn({type:'undo',undoId:m.undoId}),{role:'text',iconName:'undo'}));
 return row;
}

export function renderConversation(frag,{state,conversation,page,cardContext,showMore,receiptsFor,turn}){
 intro(frag,conversation.archived?'Archived conversation. Restore it from History before capturing here.':'Captures from this conversation, newest first.');
 for(const capture of page.captures??[])frag.append(historyCard(capture,cardContext));
 if(page.hasMore)frag.append(button('Show older captures',showMore,{role:'text',iconName:'expand_more'}));
 if(conversation.messages.length){
  frag.append(el('h2','section-title','Earlier messages'));
  for(const m of conversation.messages)frag.append(legacyMessage(m,{state,receiptsFor,turn}));
 }
 if(!(page.captures??[]).length&&!conversation.messages.length)frag.append(el('p','empty','Nothing captured here yet.'));
}

export function renderContext(frag,{state,showArchived,toggleArchived,editMemory,turn}){
 intro(frag,'Preferences you stated and your original words. Archive anything you don’t want the assistant to use.');
 frag.append(button(showArchived?'Hide archived':'Show archived',toggleArchived,{role:'text',iconName:showArchived?'visibility_off':'visibility'}));
 frag.append(el('h2','section-title','Remembered preferences'));
 const memories=state.memories.filter(m=>showArchived||!m.archived);
 if(!memories.length)frag.append(el('p','empty','Nothing remembered yet. Tell Capture a preference and it will appear here.'));
 for(const m of memories){
  const row=el('div','record'+(m.archived?' archived':''));
  const text=el('div','record-text');
  text.append(el('p','',m.text),el('p','list-sub',m.archived?'Archived · not used':'You said this'));
  row.append(text,button('Edit',()=>editMemory(m),{role:'text'}));
  recordAction(row,'memories',m,turn);
  frag.append(row);
 }
 if(showArchived){
  frag.append(el('h2','section-title','Archived entries'));
  for(const e of state.entries.filter(e=>e.archived)){
   const row=el('div','record');
   row.append(el('p','record-text',e.title));
   recordAction(row,'entries',e,turn);
   frag.append(row);
  }
 }
 frag.append(el('h2','section-title','Original words'));
 const history=state.history.filter(h=>showArchived||!h.archived);
 if(!history.length)frag.append(el('p','empty','Earlier imported words appear here. Captures live in History.'));
 for(const h of history.toReversed()){
  const row=el('div','record'+(h.archived?' archived':''));
  const text=el('div','record-text');
  const when=h.archived?'archived':new Date(h.at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  text.append(el('p','',h.raw),el('p','list-sub',`${h.source==='cli-import'?'Imported':'Conversation'} · ${when}`));
  row.append(text);
  recordAction(row,'history',h,turn);
  frag.append(row);
 }
}

export function renderAbout(frag,{paragraphs,openSettings}){
 const head=el('div','about-head');
 head.append(el('img','about-mark'),el('p','about-title','Your pocket planner'),el('p','list-sub','Private phone storage · OpenRouter AI'));
 head.querySelector('img').src='/butterfly.png';
 head.querySelector('img').alt='';
 frag.append(head);
 for(const p of paragraphs)frag.append(el('p','about-copy',p));
 frag.append(button('Phone settings',openSettings,{role:'tonal',iconName:'settings'}));
}
