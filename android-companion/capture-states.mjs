// Capture states around a proposal: words saved, sorting, failure, dialogue
// and the receipt after Add. Each says only what the phone has confirmed.
import {formattedReply} from '../chat-prototype/reply-format.mjs';
import {addedSummary} from './capture-content.mjs';
import {el,icon,button,details} from './capture-dom.mjs';

/** "Your words are saved" with the exact words, only after the save is confirmed. */
export function savedWords(raw,{title='Your words are saved'}={}){
 const row=el('div','saved-words');
 row.append(icon('check_circle',{fill:true,cls:'saved-icon'}));
 const body=el('div','saved-body');
 body.append(el('p','saved-title',title),el('q','saved-quote',raw));
 row.append(body);
 return row;
}

/** Original words and assumptions, one tap away. */
export function originalWords(raw,notes=[]){
 const children=[el('p','original',raw)];
 for(const note of notes)children.push(el('p','detail-note',note));
 return details('Your words',children);
}

// Which captures have their words open, so a re-render keeps them open.
const wordsOpen=new Set();

/**
 * The same disclosure for a card header: a "Your words" toggle that sits
 * beside the kicker, and the region it opens just below.
 */
export function wordsToggle(capture,notes=[]){
 const key=capture.messageId,id='words-'+String(key??'').replace(/[^\w-]/g,'');
 const region=el('div','words-region');
 region.id=id;
 region.append(el('p','original',capture.raw));
 for(const note of notes)region.append(el('p','detail-note',note));
 const toggle=button('Your words',null,{role:'text',cls:'words-toggle'});
 toggle.append(icon('expand_more',{cls:'chev'}));
 toggle.setAttribute('aria-controls',id);
 const set=open=>{
  region.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  if(open)wordsOpen.add(key);else wordsOpen.delete(key);
 };
 toggle.addEventListener('click',()=>set(region.hidden));
 set(wordsOpen.has(key));
 return {toggle,region};
}

// Which in-flight captures have their words open, so a phase change keeps them open.
const pendingOpen=new Set();

/**
 * While a message is in flight. `phase` comes from real request events:
 * saving (no confirmation yet), sorting (raw words committed), slow. The saved
 * words fold to one line that opens to the exact text; Dara has just typed them.
 */
export function pendingCard({text,phase='saving',attempt=0,slow=false}){
 const card=el('section','state-card pending-card');
 card.setAttribute('aria-busy','true');
 if(phase==='saving'){
  const row=el('div','pending-line is-saving');
  row.append(el('span','spinner'),el('span','pending-text','Saving your words…'));
  card.append(row);
  return card;
 }
 const toggle=el('button','pending-line words-line');
 toggle.type='button';
 toggle.append(icon('check',{cls:'saved-icon'}),el('span','pending-text','Your words are saved'),icon('expand_more',{cls:'chev'}));
 const quote=el('p','original words-region',text);
 quote.id='pending-words';
 toggle.setAttribute('aria-controls',quote.id);
 const set=open=>{quote.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)pendingOpen.add(text);else pendingOpen.delete(text);};
 toggle.addEventListener('click',()=>set(quote.hidden));
 set(pendingOpen.has(text));
 card.append(toggle,quote);
 // One visible progress line and one plain sentence: no skeletons, no invented steps.
 const sorting=el('div','sorting');
 const label=slow?'Still sorting. You can close this; your words stay saved.':attempt>0?'Taking a closer look… You can close this.':'Sorting into your plan… You can close this.';
 const bar=el('div','linear');bar.append(el('i'));
 bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Sorting');
 const status=el('p','sorting-label',label);
 status.setAttribute('role','status');
 sorting.append(bar,status);
 card.append(sorting);
 return card;
}

/** A request failed. Saved words keep their own retry identity. */
export function failureCard({text,saved,actionFailed,error,inBox=false}){
 const card=el('section','state-card failure-card');
 if(actionFailed){
  card.append(warning('Couldn’t save this change','Your draft is kept. Retry when you’re ready.'));
  return card;
 }
 if(saved){
  card.append(savedWords(text),el('p','state-note','Sorting stopped before it finished. Retry, or edit your words.'));
 }else{
  card.append(warning('Couldn’t save yet',inBox?'Your words are still in the box. Retry when you’re ready.':'Nothing was saved. Retry when you’re ready.'));
 }
 if(error)card.append(details('What happened',[el('p','detail-note',error)]));
 return card;
}

