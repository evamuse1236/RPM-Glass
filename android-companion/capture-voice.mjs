import {startVoice} from './voice-client.mjs';
import {liveSetup} from './voice-tools.mjs';
import {applyRamble,undoRamble} from './voice-turn.mjs';
import {el,button} from './capture-dom.mjs';
import {card,kicker,actionsRow} from './capture-cards.mjs';
import {wordStream} from './capture-voice-card.mjs';
import {voiceTable,mergeVoiceRows} from './capture-voice-table.mjs';
import {userMessage} from './user-message.mjs';
import {voiceMark,holdStage,voiceWordsMark,armReceiptMark,receiptMarkIfArmed} from './voice-marks.mjs';

export const NO_KEY='Connect a Gemini key in Settings to talk to RPM.';
export const NO_MIC='Allow the microphone to talk to RPM. Typing still works.';
export const MISSED='Didn’t catch that. Try again.';
const LIVE=new Set(['connecting','listening','working','speaking']);

/** A short rising tone when a request is saved, made with Web Audio so no sound file ships. */
export function chime(AudioContextImpl=globalThis.AudioContext){
 if(typeof AudioContextImpl!=='function')return false;
 try{
  const context=new AudioContextImpl(),t=context.currentTime,tone=context.createOscillator(),gain=context.createGain();
  tone.type='sine';tone.frequency.setValueAtTime(880,t);tone.frequency.setValueAtTime(1320,t+0.07);
  gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(0.18,t+0.01);gain.gain.exponentialRampToValueAtTime(0.0001,t+0.18);
  tone.connect(gain);gain.connect(context.destination);tone.start(t);tone.stop(t+0.2);
  tone.onended=()=>context.close().catch(()=>{});
  return true;
 }catch{return false;}
}

/**
 * Capture's voice mode on the phone: one open Live session until hang-up, Capture hidden, or 20 s of quiet.
 * Each request is saved with its words as one capture, one batch and one Undo. The whole call shows as one card: your
 * words while a request is open, then a table of every item the call changed, kept until the next call or a typed turn.
 * `savedRows(messageId)` gives a saved request's rows from the plan ([] once undone, null while it is not loaded yet).
 */
export function createVoiceMode({platform,conversationId,onChange,afterSave,onLevel=()=>{},start=startVoice,now=()=>new Date(),
 timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,doc=globalThis.document,win=globalThis.window,sound=()=>chime(),
 savedRows=()=>null,openItem=()=>{}}){
 let live=null,shown=null,session=null,call=null,calling=false,failure=null,failureFace=null,saveProblem=null;
 let saved=[],liveRows=new Map(),heard={request:0,text:''},moment={n:0,kind:null};
 const changed=()=>{const key=JSON.stringify([live,failure,saved.length,[...liveRows],heard,moment.n]);if(key===shown)return;shown=key;onChange();};
 const token=async setup=>{const reply=await platform.action('voiceToken',{setup});if(reply?.missingKey)throw new Error(NO_KEY);return reply;};
 const stop=()=>session?.stop();
 const hangUp=()=>session?.hangUp?.()??session?.stop();
 const kindOf=result=>{
  const added=new Set((result.changes??[]).filter(change=>change.kind==='add').map(change=>change.entity));
  return added.has('project')?'project':added.has('area')?'area':'writing';
 };

 async function saveRequest(result,{index}){
  const options={messageId:crypto.randomUUID(),conversationId:conversationId(),timeZone};
  let out;
  try{out=await platform.saveWith(data=>{const next=applyRamble(data,result,{...options,now:now()});return next.status==='nothing'&&!result.heard?false:next;});}
  catch(error){saveProblem=userMessage(error);liveRows.delete(index);moment={n:moment.n+1,kind:'oops'};changed();return;}
  if(out===false){liveRows.delete(index);changed();return;}
  saved=[...saved,{id:options.messageId,index}];
  armReceiptMark(options.messageId,`T8#${index}`);
  sound();
  moment={n:moment.n+1,kind:kindOf(result)};
  afterSave(options.messageId);
  changed();
 }

 function hear(state){
  if(!LIVE.has(state.phase))return;
  const request=state.request??0,rows=platform.voiceRows(state.changes);
  if(rows.length)liveRows.set(request,rows);
  if(state.heard)heard={request,text:state.heard};
  live={phase:state.phase,request};
  changed();
 }

 async function begin(){
  if(session||active())return;
  saved=[];liveRows=new Map();heard={request:0,text:''};failure=null;saveProblem=null;
  calling=true;call=null;
  live={phase:'connecting',request:0};
  changed();
  try{
   session=(win?.__rpmVoiceStart??start)({continuous:true,data:()=>platform.voiceData(),timeZone,now,workletUrl:'/voice-mic-worklet.js',token,onLevel,onRequest:saveRequest,
    setup:()=>liveSetup(now(),timeZone,{data:platform.voiceData(),continuous:true}),onChange:hear});
   const result=await session.done;
   session=null;live=null;
   if(result.code==='no-mic'){
    const access=await platform.action('micAccess').catch(()=>null);
    failure={phase:'no-mic',canAsk:access?.canAsk!==false};
   }else{
    const problem=result.failed||(result.missed?MISSED:null)||saveProblem;
    if(problem)failure={phase:'failed',error:problem};
   }
   changed();
  }catch(error){session=null;live=null;failure={phase:'failed',error:userMessage(error)};changed();}
 }

 /** One Undo per ramble: it reverts the batch through the same save path, or returns why it cannot. */
 async function undo(messageId){
  try{await platform.saveWith(data=>{undoRamble(data,messageId,now());return true;});return null;}
  catch(error){return userMessage(error);}
 }

 function active(){return !!live&&LIVE.has(live.phase);}
 function sources(){
  const requests=[...new Set([...saved.map(r=>r.index),...liveRows.keys()])].sort((a,b)=>a-b);
  return requests.map(request=>{
   const done=saved.find(r=>r.index===request),rows=done?savedRows(done.id):null;
   return {request,rows:rows??liveRows.get(request)??[]};
  });
 }
 function failureCard(){
  const key=JSON.stringify(failure);
  if(failureFace?.key!==key)failureFace={key,node:problemCard(failure,{begin,settings:()=>platform.action('micSettings')})};
  return failureFace.node;
 }

 if(typeof doc?.addEventListener==='function')doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')hangUp();});
 if(win)win.rpmVoiceBackground=hangUp;
 return {
  begin,stop,hangUp,undo,active,
  get live(){return live;},
  /** Why the last call ended badly ({phase:'failed'|'no-mic'}), or null. */
  get failure(){return failure;},
  /** The cat's cue: it counts up on every saved request, with the kind of thing saved. */
  get moment(){return moment;},
  /** Clears the call's card for a typed turn; a live call stays. */
  clear(){
   if(active())return;
   const had=!!(calling||failure);
   calling=false;call=null;failure=null;failureFace=null;saved=[];liveRows=new Map();
   if(had){shown=null;onChange();}
  },
  /** The call's cards (the table, then a problem), or null when voice has nothing on screen. */
  cards(){
   if(!calling&&!failure)return null;
   const out=[];
   if(calling){
    call??=callCard({openItem,win});
    const request=live?.request??null,open=active()&&heard.text&&heard.request===request&&!saved.some(r=>r.index===request);
    call.update({phase:live?.phase??null,request,words:open?heard.text:'',open:!!open,sources:sources(),saved});
    if(call.holds())out.push(call.node);
   }
   if(failure)out.push(failureCard());
   if(!out.length&&!active()){calling=false;call=null;return null;}
   return out;
  },
 };
}

