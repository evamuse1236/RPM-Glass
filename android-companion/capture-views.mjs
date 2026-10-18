import {el,button,iconButton} from './capture-dom.mjs';
import {cardKind} from './capture-session.mjs';
import {card} from './capture-cards.mjs';

const STATUS={pending:'Saving',
 'words-kept':'Words saved, not sorted yet',saved:'Saved',answer:'Answered',confirm:'Changed, waiting for Keep',receipt:'Applied',
 undone:'Undone',parked:'Left as a draft',open:'Waiting for an answer'};

function shell(title,onBack){
 const node=card('view');
 const head=el('div','view-head');
 head.append(iconButton('arrow_back','Back to Capture',onBack),el('h2','',title));
 node.append(head);
 return node;
}
const when=at=>new Date(at).toLocaleString([],{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});

function statusText(capture){
 const kind=cardKind(capture),lines=capture.draft?.lines??[];
 if((kind==='receipt'||kind==='confirm')&&lines.length)return lines.map(l=>`${l.verb} ${l.title}`).join(', ');
 return STATUS[kind]??'Saved';
}

/** Every capture in this conversation, newest first, with what became of it. Words that never got sorted keep Retry. */
export function historyView({captures,hasMore,showMore,retry,onBack}){
 const node=shell('History',onBack);
 if(!captures.length)node.append(el('p','quiet','Nothing captured yet. Your words appear here as soon as you send them.'));
 for(const c of captures){
  const row=el('div','history-row');
  row.append(el('p','quiet',when(c.at)),el('p','card-text',c.raw),el('p','quiet',statusText(c)));
  if(cardKind(c)==='words-kept'){
   const actions=el('div','card-actions');
   actions.append(button('Retry',()=>retry(c.messageId),{role:'text',iconName:'refresh'}));
   row.append(actions);
  }
  node.append(row);
 }
 if(hasMore)node.append(button('Show more',showMore,{role:'text'}));
 return node;
}

function record(item,{collection,turn,edit}){
 const row=el('div','record'+(item.archived?' archived':''));
 row.append(el('p','record-text',item.text??item.raw??item.title));
 if(edit&&!item.archived)row.append(button('Edit',()=>edit(item),{role:'text'}));
 row.append(button(item.archived?'Restore':'Archive',()=>turn({type:item.archived?'restore':'archive',collection,id:item.id}),{role:'text'}));
 return row;
}

/** What Capture remembers about you, archived or restored, never deleted. */
export function contextView({state,showArchived,toggleArchived,editMemory,turn,onBack}){
 const node=shell('Context',onBack);
 node.append(el('p','quiet','Preferences you stated. Archive anything you don’t want Capture to use.'));
 const memories=state.memories.filter(m=>showArchived||!m.archived);
 node.append(el('p','section-title','Remembered preferences'));
 if(!memories.length)node.append(el('p','quiet','Nothing remembered yet. Tell Capture a preference and it appears here.'));
 for(const m of memories)node.append(record(m,{collection:'memories',turn,edit:editMemory}));
 const history=state.history.filter(h=>showArchived||!h.archived);
 if(history.length){
  node.append(el('p','section-title','Imported words'));
  for(const h of history.toReversed())node.append(record(h,{collection:'history',turn}));
 }
 if(showArchived){
  const archived=state.entries.filter(e=>e.archived);
  if(archived.length)node.append(el('p','section-title','Archived entries'));
  for(const e of archived)node.append(record(e,{collection:'entries',turn}));
 }
 const row=el('div','card-actions');
 row.append(button(showArchived?'Hide archived':'Show archived',toggleArchived,{role:'text'}));
 node.append(row);
 return node;
}