export function warning(title,body){
 const row=el('div','warning');
 row.setAttribute('role','alert');
 row.append(icon('error',{cls:'warning-icon'}));
 const text=el('div','warning-body');
 text.append(el('p','warning-title',title),el('p','warning-text',body));
 row.append(text);
 return row;
}

/** A saved capture that has no review yet: not interpreted, or interpretation failed. */
export function keptCard(capture,{aiEnabled}){
 const card=el('section','state-card');
 card.append(savedWords(capture.raw));
 let note='Not sorted yet. Retry to sort it into your plan.';
 if(!aiEnabled)note='Connect an AI key to sort this into tasks. Your words stay saved either way.';
 else if(capture.lastError)note='Couldn’t sort this yet. Retry, or edit your words.';
 card.append(el('p','state-note',note));
 if(aiEnabled&&capture.lastError?.message)card.append(details('What happened',[el('p','detail-note',capture.lastError.message)]));
 return card;
}

/** The assistant replied without proposing a change. */
export function dialogueCard(capture){
 const card=el('section','state-card dialogue-card');
 card.append(formattedReply(capture.reply||'Thought kept.'),originalWords(capture.raw));
 return card;
}

/**
 * After Add: a short summary, not a copy of the proposals, so a glance tells
 * that it is done. Each added task is one line (title, Must star, when · where),
 * with alert delivery as Android reports it.
 */
export function receiptCard(capture,{history,canUndo,delivery},added=[]){
 const draft=capture.draft;
 const card=el('section','state-card receipt-card');
 const total=added.length+(draft.skipped?.length??0);
 if(added.length){
  // A left-out proposal is counted, not listed; it stays in the draft's record and History.
  const title=history?'Added earlier':added.length===total?(added.length===1?'Task added':`${added.length} tasks added`):`${added.length} of ${total} tasks added`;
  const list=el('ul','receipt-list');
  list.append(...added);
  card.append(el('p','receipt-title',title),list);
 }else{
  card.append(el('p','receipt-title',history?'Added earlier':'Added to your plan'),el('p','receipt-summary',addedSummary(draft.operations)));
 }
 const receipts=(draft.receipt?.plannerReceipts??[]).filter(r=>r.action);
 for(const receipt of receipts){
  if(!receipt.entry?.alert)continue;
  const status=delivery?.(receipt.entry.id);
  card.append(el('p','delivery',status?.label??'Check alert delivery in Planner.'));
 }
 if(!canUndo&&draft.receipt?.undoId)card.append(el('p','detail-note','Undo is no longer available for this one.'));
 return card;
}

/** Undo is the receipt's main action; Open in Planner stays a quiet text button. */
export function receiptActions(capture,{canUndo,history,on}){
 const draft=capture.draft,row=[];
 const receipts=(draft.receipt?.plannerReceipts??[]).filter(r=>r.action);
 if(receipts.length){
  const open=()=>receipts.length===1?on.open(receipts[0].action):on.openPlanner();
  row.push(button('Open in Planner',open,{role:'text'}));
 }
 // While Capture is about to close itself, this line counts down the seconds (see capture-app). Undo itself never
 // expires with the panel, so the countdown is not on Undo.
 if(canUndo&&!history)row.unshift(el('span','close-countdown tnum',''));
 if(canUndo)row.push(button('Undo',()=>on.undo(draft),{role:'tonal',iconName:'undo',cls:'undo-action'}));
 return row;
}

export function parkedCard(capture){
 const card=el('section','state-card');
 const head=el('div','receipt-head');
 head.append(icon('inventory_2',{cls:'muted-icon'}));
 const body=el('div','saved-body');
 body.append(el('p','saved-title','Draft kept'),el('p','receipt-summary','Nothing was added. You can review it again any time.'));
 head.append(body);
 card.append(head,originalWords(capture.raw));
 return card;
}

export function undoneCard(capture){
 const card=el('section','state-card');
 const head=el('div','receipt-head');
 head.append(icon('undo',{cls:'muted-icon'}));
 const body=el('div','saved-body');
 body.append(el('p','saved-title','Undone'),el('p','receipt-summary','Nothing from this capture is in your plan now.'));
 head.append(body);
 card.append(head,originalWords(capture.raw));
 return card;
}
