import {captureRenderKey} from './surface-refresh.mjs';
import {wordsKeptCard,receiptCard,confirmCard,undoneCard,parkedCard,savedCard,openCard,questionCard,card,withProblem} from './capture-cards.mjs';
import {answerCard} from './capture-answers.mjs';
import {historyView,contextView} from './capture-views.mjs';
import {installSheet} from './capture-sheet.mjs';
import {installCapturePresentation,createRevealTracker,enter,keepChoicesInView,placeCards} from './capture-presentation.mjs';
import {installComposer,listeningCard,orbTap} from './capture-composer.mjs';
import {installForming} from './capture-forming.mjs';
import {createSendIdentity,draftToKeep,cardKind,canUndoChange} from './capture-session.mjs';
import {el,button} from './capture-dom.mjs';
import {createChipCard} from './capture-chip-card.mjs';
import {userMessage} from './user-message.mjs';
import {createVoiceMode,voiceCard} from './capture-voice.mjs';
import {actionIdFor} from '../intent-v2/src/suggestions.mjs';

const ACTIVE=new Set(['draft','review']);
const WAITING=new Set(['words-kept','confirm','open','question']);
const AUTO_CLOSE_MS=6000;

const storage={
 get(key){try{return localStorage.getItem(key);}catch{return null;}},
 set(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}},
};

/**
 * Capture: a dark bar over whatever is open. The words are saved first; what the model reads applies straight away,
 * with a receipt and Undo for new items and Keep or Undo for changes. Answers and receipts appear above the bar.
 */
