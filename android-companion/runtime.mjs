import {coalesceRefresh} from './surface-refresh.mjs';
import {installDiagnostics} from './diagnostics.mjs';
import {applyClarityPreferences} from './planner-clarity.mjs';
import {describeLink,blockChoices,dayLoad} from './capture-context.mjs';
import {calendarRows} from './planner-calendar.mjs';
import {dueInfo} from './planner/format.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {entryView,propose,undo} from '../chat-prototype/companion-tools.mjs';
import {MODEL} from '../chat-prototype/companion-agent.mjs';
import {migratePlannerUX} from './planner-ux.mjs';
import {importLegacyEntries} from './legacy-import.mjs';
import * as reviewState from './review-state.mjs';
import {editPlan,blockDue} from './planner-state.mjs';
import {planningFocus,changePlanner} from './planner-tools.mjs';
import {executeCaptureAction,goalDraftAction,receiptsForMessage} from './capture-actions.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';

// Android's WebView is updateable independently of the OS; support older engines.
if(!Array.prototype.toReversed)Object.defineProperty(Array.prototype,'toReversed',{value:function(){return this.slice().reverse();}});
if(!Array.prototype.findLast)Object.defineProperty(Array.prototype,'findLast',{value:function(fn){for(let i=this.length-1;i>=0;i--)if(fn(this[i],i,this))return this[i];}});
if(!AbortSignal.timeout)AbortSignal.timeout=ms=>{const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;};

