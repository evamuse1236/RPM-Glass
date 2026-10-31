import {startVoice} from './voice-client.mjs';
import {liveSetup} from './voice-tools.mjs';
import {applyRamble,undoRamble} from './voice-turn.mjs';
import {el,button} from './capture-dom.mjs';
import {card,kicker,actionsRow} from './capture-cards.mjs';
import {tally} from './capture-lines.mjs';
import {wordStream,spine,spineRow,scrollBox,receiptHead} from './capture-voice-card.mjs';
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
 * Each request is saved with its words as one capture, one batch and one Undo, and gets its own receipt.
 */
export function createVoiceMode({platform,conversationId,onChange,afterSave,onLevel=()=>{},start=startVoice,now=()=>new Date(),
 timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,doc=globalThis.document,win=globalThis.window,sound=()=>chime()}){
 let live=null,session=null,shown=null,face=null,receipts=[],saveProblem=null;
 const show=next=>{live=next;const key=JSON.stringify(next);if(key===shown)return;shown=key;onChange();};
 const token=async setup=>{const reply=await platform.action('voiceToken',{setup});if(reply?.missingKey)throw new Error(NO_KEY);return reply;};
 const stop=()=>session?.stop();
 const hangUp=()=>session?.hangUp?.()??session?.stop();

 async function saveRequest(result,{index}){
  const options={messageId:crypto.randomUUID(),conversationId:conversationId(),timeZone};
  let saved;
  try{saved=await platform.saveWith(data=>{const out=applyRamble(data,result,{...options,now:now()});return out.status==='nothing'&&!result.heard?false:out;});}
  catch(error){saveProblem=userMessage(error);return;}
  if(saved===false)return;
  receipts=[...receipts,options.messageId];
  armReceiptMark(options.messageId,`T8#${index}`);
  sound();
  afterSave(options.messageId);
 }

 async function begin(){
  if(session||(live&&LIVE.has(live.phase)))return;
  face=null;receipts=[];saveProblem=null;
  show({phase:'connecting',heard:'',said:'',rows:[],request:0});
  try{
   session=start({continuous:true,data:()=>platform.voiceData(),timeZone,now,workletUrl:'/voice-mic-worklet.js',token,onLevel,onRequest:saveRequest,
    setup:()=>liveSetup(now(),timeZone,{data:platform.voiceData(),continuous:true}),
    onChange:state=>{if(LIVE.has(state.phase))show({phase:state.phase,heard:state.heard,said:state.said??'',rows:platform.voiceRows(state.changes),request:state.request});}});
   const result=await session.done;
   session=null;
   if(result.code==='no-mic'){
    const access=await platform.action('micAccess').catch(()=>null);
    show({phase:'no-mic',canAsk:access?.canAsk!==false});return;
   }
   const problem=result.failed||(result.missed?MISSED:null)||saveProblem;
   if(problem){show({phase:'failed',error:problem});return;}
   live=null;shown=null;onChange();
  }catch(error){session=null;show({phase:'failed',error:userMessage(error)});}
 }

 /** One Undo per ramble: it reverts the batch through the same save path, or returns why it cannot. */
 async function undo(messageId){
  try{await platform.saveWith(data=>{undoRamble(data,messageId,now());return true;});return null;}
  catch(error){return userMessage(error);}
 }

 if(typeof doc?.addEventListener==='function')doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')hangUp();});
 if(win)win.rpmVoiceBackground=hangUp;
 return {
  begin,stop,hangUp,undo,
  get live(){return live;},
  /** This session's saved requests, oldest first; kept on screen until the next session or a typed turn. */
  receipts:()=>[...receipts],
  active:()=>!!live&&LIVE.has(live.phase),
  clear(){if(live&&LIVE.has(live.phase))return;receipts=[];if(live){live=null;shown=null;onChange();}},
  card(){
   if(!live){face=null;return null;}
   const kind=faceOf(live);
   if(face?.kind!==kind)face={kind,...liveCard(kind,live,{begin,settings:()=>platform.action('micSettings')})};
   face.update(live);
   return face.node;
  },
 };
}

const FACE={connecting:'live',listening:'live',working:'live',speaking:'live'};
const faceOf=live=>FACE[live.phase]??JSON.stringify(live);
const WAITING={connecting:'Getting ready…',listening:'Start talking.',working:'Saving your changes…',speaking:'Saving your changes…'};
const waiting=next=>next.phase==='listening'&&next.request?'Keep talking, or hang up.':WAITING[next.phase];

/** One card from the first word to the last change: your words then RPM's streaming in, the rows landing on the spine. */
function liveCard(kind,live,on){
 if(kind==='live'){
  const node=card('voice-card voice-live');
  node.dataset.morph='voice';
  node.setAttribute('role','status');
  let source='heard';
  const lead=el('p','voice-lead'),rows=el('ul','spine'),words=wordStream(lead,{onWords:()=>{if(source==='heard')voiceWordsMark();}});
  lead.setAttribute('aria-live','polite');
  node.append(scrollBox(lead,rows));
  let count=0,opened=false,request=0;
  return {node,update:next=>{
   if(next.phase==='connecting'&&!opened){opened=true;holdStage('T2');}
   if((next.request??0)!==request){request=next.request??0;rows.replaceChildren();count=0;words.set('');}
   const speaker=next.phase==='speaking'&&next.said?'said':'heard';
   if(speaker!==source){source=speaker;words.set('');}
   words.set(next[source],waiting(next));
   if(next.phase==='connecting')voiceMark('T2');
   for(const row of next.rows.slice(count)){rows.append(spineRow(row,{}));voiceMark('Trow');voiceMark(`Trow#${request}`);}
   count=next.rows.length;
  }};
 }
 const node=card(live.phase==='no-mic'?'no-mic':'voice-failed');
 if(live.phase==='no-mic')node.append(kicker(NO_MIC,{name:'mic_off',tone:'error'}),
  actionsRow(live.canAsk?button('Try again',on.begin,{role:'text',iconName:'mic'}):button('Settings',on.settings,{role:'tonal',iconName:'settings'})));
 else node.append(kicker(live.error,{name:'error',tone:'error'}),actionsRow(button('Try again',on.begin,{role:'text',iconName:'mic'})));
 return {node,update(){}};
}

/**
 * A saved ramble: a pinned header with the tally and Discard, Edit and Open planner as round symbols, then what RPM said
 * and the changes on the spine. It takes the live card's place without an entrance, so the card grows into it.
 */
export function voiceCard(capture,{rows,discard,openPlanner,openItem}){
 const voice=capture.voice,gone=!!voice.undone;
 const node=card('voice-card receipt voice');
 node.classList.remove('enter');
 node.classList.toggle('discarded',gone);
 node.dataset.morph='voice';
 const title=gone?'Discarded':rows.length?tally(rows):'Nothing changed';
 const sentence=gone?'Your words are kept in History.':capture.reply;
 node.append(receiptHead(node,{title,rows,gone,discard:voice.canUndo?()=>discard(capture.messageId):null,openPlanner,openItem}),
  scrollBox(sentence?el('p','voice-sentence',sentence):'',rows.length?spine(rows,{open:openItem,editing:()=>node.classList.contains('editing')}):''));
 receiptMarkIfArmed(capture.messageId);
 return node;
}