/** The call's one card: the words of the open request on top, the table of changed items under them. */
function callCard({openItem,win}){
 const node=card('voice-card voice-call');
 node.dataset.morph='voice';
 node.setAttribute('role','status');
 const fold=el('div','voice-fold'),inner=el('div','voice-fold-inner'),lead=el('p','voice-lead');
 lead.setAttribute('aria-live','polite');
 inner.append(lead);fold.append(inner);
 const table=voiceTable({openItem,win}),words=wordStream(lead,{onWords:voiceWordsMark});
 node.append(fold,table.node);
 let opened=false,request=null;
 return {
  node,
  holds:()=>!node.hidden,
  update({phase,request:next,words:text,open,sources,saved}){
   if(phase==='connecting'&&!opened){opened=true;holdStage('T2');voiceMark('T2');}
   if(next!==null&&next!==request){request=next;words.set('');}
   if(text)words.set(text);
   fold.classList.toggle('open',open);
   table.setRows(mergeVoiceRows(sources));
   if(next!==null&&sources.some(s=>s.request===next&&s.rows.length)){voiceMark('Trow');voiceMark(`Trow#${next}`);}
   for(const {id} of saved)receiptMarkIfArmed(id);
   node.hidden=!open&&!table.size();
  },
 };
}

function problemCard(failure,on){
 const node=card(failure.phase==='no-mic'?'no-mic':'voice-failed');
 if(failure.phase==='no-mic')node.append(kicker(NO_MIC,{name:'mic_off',tone:'error'}),
  actionsRow(failure.canAsk?button('Try again',on.begin,{role:'text',iconName:'mic'}):button('Settings',on.settings,{role:'tonal',iconName:'settings'})));
 else node.append(kicker(failure.error,{name:'error',tone:'error'}),actionsRow(button('Try again',on.begin,{role:'text',iconName:'mic'})));
 return node;
}

/**
 * A past voice capture: the same table as the call, still, with no header. A discarded ramble or one that changed nothing
 * says so in one quiet line.
 */
export function voiceCard(capture,{rows,openItem}){
 const gone=!!capture.voice.undone;
 const node=card('voice-card voice');
 node.classList.remove('enter');
 node.dataset.morph='voice';
 if(gone||!rows.length)node.append(el('p','quiet',gone?'Discarded. Your words are kept in History.':'Nothing changed.'));
 else{
  const table=voiceTable({openItem,still:true});
  table.setRows(mergeVoiceRows([{request:0,rows}]));
  node.append(table.node);
 }
 receiptMarkIfArmed(capture.messageId);
 return node;
}