// The bridge only talks to bundled app content. Secrets never enter this runtime.
const waiting=new Map(),session=crypto.randomUUID();let serial=0,data,busy=false,phone={};
const diagnostics=installDiagnostics({sessionId:session});
window.rpmBridgeResult=(id,result,error)=>{const p=waiting.get(id);if(!p)return;waiting.delete(id);clearTimeout(p.timer);error?p.reject(new Error(error)):p.resolve(result);};
export function native(action,payload={}){if(['model','decision'].includes(action)&&!payload.requestId)payload={...payload,requestId:action+':'+crypto.randomUUID()};return new Promise((resolve,reject)=>{const id=session+':'+(++serial),timeout=action==='model'?38000:action==='decision'?16000:action==='dictate'?120000:10000;const timer=setTimeout(()=>{waiting.delete(id);if(['model','decision'].includes(action))native('cancelModel',{requestId:payload.requestId}).catch(()=>{});reject(new Error('The phone did not respond. Your last saved data is intact.'));},timeout);waiting.set(id,{resolve,reject,timer});window.RpmNative.invoke(id,action,JSON.stringify(payload));});}
const ready=(async()=>{const legacy=await native('legacyEntries').catch(error=>{diagnostics.emit('exception','error',{error},{operation:'legacy.import',outcome:'error'});return null;});
// Capture and the planner can start together; if the other one saved first, reload and redo the idempotent upgrades.
for(let attempt=1;;attempt++){const saved=await native('load');phone=saved.phone;data=saved.data??freshStore();const uxChanged=migratePlannerUX(data);const reviewChanged=reviewState.migrateReviewData?.(data);const legacyChanged=!!legacy&&!legacy.done&&importLegacyEntries(data,legacy)>0;if(!(uxChanged||reviewChanged||legacyChanged||!saved.data))break;try{await save();break;}catch(error){if(attempt>=3)throw error;}}
if(legacy&&!legacy.done)native('legacyImported').catch(()=>{});if(data.inFlight){const cid=data.inFlight.conversationId;data.inFlight=null;const c=cid?data.conversations.find(x=>x.id===cid):data.conversations.find(x=>x.messages.at(-1)?.role==='user');if(c)c.messages.push({id:crypto.randomUUID(),role:'assistant',at:new Date().toISOString(),text:'The previous request was interrupted. Your message is saved; no unfinished changes were applied. You can retry.',error:'interrupted'});await save();}})();
ready.catch(error=>{diagnostics.emit('exception','error',{error},{operation:'app.load',outcome:'error'});const host=document.getElementById('workspace')??document.getElementById('content');if(!host)return;const message=document.createElement('p'),retry=document.createElement('button');message.className='error';message.setAttribute('role','alert');message.textContent='Your plan could not be opened. '+error.message;retry.textContent='Try again';retry.addEventListener('click',()=>location.reload());host.replaceChildren(message,retry);if(location.pathname==='/index.html')native('captureSize',{height:300,width:innerWidth}).catch(()=>{});});
async function save(){const expected=data.version;const next={...data,version:expected+1};const result=await native('save',{expected,data:next});data=next;phone=result;}
const intentBackend={load:async()=>{const latest=await native('load');phone=latest.phone;if(latest.data)data=latest.data;return structuredClone(data);},save:async(expected,next)=>{if(data.version!==expected){const error=new Error('Version conflict');error.code='VERSION_CONFLICT';throw error;}const result=await native('save',{expected,data:next});data=structuredClone(next);phone=result;}};
const intentService=createIntentService({backend:intentBackend,native,changePlanner,undo,readCalendar:anchor=>native('calendarRead',{anchor}),editPlan,onEvent:event=>{window.dispatchEvent(new CustomEvent('rpm-intent-event',{detail:event}));diagnostics.emit('intent',event.error?'error':'info',event,{operation:'intent.'+event.type,operationId:event.messageId??event.draftId??'',outcome:event.error?'error':''});}});
const view=()=>({version:data.version,csrf:'native-local',busy,aiEnabled:phone.hasKey,model:MODEL,captureMode:'glass',intent:intentViewFromData(data),entries:data.entries.map(entryView),memories:data.memories,history:data.history,conversations:data.conversations,pending:data.pending,undoId:data.undo?.id??null,imported:data.imported,phone});
const response=(value,status=200)=>({ok:status<400,status,json:async()=>value});
const captureFocus=()=>{let f={};try{f=JSON.parse(localStorage.getItem('rpm-capture-context')??'{}');}catch{}return f;};
window.fetch=async(url,options={})=>{
  await ready;
  if(url==='/api/state')return response(view());
  if(url!=='/api/turn')throw new Error('Only local app requests are allowed.');
  if(busy)return response({error:'Still working on the previous message.',state:view()},409);
  const b=JSON.parse(options.body);if(b.version!==data.version)return response({error:'Saved data changed. Reopen the assistant before retrying.',state:view()},409);
  let c=data.conversations.find(x=>x.id===b.conversationId)??data.conversations.find(x=>!x.archived);const cid=c.id;const at=()=>new Date().toISOString();const before=structuredClone(data);
  try{
    if(b.type==='new')data.conversations.push({id:crypto.randomUUID(),title:'New conversation',messages:[],archived:false});
    else if(b.type==='cancel'){data.pending=null;c.messages.push({role:'assistant',id:crypto.randomUUID(),at:at(),text:'I left that proposal. Nothing was changed.'});}
    else if(b.type==='undo')c.messages.push({role:'assistant',id:crypto.randomUUID(),at:at(),...undo(data,b.undoId)});
    else if(['archive','restore'].includes(b.type)){
      if(!['entries','memories','history','conversations'].includes(b.collection)||(b.collection==='conversations'&&b.id===cid&&b.type==='archive'))throw new Error('Open another conversation before archiving this one.');
      const raw=`${b.type} this ${b.collection} record`;const result=propose(data,{operations:[{type:b.type,collection:b.collection,id:b.id,fields:{},evidence:[raw]}],continuation:false,question:null,choices:[]},{raw,conversationId:cid});c.messages.push({role:'assistant',id:crypto.randomUUID(),at:at(),...result});
    }else if(b.type==='intentRetry'){
      busy=true;await diagnostics.track('capture.retry',{operationId:b.messageId,conversationId:cid},()=>intentService.retry(b.messageId));busy=false;return response(view());
    }else if(b.type==='intentAction'){
      busy=true;await diagnostics.track('capture.action',{operationId:b.actionId,draftId:b.action?.draftId,action:b.action?.kind},()=>intentService.act(b.action,{actionId:b.actionId}));busy=false;return response(view());
    }else if(b.type==='intentUndo'){
      busy=true;await intentService.undo({draftId:b.draftId,conversationId:cid,actionId:b.actionId});busy=false;return response(view());
    }else if(b.type==='intentResume'){
      busy=true;await intentService.resume(b.draftId,{conversationId:cid,actionId:b.actionId});busy=false;return response(view());
    }else if(b.type==='message'){
      if(c.archived||typeof b.text!=='string'||!b.text.trim()||b.text.length>12000)throw new Error('Write a message in an active conversation.');
      busy=true;await diagnostics.track('capture',{operationId:b.messageId,conversationId:cid,inputCharacters:b.text.length},()=>intentService.capture({messageId:b.messageId,conversationId:cid,text:b.text,focusDraftId:b.focusDraftId??null}));busy=false;return response(view());
    }else throw new Error('Unknown action.');
    if(data.planner&&['archive','restore','undo'].includes(b.type))data.planner.undo=null;
    await save();return response(view());
  }catch(e){if(!busy)data=before;busy=false;return response({error:e.message,state:view()},500);}
};
const isPlanner=location.pathname==='/planner.html';
window.RPM_PLATFORM={native:true,action:native,delivery:id=>phone.delivery?.[String(id)],plansDescription:'Saved on this phone. Alert status below comes from Android.',about:['Capture saves your exact words, then asks before changing tasks or Blocks. Older conversations and records remain in History.','Your recent chat, relevant entries and explicit preferences go to OpenRouter when you send a message. Older unarchived history is available through tools. Capture uses '+MODEL+' with no reasoning for extraction and high reasoning for planning, contextual questions and one repair attempt. Jev is used only when you choose Sort with Jev: it suggests matches to existing Blocks, then waits for your review.','Chat, plans and context are stored privately on this phone. The AI key is encrypted with Android Keystore, not included in this APK. When diagnostics are connected, full app console output, errors and operation records upload to the private diagnostic database and expire after 14 days. Console output may include capture content. Pause or disconnect in Settings. No desktop server is needed.','RPM reminders use Android notifications. Ringing alarms use Android AlarmManager and alarm audio, at the planned time. They are not entries in Samsung Clock or Google Calendar. Phone permissions and notification settings must allow delivery.','Imported context is a copy. Imported alerts start disarmed, so old plans cannot unexpectedly ring. Review an entry and tap Enable on phone. Archive or Undo updates the phone schedule too.','You can hide the floating butterfly from its notification. Microphone input opens Android voice typing only when you tap the microphone. The older RPM screens remain separate in Settings.']};
// Refresh delivery outcomes/permissions without losing the current draft.
window.RPM_PLATFORM.openPlans=()=>native('planner');
window.RPM_PLATFORM.intentForConversation=(conversationId,options={})=>intentViewFromData(data,{conversationId,...options});
window.RPM_PLATFORM.planningFocus=()=>planningFocus(data,captureFocus());
window.RPM_PLATFORM.clearPlanningFocus=()=>localStorage.removeItem('rpm-capture-context');
window.RPM_PLATFORM.captureAction=async action=>{const latest=await native('load');phone=latest.phone;if(latest.data)data=latest.data;return executeCaptureAction(data,action,native);};
window.RPM_PLATFORM.suggestionAction=(suggestion,sourceRaw,at)=>goalDraftAction(suggestion,sourceRaw,at?new Date(at):new Date());
window.RPM_PLATFORM.receiptsForMessage=message=>receiptsForMessage(data,message,entryView);
window.RPM_PLATFORM.describeLink=(field,value)=>describeLink(data,field,value);
// A Block's Result deadline for Capture's proposals and Block picker: dueInfo() with its stored value, or null.
window.RPM_PLATFORM.blockDue=id=>{const due=blockDue(data,id);return due&&{...dueInfo(due.value),value:due.value};};
window.RPM_PLATFORM.blockChoices=()=>blockChoices(data,window.RPM_PLATFORM.blockDue);
window.rpmPhoneRefresh=coalesceRefresh(async()=>{await ready;if(!busy){const latest=await native('load');phone=latest.phone;if(latest.data&&latest.data.version!==data.version){data=latest.data;window.dispatchEvent(new Event('rpm-data-refresh'));}}window.dispatchEvent(new Event('rpm-phone-status'));});
await ready;
applyClarityPreferences();
const syncTextScale=()=>{document.documentElement.dataset.reduceMotion=String(!!phone.reducedMotion);document.documentElement.dataset.largeText=String((phone.effectiveFontScale??phone.fontScale)>=1.5);};
syncTextScale();window.addEventListener('rpm-phone-status',syncTextScale);
if(isPlanner){
  // Native paints the window edges and system-bar icons; keep them on the planner's effective theme.
  const systemDark=matchMedia('(prefers-color-scheme: dark)'),syncSurface=()=>{const pinned=document.documentElement.dataset.appearance;native('surface',{dark:pinned?pinned==='dark':systemDark.matches}).catch(()=>{});};
  syncSurface();new MutationObserver(syncSurface).observe(document.documentElement,{attributes:true,attributeFilter:['data-appearance']});systemDark.addEventListener?.('change',syncSurface);
  const {mountPlanner}=await import('./planner.mjs');
  const withSort=async run=>{if(busy)throw new Error('Wait for the current save.');busy=true;try{return await run();}finally{busy=false;}};
  const sortPreview={create:(input,options)=>withSort(()=>intentService.sort.create(input,options)),accept:(id,options)=>withSort(()=>intentService.sort.accept(id,options)),dismiss:(id,options)=>withSort(()=>intentService.sort.dismiss(id,options)),get:id=>intentService.sort.get(id),list:options=>intentService.sort.list(options)};
  const ui=mountPlanner({getData:()=>data,getPhone:()=>phone,native,sortPreview,commit:async op=>{if(busy)throw new Error('Wait for the current save.');busy=true;const before=data;try{data=structuredClone(before);const id=typeof op==='function'?op(data):editPlan(data,op);await save();return id;}catch(e){data=before;throw e;}finally{busy=false;}}});
  if(location.hash==='#ideas')ui.goalIdeas();
  else if(location.hash.startsWith('#open='))try{ui.openView(JSON.parse(decodeURIComponent(location.hash.slice(6))));}catch{}
}else {
  // Capture: the unsent draft is written through Android's ordered private
  // store; WebView localStorage is only a compatibility mirror.
  const kept=await native('captureDraft');
  if(kept.present)localStorage.setItem('rpm-native-draft',kept.text);
  let lastText=kept.present?kept.text:null;
  window.RPM_PLATFORM.saveComposerDraft=text=>{
    if(text===lastText)return Promise.resolve();
    lastText=text;
    return native('captureDraft',{text}).catch(error=>{lastText=null;throw error;});
  };
  // A read-only copy of the selected calendars, so a proposal can say what else holds its day.
  // Without permission or a selected calendar there are simply no events.
  let calendar=null;
  const readCalendar=()=>native('calendarRead',{anchor:Date.now()}).then(value=>{calendar=value?.status==='ready'?calendarRows(value):null;window.dispatchEvent(new Event('rpm-calendar-ready'));},()=>{});
  readCalendar();window.addEventListener('rpm-phone-status',readCalendar);
  window.RPM_PLATFORM.dayLoad=options=>dayLoad(data,{...options,events:calendar??[],deadline:id=>blockDue(data,id)});
  const {mountCapture}=await import('./capture-app.mjs');
  mountCapture(window.RPM_PLATFORM);
}
