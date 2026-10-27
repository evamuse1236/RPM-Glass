import {startVoice} from './voice-client.mjs';
import {liveSetup} from './voice-tools.mjs';
import {recordWords,applyRamble,undoRamble} from './voice-turn.mjs';
import {el,button,iconButton} from './capture-dom.mjs';
import {card,kicker,actionsRow} from './capture-cards.mjs';
import {tally} from './capture-lines.mjs';
import {orb,setLevel,wordStream,spine,spineRow,scrollBox,tools,receiptTools} from './capture-voice-card.mjs';
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
  face=null;
  show({phase:'connecting',heard:'',said:'',rows:[]});
  try{
   session=start({data:platform.voiceData(),timeZone,setup:liveSetup(now(),timeZone),now,workletUrl:'/voice-mic-worklet.js',token,onLevel:value=>face?.level?.(value),onChange:state=>{
    if(state.wordsReady&&state.heard&&!saving)saving=platform.saveWith(data=>recordWords(data,state.heard,{...options,now:now()}));
    if(LIVE.has(state.phase))show({phase:state.phase,heard:state.heard,said:state.said??'',rows:platform.voiceRows(state.changes)});
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

const FACE={connecting:'live',listening:'live',working:'live',speaking:'live'};
const faceOf=live=>FACE[live.phase]??JSON.stringify(live);
const WAITING={connecting:'Getting ready…',listening:'Start talking.',working:'Saving your changes…',speaking:'Saving your changes…'};

/** One card from the first word to the last change: the orb, your words then RPM's streaming in, the rows landing on the spine. */
function liveCard(kind,live,on){
 if(kind==='live'){
  const node=card('voice-card voice-live');
  node.dataset.morph='voice';
  node.setAttribute('role','status');
  const glow=orb(),lead=el('p','voice-lead'),stopButton=iconButton('stop','Stop and save',on.stop,{cls:'voice-stop',fill:true});
  lead.setAttribute('aria-live','polite');
  const top=el('div','voice-top'),rows=el('ul','spine'),words=wordStream(lead);
  top.append(glow,lead,stopButton);
  node.append(top,scrollBox(rows));
  let phase=null,source='heard',count=0;
  return {node,level:value=>setLevel(glow,value),update:next=>{
   if(next.phase!==phase){
    phase=next.phase;
    glow.className=`orb ${phase}`;
    stopButton.hidden=phase==='working'||phase==='speaking';
   }
   const speaker=phase==='speaking'&&next.said?'said':'heard';
   if(speaker!==source){source=speaker;words.set('');}
   words.set(next[source],WAITING[phase]);
   for(const row of next.rows.slice(count))rows.append(spineRow(row,{}));
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
 * A saved ramble: what RPM said, the changes on the spine, and Discard, Edit and Open planner as symbols.
 * It takes the live card's place without an entrance, so the card grows into it.
 */
export function voiceCard(capture,{rows,discard,openPlanner,openItem}){
 const voice=capture.voice,gone=!!voice.undone;
 const node=card('voice-card receipt voice');
 node.classList.remove('enter');
 node.classList.toggle('discarded',gone);
 node.dataset.morph='voice';
 const top=el('div','voice-top');
 const lead=gone?'Discarded. Your words are kept in History.':capture.reply||(rows.length?tally(rows):'Nothing changed');
 top.append(orb(gone?'idle':'done'),el('p','voice-lead',lead));
 node.append(scrollBox(top,rows.length?spine(rows,{open:openItem,editing:()=>node.classList.contains('editing')}):''));
 const canDiscard=!!voice.undoEvent&&!gone;
 node.append(gone?tools(iconButton('open_in_new','Open planner',openPlanner))
  :receiptTools(node,{rows,discard:canDiscard?()=>discard(capture.messageId):null,openPlanner,openItem}));
 return node;
}
