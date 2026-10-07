// Capture: the floating quick-capture panel. Words are saved before any
// assistant work, and nothing changes the plan until the user adds it.
import {captureRenderKey} from './surface-refresh.mjs';
import {renderResponse} from './capture-card.mjs';
import {pendingCard,failureCard,warning} from './capture-states.mjs';
import {renderHistory,renderConversation,renderContext,renderAbout} from './capture-views.mjs';
import {installCaptureMenu} from './widget-menu.mjs';
import {installCapturePresentation,createRevealTracker,enter,reducedMotion} from './capture-presentation.mjs';
import {installComposer,listeningCard} from './capture-composer.mjs';
import {createSendIdentity,draftToKeep,STARTERS} from './capture-session.mjs';
import {dueText} from './capture-content.mjs';
import {el,icon,button} from './capture-dom.mjs';
import {userMessage} from './user-message.mjs';

const TITLES={listening:'Voice input',chat:'Capture',history:'History',conversation:'Conversation',context:'Context',about:'About'};
const ACTIVE=new Set(['draft','review']);
const AUTO_CLOSE_MS=6000;
const SLOW_MS=8000;
const KEEP_ENABLED=new Set(['close','expand','back','menu-toggle','about','settings','context-view','history-view','plans-view']);

const storage={
 get(key){try{return localStorage.getItem(key);}catch{return null;}},
 set(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}},
 remove(key){try{localStorage.removeItem(key);}catch{}},
};
const focusKey=id=>`rpm-intent-focus:${id}`;

