import {startVoice} from './voice-client.mjs';
import {liveSetup} from './voice-tools.mjs';
import {recordWords,applyRamble,undoRamble} from './voice-turn.mjs';
import {el,icon,button} from './capture-dom.mjs';
import {card,kicker,actionsRow,answerText} from './capture-cards.mjs';
import {lines,tally} from './capture-lines.mjs';
import {userMessage} from './user-message.mjs';

export const NO_KEY='Connect a Gemini key in Settings to talk to RPM.';
export const NO_MIC='Allow the microphone to talk to RPM. Typing still works.';
const LIVE=new Set(['connecting','listening','working','speaking']);

/**
 * Capture's voice mode on the phone: the words are saved at the first `wordsReady`, every change lands as one batch
 * with one Undo when the turn ends, and the mic stops when Capture leaves the screen.
 */
export function createVoiceMode({platform,conversationId,onChange,afterSave,start=startVoice,now=()=>new Date(),
 timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,doc=globalThis.document,win=globalThis.window}){
 let live=null,session=null,shown=null,face=null;
 const show=next=>{live=next;const key=JSON.stringify(next);if(key===shown)return;shown=key;onChange();};
 const token=async setup=>{const reply=await platform.action('voiceToken',{setup});if(reply?.missingKey)throw new Error(NO_KEY);return reply;};
 const stop=()=>session?.stop();

 async function begin(){
  if(live&&LIVE.has(live.phase))return;
  const options={messageId:crypto.randomUUID(),conversationId:conversationId(),timeZone};
  let saving=null;
  show({phase:'connecting',heard:'',rows:[]});
  try{
   session=start({data:platform.voiceData(),timeZone,setup:liveSetup(now(),timeZone),now,workletUrl:'/voice-mic-worklet.js',token,onChange:state=>{
    if(state.wordsReady&&state.heard&&!saving)saving=platform.saveWith(data=>recordWords(data,state.heard,{...options,now:now()}));
    if(LIVE.has(state.phase))show({phase:state.phase,heard:state.heard,rows:platform.voiceRows(state.changes)});
   }});
   const result=await session.done;
   session=null;
   await saving?.catch(()=>{});
   if(result.code==='no-mic'){
    const access=await platform.action('micAccess').catch(()=>null);
    show({phase:'no-mic',canAsk:access?.canAsk!==false});return;
   }
   const saved=await platform.saveWith(data=>{const out=applyRamble(data,result,{...options,now:now()});return out.status==='nothing'&&!result.heard?false:out;});
   if(saved===false){show({phase:'failed',error:result.failed||'Voice heard nothing. Try again.'});return;}
   live=null;shown=null;afterSave(options.messageId);
  }catch(error){session=null;show({phase:'failed',error:userMessage(error)});}
 }

 /** One Undo per ramble: it reverts the batch through the same save path, or returns why it cannot. */
 async function undo(messageId){
  try{await platform.saveWith(data=>{undoRamble(data,messageId,now());return true;});return null;}
  catch(error){return userMessage(error);}
 }

 doc?.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')stop();});
 if(win)win.rpmVoiceBackground=stop;
 return {
  begin,stop,undo,
  get live(){return live;},
  active:()=>!!live&&LIVE.has(live.phase),
  clear(){if(live&&!LIVE.has(live.phase)){live=null;shown=null;onChange();}},
  card(){
   if(!live){face=null;return null;}
   const kind=faceOf(live);
   if(face?.kind!==kind)face={kind,...liveCard(kind,live,{stop,begin,settings:()=>platform.action('micSettings')})};
   face.update(live);
   return face.node;
  },
 };
}

const FACE={connecting:'listening',listening:'listening',working:'working',speaking:'working'};
const faceOf=live=>FACE[live.phase]??JSON.stringify(live);

/** The card for one phase of a live ramble. `update` changes its words and rows in place, so the card never blinks. */
function liveCard(kind,live,on){
 if(kind==='listening'){
  const node=card('listening');
  node.setAttribute('role','status');
  const heard=el('p','heard');
  heard.setAttribute('aria-live','polite');
  node.append(icon('mic',{fill:true}),el('p','card-title','Listening'),heard,actionsRow(button('Done',on.stop,{role:'tonal',iconName:'stop'})));
  return {node,update:next=>{heard.textContent=next.heard||(next.phase==='connecting'?'Getting ready…':'Start talking.');}};
 }
 if(kind==='working'){
  const node=card('working');
  node.setAttribute('role','status');
  const words=el('p','words');
  let list=el('ul','lines'),rowsKey='';
  node.append(kicker('Saving your changes',{name:'graphic_eq'}),words,list);
  return {node,update:next=>{
   words.textContent=next.heard;words.hidden=!next.heard;
   const key=JSON.stringify(next.rows);
   if(key!==rowsKey){rowsKey=key;const fresh=lines(next.rows);list.replaceWith(fresh);list=fresh;}
   list.hidden=!next.rows.length;
  }};
 }
 const node=card(live.phase==='no-mic'?'no-mic':'voice-failed');
 if(live.phase==='no-mic')node.append(kicker(NO_MIC,{name:'mic_off',tone:'error'}),
  actionsRow(live.canAsk?button('Try again',on.begin,{role:'text',iconName:'mic'}):button('Settings',on.settings,{role:'tonal',iconName:'settings'})));
 else node.append(kicker(live.error,{name:'error',tone:'error'}),actionsRow(button('Try again',on.begin,{role:'text',iconName:'mic'})));
 return {node,update(){}};
}

/** A saved ramble: one row per change with its icon, the spoken sentence, and Undo while it is still the newest change. */
export function voiceCard(capture,{rows,undo,openPlanner}){
 const voice=capture.voice,node=card('receipt');
 node.classList.add('voice');
 const head=voice.undone?'Undone':rows.length?tally(rows):'Nothing changed';
 node.append(kicker(head,{name:voice.undone?'undo':'check_circle',tone:voice.undone?'':'done'}));
 if(rows.length&&!voice.undone)node.append(lines(rows));
 if(capture.reply)node.append(answerText(capture.reply));
 const canUndo=!!voice.undoEvent&&!voice.undone;
 node.append(actionsRow(canUndo?button('Undo',()=>undo(capture.messageId),{role:'text',iconName:'undo'}):null,button('Open planner',openPlanner,{role:'text'})));
 return node;
}