export function mountCapture(platform){
 const $=id=>document.getElementById(id);
 const panel=$('panel'),content=$('content'),message=$('message');
 new ResizeObserver(()=>keepChoicesInView(content)).observe(content);
 const s={state:null,busy:false,view:'chat',conversationId:storage.get('rpm-conversation'),focusedDraftId:null,historyLimit:30,
  showArchived:false,lastKey:null,request:null,failure:null,problem:null,listening:false,autoClose:null,countdown:null};
 const identity=createSendIdentity(),reveal=createRevealTracker(),seen=new Set();
 const refreshState=async()=>{try{s.state=await(await fetch('/api/state')).json();}catch{}render();};
 const voiceMode=createVoiceMode({platform,conversationId:()=>conversation().id,onChange:()=>render(),afterSave:id=>{seen.add(id);refreshState();},onLevel:value=>composer.level(value)});

 function rememberComposer(text){
  const kept=draftToKeep(text,{busy:s.busy,pendingText:identity.pending?.text});
  storage.set('rpm-native-draft',kept);
  platform.saveComposerDraft?.(kept).catch(()=>status('Couldn’t keep your unsent words on this phone. Copy them before closing.',true));
 }
 function status(text,error=false){
  const node=$('status');
  node.textContent=text;
  node.classList.toggle('error',error);
  node.setAttribute('role',error?'alert':'status');
 }

 const conversation=()=>s.state.conversations.find(c=>c.id===s.conversationId)??s.state.conversations.find(c=>!c.archived)??s.state.conversations[0];
 const page=()=>platform.intentForConversation(conversation().id,{offset:0,limit:Math.min(s.historyLimit,100)});
 const captures=()=>page().captures??[];
 const latest=()=>captures()[0]??null;
 const answerDraft=()=>{const d=latest()?.draft;return d&&ACTIVE.has(d.status)&&d.question?d.id:null;};

 async function post(payload){
  const body={...payload,version:s.state.version,conversationId:conversation().id};
  const response=await fetch('/api/turn',{method:'POST',headers:{'Content-Type':'application/json','X-RPM-Token':s.state.csrf},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){if(data.state)s.state=data.state;throw new Error(data.error??'Could not finish the request.');}
  return data;
 }
 async function turn(payload){
  if(s.busy||!s.state||voiceMode.active())return null;
  voiceMode.clear();
  cancelAutoClose();
  const words=payload.type==='message'?payload.text:null;
  if(words!==null){
   const pending=identity.forText(words,s.focusedDraftId);
   payload={...payload,messageId:pending.messageId,focusDraftId:pending.focusDraftId};
   seen.add(pending.messageId);
  }
  if(payload.messageId)seen.add(payload.messageId);
  const tapped=captures().find(c=>c.draft&&c.draft.id===(payload.draftId??payload.action?.draftId));
  if(tapped)seen.add(tapped.messageId);
  const card=['message','intentRetry','intentChoose'].includes(payload.type);
  s.busy=true;s.failure=null;s.problem=null;status('');
  if(card){
   s.view='chat';reveal.begin();
   const said=words??(payload.type==='intentRetry'?captures().find(c=>c.messageId===payload.messageId)?.raw??'':'');
   s.request={payload,held:forming.hold(said)};
  }
  if(words!==null&&message.value===words){composer.set('',{focus:false});rememberComposer('');}
  render();
  let data;
  try{data=await post(payload);}
  catch(error){
   const land=forming.lift(),request=endRequest();
   const saved=!!request&&captures().some(c=>c.messageId===request.payload.messageId);
   if(!saved)forming.release();
   const text=error.message==='Failed to fetch'?'The phone did not respond.':userMessage(error);
   if(words!==null&&!saved){
    if(!message.value){composer.set(words,{focus:false});rememberComposer(words);}
    s.failure={payload,text:words,error:text};
   }else{s.problem=text;if(words!==null)rememberComposer(message.value);}
   reveal.settle(null,{failed:true});
   render();
   if(saved)land(content,{keep:wordsOnly(request)});
   return null;
  }
  s.state=data;
  if(words!==null)identity.settle();
  const land=forming.lift(),request=endRequest();
  if(words!==null)rememberComposer(message.value);
  if(s.focusedDraftId&&!ACTIVE.has(findDraft(s.focusedDraftId)?.status))s.focusedDraftId=null;
  render();
  settle(card,land(content,{keep:wordsOnly(request)}));
  return data;
 }
 const wordsOnly=request=>{
  const c=request&&captures().find(c=>c.messageId===request.payload.messageId);
  return !!c&&['pending','words-kept'].includes(cardKind(c));
 };
 function endRequest(){
  const request=s.request;
  s.busy=false;s.request=null;
  return request;
 }
 const findDraft=id=>captures().find(c=>c.draft?.id===id)?.draft??null;
 window.addEventListener('rpm-intent-event',e=>{
  const event=e.detail??{};
  if(!s.request||event.messageId!==s.request.payload.messageId)return;
  if(event.type==='partial')forming.fill(event.operations??[]);
 });

 const action=a=>{
  if(a.kind==='open'){s.focusedDraftId=a.draftId;}
  return turn({type:'intentAction',action:a,actionId:actionIdFor(a)}).then(data=>{if(a.kind==='open')message.focus({preventScroll:true});return data;});
 };
 const chips=createChipCard({act:a=>{s.keepScroll=true;return action(a);},refresh:()=>{render();s.keepScroll=false;},choices:()=>s.state?.choices});
 const on={
  retry:()=>turn({type:'intentRetry',messageId:latest()?.messageId}),
  edit:text=>{
   if(!message.value.trim()||message.value===text){composer.set(text);return;}
   status('Your box has other words. Send or clear them first.',true);
  },
  connectAI:()=>platform.action('settings',{section:'ai_connection'}).catch(()=>{}),
  undo:d=>turn({type:'intentUndo',draftId:d.id,actionId:`undo:${d.id}:${d.revision}`}),
  keep:async d=>{if(await turn({type:'intentKeep',draftId:d.id,actionId:`keep:${d.id}:${d.revision}`}))scheduleAutoClose();},
  resume:d=>turn({type:'intentResume',draftId:d.id,actionId:`resume:${d.id}:${d.revision}`}),
  choose:a=>{const id=actionIdFor(a);return turn({type:'intentChoose',action:a,actionId:id,messageId:id,label:latest()?.clarification?.choices.find(c=>c.id===a.choiceId)?.label??null});},
  keepNote:(c,note,keep)=>turn({type:'keepNote',messageId:c.messageId,sourceId:note.sourceId,keep,actionId:`note:${crypto.randomUUID()}`}),
  action,
  chips,
  openPlanner:()=>platform.openPlans(),
 };

 function scheduleAutoClose(){
  cancelAutoClose();
  if(message.value.trim()||chips.held(latest()?.draft?.id))return;
  const ends=Date.now()+AUTO_CLOSE_MS;
  const tick=()=>{const node=content.querySelector('.countdown'),left=Math.ceil((ends-Date.now())/1000);if(node)node.textContent=left>0?`Closing in ${left}s`:'';};
  tick();s.countdown=setInterval(tick,250);
  s.autoClose=setTimeout(()=>{
   cancelAutoClose();
   if(!message.value.trim()&&s.view==='chat'&&!s.busy&&!sheet.isOpen())platform.action('minimize').catch(()=>{});
  },AUTO_CLOSE_MS);
 }
 function cancelAutoClose(){
  clearTimeout(s.autoClose);clearInterval(s.countdown);
  s.autoClose=null;s.countdown=null;
  const node=content.querySelector('.countdown');
  if(node)node.textContent='';
 }
 for(const type of ['pointerdown','keydown','input','wheel'])$('stack').addEventListener(type,cancelAutoClose,{capture:true,passive:true});

 function legacyCard(){
  const node=card('legacy');
  node.append(el('p','card-title','An earlier proposal is still open'),el('p','quiet','Leave it to keep capturing. Your original words stay in History.'));
  const row=el('div','card-actions');
  row.append(button('Leave it',()=>turn({type:'cancel'}),{role:'tonal'}));
  node.append(row);
  return node;
 }
 async function undoVoice(id){s.problem=await voiceMode.undo(id);await refreshState();}
 function captureCard(c,kind){
  const canUndo=canUndoChange(c.draft,s.state.undoId);
  const aiEnabled=!!s.state.aiEnabled;
  const retry={...on,retry:()=>turn({type:'intentRetry',messageId:c.messageId})};
  switch(kind){
   case 'pending':case 'words-kept':return wordsKeptCard({raw:c.raw,error:c.lastError?userMessage(c.lastError):null,aiEnabled},retry);
   case 'confirm':return confirmCard(c,{canUndo,on});
   case 'receipt':return receiptCard(c,{canUndo,on,undoId:s.state.undoId});
   case 'undone':return undoneCard(c,on);
   case 'parked':return parkedCard(c,on);
   case 'open':return openCard(c,on);
   case 'question':return questionCard(c,on);
   case 'answer':return answerCard(c,{platform,on});
   case 'voice':return voiceCard(c,{rows:platform.voiceRows(c.voice.changes),openPlanner:on.openPlanner,openItem:target=>platform.action('planner',target).catch(()=>{}),
    discard:undoVoice});
   default:return savedCard(c,on);
  }
 }
 function chatCards(){
  const live=voiceMode.card();
  if(live)return [live];
  if(s.listening)return [listeningCard(el)];
  if(s.request?.held)return [];
  const out=[];
  if(s.failure)out.push(wordsKeptCard({raw:s.failure.text,error:s.failure.error,aiEnabled:true,saved:false},{...on,retry:()=>turn(s.failure.payload),edit:null}));
  else{
   const c=latest(),kind=cardKind(c);
   if(c&&(seen.has(c.messageId)||WAITING.has(kind))){
    const node=captureCard(c,kind);
    node.dataset.replyKey=JSON.stringify([c.messageId,kind,c.draft?.revision,c.draft?.confirm]);
    if(s.problem)withProblem(node,s.problem);
    out.push(node);
   }
  }
  if(s.state.pending)out.push(legacyCard());
  return out;
 }
 function viewCards(){
  const back=()=>setView('chat');
  if(s.view==='history'){
   const p=page();
   return [historyView({captures:p.captures??[],hasMore:p.hasMore,showMore:()=>{s.historyLimit=Math.min(100,s.historyLimit+30);render();},retry:id=>turn({type:'intentRetry',messageId:id}),
    discard:undoVoice,voiceRows:platform.voiceRows,onBack:back})];
  }
  if(s.view==='context'){
   return [contextView({state:s.state,showArchived:s.showArchived,toggleArchived:()=>{s.showArchived=!s.showArchived;render();},
    editMemory:m=>{setView('chat');composer.set(`Change my remembered preference "${m.text}" to `);},turn,onBack:back})];
  }
  return chatCards();
 }

 function render(){
  if(!s.state)return;
  const c=conversation();
  s.conversationId=c.id;storage.set('rpm-conversation',c.id);
  s.lastKey=captureRenderKey({...s.state,intent:page()});
  const nodes=viewCards(),top=content.scrollTop;
  placeCards(content,nodes);
  if(s.problem&&!content.querySelector('.problem'))status(s.problem,true);
  content.scrollTop=s.keepScroll?top:0;
  keepChoicesInView(content);
  const phase=voiceMode.live?.phase;
  const kind=s.listening||phase==='listening'||phase==='connecting'?'listening':s.request?'pending':s.failure?'error':nodes[0]?.classList[2]??'idle';
  panel.dataset.view=s.view;panel.dataset.busy=String(s.busy);panel.dataset.state=kind;
  content.setAttribute('aria-busy',String(s.busy));
  message.placeholder=answerDraft()||latest()?.clarification?.open?'Or answer in your own words':s.focusedDraftId?'Tell me what to change':'Capture a thought';
  for(const b of content.querySelectorAll('button'))if(!b.closest('.view-head'))b.disabled=s.busy;
  $('send').disabled=s.busy||voiceMode.active();composer.voice({phase,listening:s.listening,busy:s.busy});
  formNow();
 }
 const replying=()=>!!(answerDraft()||latest()?.clarification?.open||s.focusedDraftId);
 const formNow=()=>forming.update(message.value,{enabled:!!s.state?.aiEnabled,visible:!!s.state&&s.view==='chat'&&!s.listening&&!voiceMode.active()&&!replying()});
 function settle(cardRequest,morphed){
  if(!cardRequest||s.view!=='chat')return;
  const node=content.querySelector('[data-reply-key]');
  if(reveal.settle(node?.dataset.replyKey??null)&&!morphed)enter(node);
  if(cardKind(latest())==='receipt')scheduleAutoClose();
 }
 function setView(next){
  if(next===s.view)return;
  s.view=next;s.failure=null;s.problem=null;
  render();
 }

 async function voice(){
  if(s.listening||s.busy)return;
  if(platform.hasGeminiKey?.()){setView('chat');s.problem=null;return voiceMode.begin();}
  s.listening=true;render();
  try{
   const result=await platform.action('dictate');
   s.listening=false;render();
   if(result?.text){composer.append(result.text);status('Check your words, then send.');}
  }catch(error){s.listening=false;render();status(userMessage(error),true);}
 }

 const forming=installForming({host:$('forming'),platform,conversationId:()=>conversation().id});
 installCapturePresentation({action:platform.action});
 const send=text=>{setView('chat');return turn({type:'message',text});};
 const sheet=installSheet({platform,setView});
 const composer=installComposer({
  onSubmit:text=>{if(!s.busy)send(text);},
  onInput:text=>{rememberComposer(text);formNow();if(s.state&&!s.busy&&$('status').textContent&&!$('status').classList.contains('error'))status('');},
  onVoice:orbTap(voiceMode,voice),
 });
 window.rpmStartVoice=(tries=25)=>{setView('chat');if((s.busy||!s.state)&&tries>0){setTimeout(()=>window.rpmStartVoice(tries-1),200);return;}voice();};
 if(window.rpmPendingVoice){delete window.rpmPendingVoice;window.rpmStartVoice();}
 window.addEventListener('rpm-calendar-ready',()=>{if(s.state&&!s.busy&&s.view==='chat'&&content.querySelector('.answer'))render();});
 window.rpmHandleBack=()=>{
  if(sheet.close())return true;
  if(chips.closeTray())return true;
  if(s.view!=='chat'){setView('chat');return true;}
  return false;
 };
 window.addEventListener('pagehide',()=>storage.set('rpm-native-draft',message.value));
 window.addEventListener('rpm-phone-status',async()=>{
  if(s.busy||!s.state)return;
  let next;
  try{next=await(await fetch('/api/state')).json();}catch{return;}
  if(s.busy)return;
  s.state=next;
  if(captureRenderKey({...next,intent:page()})!==s.lastKey)render();
 });

 composer.set(storage.get('rpm-native-draft')??'',{focus:false});
 fetch('/api/state').then(async r=>{
  if(!r.ok)throw new Error('state');
  s.state=await r.json();
  render();
  if(!content.querySelector('.open,.confirm'))message.focus({preventScroll:true});
 }).catch(()=>status('Capture could not open your saved data. Close and open it again.',true));
 return {render,turn};
}