export function mountCapture(platform){
 const $=id=>document.getElementById(id);
 const panel=$('panel'),content=$('content'),dock=$('capture-actions'),message=$('message');
 const s={state:null,busy:false,view:'chat',conversationId:storage.get('rpm-conversation'),focusedDraftId:null,
  historyLimit:20,showArchived:false,lastKey:null,request:null,failure:null,listening:false,autoClose:null,slowTimer:null,draftSaved:false};
 const identity=createSendIdentity();
 const reveal=createRevealTracker();
 const actionIds=new Map();
 // Proposals Dara left out, per draft. Local until Add, which sends them as `skip`.
 const skippedOps=new Map();
 let itemPopover=null;

 // ---- drafts -------------------------------------------------------------
 function rememberComposer(text){
  const kept=draftToKeep(text,{busy:s.busy,pendingText:identity.pending?.text});
  const local=storage.set('rpm-native-draft',kept);
  // "Draft saved" appears only once the phone confirms these exact words.
  const saved=()=>{if(message.value===text){s.draftSaved=true;syncHint();}};
  if(!platform.saveComposerDraft){if(local)saved();return;}
  platform.saveComposerDraft(kept).then(saved,()=>{
   s.draftSaved=false;syncHint();
   status('Couldn’t keep your unsent draft on this phone. Keep this window open and copy your words.',true);
  });
 }
 const rememberDraft=()=>storage.set('rpm-native-draft',message.value);

 function status(text,error=false){
  const node=$('status');
  node.textContent=text;
  node.classList.toggle('error',error);
  node.setAttribute('role',error?'alert':'status');
 }

 // ---- data views ---------------------------------------------------------
 const conversation=()=>s.state.conversations.find(c=>c.id===s.conversationId)??s.state.conversations.find(c=>!c.archived)??s.state.conversations[0];
 function intentPage(){
  const id=conversation().id;
  const first=platform.intentForConversation(id,{offset:0,limit:Math.min(s.historyLimit,100)});
  const captures=[...(first.captures??[])];
  for(let offset=100;offset<s.historyLimit&&offset<first.totalCaptures;offset+=100){
   captures.push(...platform.intentForConversation(id,{offset,limit:Math.min(100,s.historyLimit-offset)}).captures);
  }
  return {...first,captures,hasMore:captures.length<first.totalCaptures};
 }
 const captures=()=>intentPage().captures?.filter(c=>c.conversationId===conversation().id)??[];
 function draftIsOpen(id){
  if(!id)return false;
  const open=c=>c.draft?.id===id&&ACTIVE.has(c.draft.status);
  const convo=conversation().id,total=platform.intentForConversation(convo,{limit:0}).totalCaptures??0;
  for(let offset=0;offset<total;offset+=100){
   if(platform.intentForConversation(convo,{offset,limit:100}).captures.some(open))return true;
  }
  return false;
 }
 function setFocusedDraft(id){
  s.focusedDraftId=id??null;
  const key=focusKey(conversation().id);
  if(id)storage.set(key,id);else storage.remove(key);
 }
 /** A question's draft takes the next message as its answer. */
 function answerDraft(){
  const latest=s.view==='chat'?captures()[0]:null;
  return latest?.draft&&ACTIVE.has(latest.draft.status)&&latest.draft.question?latest.draft.id:null;
 }
 const focusForSend=()=>s.focusedDraftId??answerDraft();

 // ---- requests -----------------------------------------------------------
 function actionId(action){
  const key=JSON.stringify(action);
  if(!actionIds.has(key))actionIds.set(key,crypto.randomUUID());
  return actionIds.get(key);
 }
 function rawFor(messageId){
  return captures().find(c=>c.messageId===messageId)?.raw??'';
 }
 function beginRequest(payload){
  const pendingCardRequest=payload.type==='message'||payload.type==='intentRetry';
  s.request={payload,card:pendingCardRequest,phase:payload.type==='intentRetry'?'sorting':'saving',attempt:0,slow:false,
   text:payload.text??rawFor(payload.messageId)};
  if(pendingCardRequest){
   s.view='chat';
   reveal.begin();
   s.slowTimer=setTimeout(()=>{if(s.request?.card){s.request.slow=true;refreshPending();}},SLOW_MS);
  }
 }
 async function post(payload){
  const body={...payload,version:s.state.version,conversationId:s.conversationId};
  const response=await fetch('/api/turn',{method:'POST',headers:{'Content-Type':'application/json','X-RPM-Token':s.state.csrf},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){
   if(data.state)s.state=data.state;
   throw new Error(data.error??'Could not finish the request.');
  }
  return data;
 }
 async function turn(payload){
  if(s.busy||!s.state)return null;
  const draftText=message.value;
  cancelAutoClose();closeItemMenu();
  if(payload.type==='message'){
   const pending=identity.forText(payload.text,focusForSend());
   payload={...payload,messageId:pending.messageId,focusDraftId:pending.focusDraftId};
  }
  s.busy=true;s.failure=null;
  beginRequest(payload);
  if(payload.type==='message'&&message.value===payload.text){
   composer.set('',{focus:false});
   rememberComposer('');
   message.focus({preventScroll:true});
  }
  render();
  try{
   const data=await post(payload);
   s.state=data;
   if(payload.type==='new'){s.conversationId=data.conversations.at(-1).id;s.view='chat';}
   if(payload.type==='message')identity.settle();
   const request=endRequest();
   render();
   settleReveal(request);
   return data;
  }catch(error){
   const request=endRequest();
   const saved=request?.card&&request.phase==='sorting';
   if(payload.type==='message'&&!saved&&!message.value&&draftText===payload.text){
    composer.set(draftText,{focus:false});
    rememberComposer(draftText);
   }
   const text=error.message==='Failed to fetch'?'The phone did not respond. Your words are kept.':userMessage(error);
   s.failure={payload,saved,text:request?.text,error:text,actionFailed:!request?.card,inBox:!!request?.text&&message.value===request.text};
   reveal.settle(null,{failed:true});
   render();
   return null;
  }
 }
 function endRequest(){
  clearTimeout(s.slowTimer);
  const request=s.request;
  s.busy=false;s.request=null;
  return request;
 }
 function refreshPending(){
  if(!s.request?.card||s.view!=='chat')return;
  const node=content.querySelector('.pending-card');
  if(node)node.replaceWith(pendingCard(s.request));
 }
 // Real request events from the intent service: the raw words are committed
 // ("captured") before the assistant is asked anything.
 window.addEventListener('rpm-intent-event',e=>{
  const event=e.detail??{},request=s.request;
  if(!request?.card||event.messageId!==request.payload.messageId)return;
  if(event.type==='captured')request.phase='sorting';
  if(event.type==='interpreting'){request.phase='sorting';request.attempt=event.attempt??0;}
  refreshPending();
 });

 async function runIntentAction(action){
  if(action.kind==='open'){
   setFocusedDraft(action.draftId);
   await turn({type:'intentAction',action,actionId:actionId(action)});
   if(draftIsOpen(action.draftId))message.focus({preventScroll:true});
   else setFocusedDraft(null);
   render();
   return;
  }
  const result=await turn({type:'intentAction',action,actionId:actionId(action)});
  if(action.draftId===s.focusedDraftId&&!draftIsOpen(action.draftId)){setFocusedDraft(null);render();}
  const latest=captures()[0];
  if(result&&action.kind==='commit'&&latest?.draft?.id===action.draftId&&latest.draft.status==='committed')scheduleAutoClose();
 }
 async function prefill(text,draft){
  if(ACTIVE.has(draft.status)&&s.focusedDraftId!==draft.id){
   await runIntentAction({conversationId:draft.conversationId,draftId:draft.id,revision:draft.revision,kind:'open'});
  }
  if(!message.value.trim())composer.set(text);
  else message.focus({preventScroll:true});
 }
 function editWords(text,origin){
  if(!message.value||message.value===text){composer.set(text);return;}
  const holder=origin?.closest('.action-dock,.state-card')??content;
  if(document.querySelector('.replace-confirm'))return;
  const confirm=el('div','replace-confirm');
  confirm.append(el('p','','Replace the draft you’re writing?'));
  const row=el('div','card-actions');
  row.append(button('Keep current draft',()=>confirm.remove(),{role:'text'}),button('Replace draft',()=>{confirm.remove();composer.set(text);},{role:'tonal'}));
  confirm.append(row);
  (holder===dock?content:holder).append(confirm);
 }
 async function captureAction(action){
  if(s.busy)return;
  try{await platform.captureAction(action);}
  catch(error){status(userMessage(error),true);}
 }

 // ---- auto close after Add -----------------------------------------------
 function scheduleAutoClose(){
  cancelAutoClose();
  if(message.value.trim())return;
  panel.dataset.autoClose='true';
  // The receipt counts down the seconds left before Capture closes itself; any touch stops it.
  const ends=Date.now()+AUTO_CLOSE_MS;
  const tick=()=>{
   const line=dock.querySelector('.close-countdown'),left=Math.ceil((ends-Date.now())/1000);
   if(line)line.textContent=left>0?`Closing in ${left}s`:'';
  };
  tick();s.countdown=setInterval(tick,250);
  s.autoClose=setTimeout(()=>{
   cancelAutoClose();
   if(!message.value.trim()&&s.view==='chat'&&!s.busy&&!menu.isOpen())platform.action('minimize').catch(()=>{});
  },AUTO_CLOSE_MS);
 }
 function cancelAutoClose(){
  if(s.autoClose)clearTimeout(s.autoClose);
  clearInterval(s.countdown);
  s.autoClose=null;s.countdown=null;panel.dataset.autoClose='false';
  const line=dock.querySelector('.close-countdown');
  if(line)line.textContent='';
 }
 for(const type of ['pointerdown','keydown','input','wheel'])panel.addEventListener(type,cancelAutoClose,{capture:true,passive:true});

 // ---- item overflow menu -------------------------------------------------
 function openItemMenu(anchor,items,{wide=false}={}){
  closeItemMenu();
  const pop=el('div','popover'+(wide?' wide':''));
  pop.setAttribute('role','menu');
  for(const item of items){
   const row=el('button','popover-item');
   row.type='button';row.setAttribute('role',item.checked===undefined?'menuitem':'menuitemradio');
   if(item.checked!==undefined)row.setAttribute('aria-checked',String(item.checked));
   if(item.icon)row.append(icon(item.icon));
   const text=el('span','popover-text');
   text.append(el('span','',item.label));
   if(item.sub)text.append(el('span','popover-sub'+(item.alert?' overdue':''),item.sub));
   row.append(text);
   if(item.checked)row.append(icon('check',{cls:'popover-check'}));
   row.addEventListener('click',()=>{closeItemMenu();item.run();});
   pop.append(row);
  }
  panel.append(pop);
  const a=anchor.getBoundingClientRect(),p=panel.getBoundingClientRect();
  pop.style.maxHeight=Math.max(160,p.height-16)+'px';
  const below=a.bottom-p.top+4,height=pop.offsetHeight;
  if(wide)pop.style.left='8px';
  pop.style.right=wide?'8px':Math.max(8,p.right-a.right)+'px';
  pop.style.top=(below+height<p.height-8?below:Math.max(8,Math.min(a.top-p.top-height-4,p.height-height-8)))+'px';
  itemPopover={node:pop,anchor};
  (pop.querySelector('[aria-checked=true]')??pop.querySelector('button'))?.focus({preventScroll:true});
 }
 /** Move one proposal to another Block, or to the Inbox, before it is added. */
 function pickBlock(anchor,op,draft){
  const current=op.fields.find(f=>f.name==='blockId'&&f.op==='set')?.value??null;
  const set=value=>runIntentAction({conversationId:draft.conversationId,draftId:draft.id,revision:draft.revision,kind:'set-field',opId:op.opId,field:'blockId',...(value==null?{clear:true}:{value})});
  // A plain list like Google Tasks' "Move to": names, their deadline or Project, and a check.
  const items=[{label:'Inbox',sub:'No block for now',checked:current==null,run:()=>set(null)}];
  for(const b of platform.blockChoices?.()??[]){
   items.push({label:b.title,sub:dueText(b.due)??b.subtitle,alert:b.due?.overdue,checked:String(b.id)===String(current),run:()=>set(b.id)});
  }
  openItemMenu(anchor,items,{wide:true});
 }
 function closeItemMenu(){
  if(!itemPopover)return false;
  itemPopover.node.remove();
  itemPopover=null;
  return true;
 }
 document.addEventListener('pointerdown',e=>{if(itemPopover&&!itemPopover.node.contains(e.target)&&!itemPopover.anchor.contains(e.target))closeItemMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&itemPopover){e.preventDefault();const anchor=itemPopover.anchor;closeItemMenu();anchor.focus();}});
 content.addEventListener('scroll',closeItemMenu,{passive:true});

 // ---- rendering ----------------------------------------------------------
 const cardContext=()=>({
  focused:false,history:false,aiEnabled:!!s.state.aiEnabled,delivery:platform.delivery,describe:platform.describeLink,
  on:{
   action:runIntentAction,
   retry:messageId=>turn({type:'intentRetry',messageId}),
   editWords,
   resume:d=>turn({type:'intentResume',draftId:d.id,actionId:`resume:${d.id}:${d.revision}`}),
   undo:d=>turn({type:'intentUndo',draftId:d.id,actionId:`undo:${d.id}:${d.revision}`}),
   open:captureAction,
   openPlanner:()=>platform.openPlans(),
   prefill,
   connectAI:()=>platform.action('settings',{section:'ai_connection'}),
   itemMenu:openItemMenu,
   pickBlock,
   keepNote:(capture,note,keep)=>turn({type:'keepNote',messageId:capture.messageId,sourceId:note.sourceId,keep,actionId:`note:${crypto.randomUUID()}`}),
   toggleInclude:(draft,opId)=>{
    const set=skippedOps.get(draft.id)??new Set();
    if(!set.delete(opId))set.add(opId);
    skippedOps.set(draft.id,set);
    render();
   },
  },
  blockDue:platform.blockDue,
  dayLoad:platform.dayLoad,
  skippedFor:draft=>{
   const set=skippedOps.get(draft.id)??new Set();
   for(const id of set)if(!draft.operations.some(op=>op.opId===id))set.delete(id);
   return set;
  },
 });
 const responseKey=c=>c?JSON.stringify([c.messageId,c.reply,c.draft?.revision,c.draft?.status,c.lastError?.message/* rules-allow raw-error-text: a render key, never shown */,c.notes?.map(n=>n.keptTaskId)]):null;

  // Field-first: nothing sits above the composer. The trust line lives under it (see syncHint)
 // and the planning starters live in More.
 function welcome(frag){
  const box=el('section','welcome');
  if(!s.state.aiEnabled){
   const note=el('div','note');
   note.append(icon('key'),el('p','','Without an AI key, Capture saves your words but can’t sort them.'),button('Connect',()=>platform.action('settings',{section:'ai_connection'}),{role:'text'}));
   box.append(note);
  }
  frag.append(box);
 }

 function legacyPending(frag){
  const box=el('section','state-card');
  box.append(warning('An earlier draft needs review','Leave it before saving a new plan. Your original words stay in History.'));
  for(const op of s.state.pending.operations){
   const name=op.fields.title??s.state.entries.find(e=>e.id===op.id)?.title??op.fields.preference??op.collection;
   box.append(el('p','prop-field',name));
  }
  if(s.state.pending.question)box.append(el('p','detail-note',s.state.pending.question));
  const row=el('div','card-actions');
  row.append(button('Leave this proposal',()=>turn({type:'cancel'}),{role:'tonal'}));
  box.append(row);
  frag.append(box);
 }

 function failureActions(failure){
  const retry=()=>turn(failure.payload);
  if(failure.actionFailed)return [button('Retry',retry,{role:'filled',iconName:'refresh'})];
  const actions=[];
  if(failure.text&&message.value!==failure.text)actions.push(button('Edit',e=>editWords(failure.text,e.currentTarget),{role:'text'}));
  actions.push(button('Retry',retry,{role:'filled',iconName:'refresh'}));
  return actions;
 }

 function renderChat(frag){
  const c=conversation();
  s.conversationId=c.id;
  storage.set('rpm-conversation',c.id);
  if(!s.focusedDraftId){const saved=storage.get(focusKey(c.id));if(saved)setFocusedDraft(saved);}
  if(s.focusedDraftId&&!draftIsOpen(s.focusedDraftId))setFocusedDraft(null);
  if(c.archived)frag.append(el('p','view-intro','Archived conversation. Restore it from History before capturing here.'));
  if(s.listening){frag.append(listeningCard(el,icon));return [];}
  if(s.request?.card){frag.append(pendingCard(s.request));return [];}
  let actions=[];
  if(s.failure&&!s.failure.actionFailed){
   frag.append(failureCard(s.failure));
   return failureActions(s.failure);
  }
  if(s.failure?.actionFailed)frag.append(failureCard(s.failure));
  const latest=captures()[0];
  if(!latest)welcome(frag);
  else{
   const ctx=cardContext();
   ctx.focused=latest.draft?.id===s.focusedDraftId;
   ctx.canUndo=!!latest.draft?.receipt?.undoId&&latest.draft.receipt.undoId===s.state.undoId;
   const response=renderResponse(latest,ctx);
   response.node.dataset.replyKey=responseKey(latest);
   response.node.dataset.messageId=latest.messageId;
   frag.append(response.node);
   actions=response.actions;
   if(s.failure?.actionFailed)actions=actions.filter(a=>!a.classList.contains('btn-filled')).concat(failureActions(s.failure));
  }
  if(s.state.pending)legacyPending(frag);
  return actions;
 }

 function renderView(frag){
  const turnFn=payload=>turn(payload);
  if(s.view==='chat')return renderChat(frag);
  if(s.view==='history'){
   renderHistory(frag,{state:s.state,conversationId:conversation().id,
    countFor:id=>platform.intentForConversation(id,{limit:0}).totalCaptures??0,
    openConversation:id=>{s.conversationId=id;s.historyLimit=20;setView('conversation');},turn:turnFn});
  }
  if(s.view==='conversation'){
   const ctx=cardContext();
   ctx.undoId=s.state.undoId;
   renderConversation(frag,{state:s.state,conversation:conversation(),page:intentPage(),cardContext:ctx,
    showMore:()=>{s.historyLimit+=20;render();},receiptsFor:m=>m.plannerReceipts??platform.receiptsForMessage?.(m)??[],turn:turnFn});
  }
  if(s.view==='context'){
   renderContext(frag,{state:s.state,showArchived:s.showArchived,toggleArchived:()=>{s.showArchived=!s.showArchived;render();},
    editMemory:m=>{setView('chat');composer.set(`Change my remembered preference "${m.text}" to `);},turn:turnFn});
  }
  if(s.view==='about')renderAbout(frag,{paragraphs:platform.about,openSettings:()=>platform.action('settings')});
  return [];
 }

 function renderChrome(latestKind){
  panel.dataset.view=s.view;
  panel.dataset.busy=String(s.busy);
  panel.dataset.state=s.listening?'listening':s.request?.card?'pending':s.failure?'error':latestKind??'idle';
  $('view-label').textContent=TITLES[s.listening&&s.view==='chat'?'listening':s.view];
  $('back').hidden=s.view==='chat';
  for(const name of ['context','history'])$(name+'-view').setAttribute('aria-pressed',String(s.view===name||(name==='history'&&s.view==='conversation')));
  const focus=platform.planningFocus?.();
  const name=focus?.task?.title??focus?.block?.title??focus?.project?.title??null;
  $('focus-line').hidden=!name||s.view!=='chat';
  $('focus-label').textContent=name?'For: '+name:'';
  $('progress').hidden=!(s.busy&&!s.request?.card);
  content.setAttribute('aria-busy',String(s.busy));
  const answering=!!answerDraft();
  message.placeholder=answering?'Or answer in your own words':s.focusedDraftId?'Tell me what to change':'Capture a thought';
  syncHint();
 }
 /** One line under the field: the promise while empty, then "Draft saved" once the phone confirms. */
 function syncHint(){
  const hint=$('composer-hint'),text=!!message.value.trim(),chat=s.view==='chat'&&!s.busy&&!s.listening;
  const saved=chat&&s.draftSaved&&text,promise=chat&&!saved&&!!content.querySelector('.welcome');
  hint.hidden=!saved&&!promise;
  hint.dataset.kind=saved?'saved':'promise';
  $('hint-text').textContent=saved?'Draft saved':'Saved as you type. Added only when you confirm.';
 }

 function controls(){
  for(const b of panel.querySelectorAll('button')){
   if(KEEP_ENABLED.has(b.id)||b.closest('#quick-menu')||b.tagName==='SUMMARY')continue;
   b.disabled=s.busy||(b.id==='dictate'&&s.listening);
  }
  const canSend=!s.busy&&!!message.value.trim();
  $('send').dataset.canSend=String(canSend);
  $('send').setAttribute('aria-description',s.busy?'Working on your capture. Hold for planner and more.':'Hold for planner and more.');
 }

 // Within one capture the panel only grows, so the composer and the main action
 // never jump under the thumb; it settles back when Capture is empty again. The
 // receipt also settles to its own height (the panel is anchored at the bottom,
 // so Undo takes Add's place and nothing under the thumb moves), leaving no empty band.
 let floor=0;
 function holdHeight(before){
  panel.style.minHeight='';
  const receipt=panel.dataset.state==='committed';
  const cycle=s.view==='chat'&&!panel.classList.contains('expanded')&&panel.dataset.state!=='idle'&&!receipt;
  if(!cycle){
   floor=0;
   const natural=panel.offsetHeight;
   if(receipt&&before>natural+1&&!reducedMotion()&&panel.animate){
    panel.animate([{height:before+'px'},{height:natural+'px'}],{duration:250,easing:'cubic-bezier(.2,0,0,1)'});
   }
   return;
  }
  const natural=panel.offsetHeight,limit=parseFloat(getComputedStyle(panel).maxHeight)||Infinity;
  floor=Math.min(limit,Math.max(floor,before,natural));
  panel.style.minHeight=floor+'px';
  if(before&&floor>before+1&&!reducedMotion()&&panel.animate){
   panel.animate([{height:before+'px'},{height:floor+'px'}],{duration:250,easing:'cubic-bezier(.05,.7,.1,1)'});
  }
 }

 function render(){
  if(!s.state)return;
  const height=panel.offsetHeight;
  s.lastKey=captureRenderKey({...s.state,intent:intentPage()});
  const before={top:content.scrollTop,key:content.querySelector('[data-reply-key]')?.dataset.replyKey??null,view:s.view,
   open:[...content.querySelectorAll('details[open]')].map(d=>d.className)};
  closeItemMenu();
  const frag=document.createDocumentFragment();
  const actions=renderView(frag);
  content.replaceChildren(frag);
  dock.replaceChildren(...actions);
  dock.hidden=!actions.length;
  const latest=s.view==='chat'?content.querySelector('[data-reply-key]'):null;
  renderChrome(latest?captures()[0]?.draft?.question?'question':captures()[0]?.draft?.status??'response':null);
  controls();
  const same=before.key===(latest?.dataset.replyKey??null)&&before.view===s.view;
  if(same)for(const d of content.querySelectorAll('details'))if(before.open.includes(d.className))d.open=true;
  content.scrollTop=same?before.top:0;
  holdHeight(height);
  presentation.updateOverflow();
  if(!s.busy&&s.view==='chat')reveal.observe(latest?.dataset.replyKey);
 }

 function settleReveal(request){
  if(!request?.card||s.view!=='chat')return;
  const latest=content.querySelector('[data-reply-key]');
  if(reveal.settle(latest?.dataset.replyKey??null)){
   enter(latest);
   if(!dock.hidden)enter(dock,{distance:4,duration:180});
  }
 }

 function setView(next){
  if(next==='plans'){platform.openPlans();return;}
  if(next===s.view)return;
  s.view=next;
  render();
  enter(content,{distance:0,duration:150});
 }

 // ---- voice ----------------------------------------------------------------
 async function voice(){
  if(s.listening||s.busy)return;
  s.listening=true;render();
  try{
   const result=await platform.action('dictate');
   s.listening=false;render();
   if(result?.text){composer.append(result.text);status('Check your words, then send.');}
  }catch(error){
   s.listening=false;render();
   status(userMessage(error),true);
  }
 }

 // ---- wiring ---------------------------------------------------------------
 const presentation=installCapturePresentation({action:platform.action});
 const menu=installCaptureMenu({rememberDraft,canSend:()=>!!message.value.trim()&&!s.busy});
 const composer=installComposer({
  onSubmit:text=>{if(!s.busy)turn({type:'message',text});},
  onInput:text=>{
   rememberComposer(text);
   if(!s.state)return;
   if(s.failure&&!s.failure.actionFailed&&!text)return;
   status('');
   controls();
   renderChrome(panel.dataset.state);
  },
  onVoice:voice,
 });
 $('close').addEventListener('click',()=>platform.action('minimize'));
 $('expand').addEventListener('click',()=>{
  const full=panel.classList.toggle('expanded');
  $('expand').setAttribute('aria-pressed',String(full));
  $('expand').setAttribute('aria-label',full?'Make Capture smaller':'Expand Capture');
  $('expand').querySelector('.ms').textContent=full?'collapse_content':'expand_content';
  platform.action('expand').catch(()=>{});
 });
 $('back').addEventListener('click',()=>setView(s.view==='conversation'?'history':'chat'));
 $('settings').addEventListener('click',()=>platform.action('settings'));
 $('about').addEventListener('click',()=>setView('about'));
 $('context-view').addEventListener('click',()=>setView('context'));
 $('history-view').addEventListener('click',()=>setView('history'));
 // The widget's mic opens Capture listening; the page may still be loading its state, so wait briefly for it.
 window.rpmStartVoice=(tries=25)=>{setView('chat');if(s.busy&&tries>0){setTimeout(()=>window.rpmStartVoice(tries-1),200);return;}voice();};
 if(window.rpmPendingVoice){delete window.rpmPendingVoice;window.rpmStartVoice();}
 $('plans-view').addEventListener('click',()=>setView('plans'));
 $('focus-clear').addEventListener('click',()=>{platform.clearPlanningFocus();render();});
 // The planning starters wait in More so the field leads; each sends its own words.
 STARTERS.forEach((item,i)=>$('starter-'+i).addEventListener('click',()=>{setView('chat');turn({type:'message',text:item.text});}));
 // The calendar copy arrives after the first paint; proposals then name what else holds their day.
 window.addEventListener('rpm-calendar-ready',()=>{if(s.state&&!s.busy&&s.view==='chat'&&content.querySelector('.proposal-card'))render();});
 window.rpmHandleBack=()=>{
  if(closeItemMenu())return true;
  if(menu.dismiss())return true;
  if(s.view==='conversation'){setView('history');return true;}
  if(s.view!=='chat'){setView('chat');return true;}
  return false;
 };
 window.addEventListener('pagehide',rememberDraft);
 window.addEventListener('rpm-phone-status',async()=>{
  if(s.busy||!s.state)return;
  let next;
  try{next=await(await fetch('/api/state')).json();}catch{return;}
  if(s.busy)return;
  s.state=next;
  if(captureRenderKey({...next,intent:intentPage()})!==s.lastKey)render();
 });

 composer.set(storage.get('rpm-native-draft')??'',{focus:false});
 fetch('/api/state').then(async r=>{
  if(!r.ok)throw new Error();
  s.state=await r.json();
  s.conversationId=conversation().id;
  render();
  content.scrollTop=0;
  // Capture opens ready to type: the field has focus unless a decision is waiting.
  if(s.view==='chat'&&!content.querySelector('.proposal-card,.question'))message.focus({preventScroll:true});
 }).catch(()=>status('Capture could not open your saved data. Close and open it again.',true));
 return {render,turn};
}
