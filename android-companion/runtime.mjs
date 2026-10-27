import {coalesceRefresh} from './surface-refresh.mjs';
import {retryOnChange} from './save-retry.mjs';
import {installDiagnostics} from './diagnostics.mjs';
import {applyClarityPreferences} from './planner-clarity.mjs';
import {describeLink,blockChoices,dayLoad,editChoices} from './capture-context.mjs';
import {calendarRows} from './planner-calendar.mjs';
import {dueInfo} from './planner/format.mjs';
import {freshStore,markInterrupted} from '../chat-prototype/companion-state.mjs';
import {entryView,propose,undo} from '../chat-prototype/companion-tools.mjs';
import {HAIKU_MODEL} from '../intent-v2/src/model-policy.mjs';
import {migratePlannerUX} from './planner-ux.mjs';
import {importLegacyEntries} from './legacy-import.mjs';
import * as reviewState from './review-state.mjs';
import {editPlan,blockDue} from './planner-state.mjs';
import {planningFocus,changePlanner} from './planner-tools.mjs';
import {executeCaptureAction,goalDraftAction,receiptsForMessage} from './capture-actions.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {storedCopy} from './stored-copy.mjs';
import {planSnapshot} from './capture-snapshot.mjs';
import {dayAgenda,nextItem,bodyToday} from './capture-agenda.mjs';
import {userMessage} from './user-message.mjs';

// Android's WebView is updateable independently of the OS; support older engines.
if(!Array.prototype.toReversed)Object.defineProperty(Array.prototype,'toReversed',{value:function(){return this.slice().reverse();}});
if(!Array.prototype.findLast)Object.defineProperty(Array.prototype,'findLast',{value:function(fn){for(let i=this.length-1;i>=0;i--)if(fn(this[i],i,this))return this[i];}});
if(!AbortSignal.timeout)AbortSignal.timeout=ms=>{const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;};

// The bridge only talks to bundled app content. Secrets never enter this runtime.
const waiting=new Map(),session=crypto.randomUUID();let serial=0,data,busy=false,phone={};
const diagnostics=installDiagnostics({sessionId:session});
window.rpmBridgeResult=(id,result,error)=>{const p=waiting.get(id);if(!p)return;waiting.delete(id);clearTimeout(p.timer);error?p.reject(new Error(error)):p.resolve(result);};
window.rpmBridgeChunk=(id,chunk)=>waiting.get(id)?.onChunk?.(chunk);
export function native(action,payload={},{onChunk}={}){if(['model','decision'].includes(action)&&!payload.requestId)payload={...payload,requestId:action+':'+crypto.randomUUID()};return new Promise((resolve,reject)=>{const id=session+':'+(++serial),timeout=action==='model'?Math.min(Math.max(Number(payload.timeoutMs)||38000,5000),100000):action==='decision'?16000:action==='dictate'?120000:10000;const timer=setTimeout(()=>{waiting.delete(id);if(['model','decision'].includes(action))native('cancelModel',{requestId:payload.requestId}).catch(()=>{});reject(new Error('The phone did not respond. Your last saved data is intact.'));},timeout);waiting.set(id,{resolve,reject,timer,onChunk});window.RpmNative.invoke(id,action,JSON.stringify(payload));});}
native.supportsStreaming=true;
const stored=storedCopy(native);
const ready=(async()=>{const legacy=await native('legacyEntries').catch(error=>{diagnostics.emit('exception','error',{error},{operation:'legacy.import',outcome:'error'});return null;});
// Capture and the planner can start together; if the other one saved first, reload and redo the idempotent upgrades.
await retryOnChange(async()=>{const saved=await stored.load();phone=saved.phone;data=saved.data??freshStore();const uxChanged=migratePlannerUX(data);const reviewChanged=reviewState.migrateReviewData?.(data);const legacyChanged=!!legacy&&!legacy.done&&importLegacyEntries(data,legacy)>0;if(uxChanged||reviewChanged||legacyChanged||!saved.data)await save();},async()=>{});
if(legacy&&!legacy.done)native('legacyImported').catch(()=>{});await retryOnChange(async()=>{if(markInterrupted(data))await save();},async()=>{const latest=await stored.load();phone=latest.phone;if(latest.data)data=latest.data;});})();
ready.catch(error=>{diagnostics.emit('exception','error',{error},{operation:'app.load',outcome:'error'});const host=document.getElementById('workspace')??document.getElementById('content');if(!host)return;const message=document.createElement('p'),retry=document.createElement('button');message.className='error';message.setAttribute('role','alert');message.textContent='Your plan could not be opened. '+userMessage(error,'');retry.textContent='Try again';retry.addEventListener('click',()=>location.reload());host.replaceChildren(message,retry);if(location.pathname==='/index.html')native('captureSize',{height:300,width:innerWidth}).catch(()=>{});});
async function save(){const expected=data.version;const next={...data,version:expected+1};const result=await native('save',{expected,data:next});stored.remember(next);data=next;phone=result;}
const intentBackend={load:async()=>{const latest=await stored.load();phone=latest.phone;if(latest.data)data=latest.data;return structuredClone(data);},save:async(expected,next)=>{if(data.version!==expected){const error=new Error('Version conflict');error.code='VERSION_CONFLICT';throw error;}const result=await native('save',{expected,data:next});stored.remember(next);data=structuredClone(next);phone=result;}};
const calendarEvents=()=>native('calendarRead',{anchor:Date.now()}).then(value=>{calendarCopy=value?.status==='ready'?calendarRows(value):[];return calendarCopy;},()=>[]);
const intentService=createIntentService({backend:intentBackend,native,changePlanner,undo,readCalendar:anchor=>native('calendarRead',{anchor}),editPlan,snapshot:({data})=>({...planSnapshot(data,{now:new Date(),events:calendarCopy}),calendarReady:calendarEvents()}),onEvent:event=>{window.dispatchEvent(new CustomEvent('rpm-intent-event',{detail:event}));diagnostics.emit('intent',event.error?'error':'info',event,{operation:'intent.'+event.type,operationId:event.messageId??event.draftId??'',outcome:event.error?'error':''});}});
const traces=createTraceStore({emit:trace=>diagnostics.emit('capture-trace',trace.likelyMistake?'warn':'info',trace,{operation:'capture.trace',operationId:trace.id,outcome:trace.outcome??trace.applied?.status??''})});
const agent=createCaptureAgent({service:intentService,traces});
const view=()=>({version:data.version,csrf:'native-local',busy,aiEnabled:phone.hasKey,model:HAIKU_MODEL,captureMode:'glass',intent:intentViewFromData(data),entries:data.entries.map(entryView),memories:data.memories,history:data.history,conversations:data.conversations,pending:data.pending,undoId:data.undo?.id??null,choices:editChoices(data),imported:data.imported,phone});
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
      busy=true;await diagnostics.track('capture.retry',{operationId:b.messageId,conversationId:cid},()=>agent.retry(b.messageId));busy=false;return response(view());
    }else if(b.type==='intentChoose'){
      busy=true;await diagnostics.track('capture.choose',{operationId:b.actionId,conversationId:cid},()=>agent.choose(b.action,{actionId:b.actionId}));busy=false;return response(view());
    }else if(b.type==='intentAction'){
      busy=true;await diagnostics.track('capture.action',{operationId:b.actionId,draftId:b.action?.draftId,action:b.action?.kind},()=>agent.act(b.action,{actionId:b.actionId}));busy=false;return response(view());
    }else if(b.type==='intentUndo'){
      busy=true;await agent.undo({draftId:b.draftId,conversationId:cid,actionId:b.actionId});busy=false;return response(view());
    }else if(b.type==='intentKeep'){
      busy=true;await agent.confirm({draftId:b.draftId,conversationId:cid,actionId:b.actionId});busy=false;return response(view());
    }else if(b.type==='keepNote'){
      busy=true;await intentService.keepNote({messageId:b.messageId,sourceId:b.sourceId,keep:b.keep!==false,actionId:b.actionId});busy=false;return response(view());
    }else if(b.type==='intentResume'){
      busy=true;await intentService.resume(b.draftId,{conversationId:cid,actionId:b.actionId});busy=false;return response(view());
    }else if(b.type==='message'){
      if(c.archived||typeof b.text!=='string'||!b.text.trim()||b.text.length>12000)throw new Error('Write a message in an active conversation.');
      busy=true;await diagnostics.track('capture',{operationId:b.messageId,conversationId:cid,inputCharacters:b.text.length},()=>agent.capture({messageId:b.messageId,conversationId:cid,text:b.text,focusDraftId:b.focusDraftId??null}));busy=false;return response(view());
    }else throw new Error('Unknown action.');
    if(data.planner&&['archive','restore','undo'].includes(b.type))data.planner.undo=null;
    await save();return response(view());
  }catch(e){if(!busy)data=before;busy=false;return response({error:userMessage(e),state:view()},500);}
};
const isPlanner=location.pathname==='/planner.html';
window.RPM_PLATFORM={native:true,action:native,delivery:id=>phone.delivery?.[String(id)],plansDescription:'Saved on this phone. Alert status below comes from Android.'};
// Refresh delivery outcomes/permissions without losing the current draft.
window.RPM_PLATFORM.openPlans=()=>native('planner');
window.RPM_PLATFORM.intentForConversation=(conversationId,options={})=>intentViewFromData(data,{conversationId,...options});
window.RPM_PLATFORM.planningFocus=()=>planningFocus(data,captureFocus());
window.RPM_PLATFORM.clearPlanningFocus=()=>localStorage.removeItem('rpm-capture-context');
window.RPM_PLATFORM.captureAction=async action=>{const latest=await native('load');phone=latest.phone;if(latest.data)data=latest.data;return executeCaptureAction(data,action,native);};
window.RPM_PLATFORM.suggestionAction=(suggestion,sourceRaw,at)=>goalDraftAction(suggestion,sourceRaw,at?new Date(at):new Date());
window.RPM_PLATFORM.receiptsForMessage=message=>receiptsForMessage(data,message,entryView);
window.RPM_PLATFORM.previewCapture=(text,{conversationId,signal}={})=>ready.then(()=>phone.hasKey?agent.preview({conversationId,text},{signal}):{status:'silent',rows:[]});
window.RPM_PLATFORM.describeLink=(field,value)=>describeLink(data,field,value);
// A Block's Result deadline for Capture's proposals and Block picker: dueInfo() with its stored value, or null.
window.RPM_PLATFORM.blockDue=id=>{const due=blockDue(data,id);return due&&{...dueInfo(due.value),value:due.value};};
window.RPM_PLATFORM.blockChoices=()=>blockChoices(data,window.RPM_PLATFORM.blockDue);
let calendarCopy=[];
window.RPM_PLATFORM.agenda=day=>dayAgenda(data,{day:day??undefined,events:calendarCopy});
window.RPM_PLATFORM.next=()=>nextItem(data,{events:calendarCopy});
window.RPM_PLATFORM.task=id=>{const e=data.entries.find(x=>String(x.id)===String(id)&&!x.archived);return e&&{...e,block:(data.planner?.blocks??[]).find(b=>b.id===e.blockId)?.title??null};};
window.RPM_PLATFORM.health=()=>bodyToday(data);
window.rpmPhoneRefresh=coalesceRefresh(async()=>{await ready;if(!busy){const latest=await native('load');phone=latest.phone;if(latest.data&&latest.data.version!==data.version){data=latest.data;window.dispatchEvent(new Event('rpm-data-refresh'));}}window.dispatchEvent(new Event('rpm-phone-status'));});
await ready;
applyClarityPreferences();
const syncTextScale=()=>{document.documentElement.dataset.reduceMotion=String(!!phone.reducedMotion);const scale=phone.effectiveFontScale??phone.fontScale??1;document.documentElement.dataset.largeText=String(scale>=1.5);document.documentElement.style.setProperty("--text-scale",String(scale));};
syncTextScale();window.addEventListener('rpm-phone-status',syncTextScale);
if(isPlanner){
  // Native paints the window edges and system-bar icons; keep them on the planner's effective theme.
  const systemDark=matchMedia('(prefers-color-scheme: dark)'),syncSurface=()=>{const pinned=document.documentElement.dataset.appearance;native('surface',{dark:pinned?pinned==='dark':systemDark.matches}).catch(()=>{});};
  syncSurface();new MutationObserver(syncSurface).observe(document.documentElement,{attributes:true,attributeFilter:['data-appearance']});systemDark.addEventListener?.('change',syncSurface);
  const {mountPlanner}=await import('./planner.mjs');
  const withSort=async run=>{if(busy)throw new Error('Wait for the current save.');busy=true;try{return await run();}finally{busy=false;}};
  const sortPreview={create:(input,options)=>withSort(()=>intentService.sort.create(input,options)),accept:(id,options)=>withSort(()=>intentService.sort.accept(id,options)),dismiss:(id,options)=>withSort(()=>intentService.sort.dismiss(id,options)),get:id=>intentService.sort.get(id),list:options=>intentService.sort.list(options)};
  const ui=mountPlanner({getData:()=>data,getPhone:()=>phone,native,sortPreview,commit:async op=>{if(busy)throw new Error('Wait for the current save.');busy=true;try{return await retryOnChange(async()=>{const before=data;try{data=structuredClone(before);const id=editPlan(data,op);await save();if(/Task$/.test(op?.type??'')&&op.id!=null)traces.handEdit(op.id,{what:op.type});return id;}catch(e){data=before;throw e;}},async()=>{const latest=await native('load');phone=latest.phone;if(latest.data)data=latest.data;});}finally{busy=false;}}});
  if(location.hash==='#ideas')ui.goalIdeas();
  else if(location.hash.startsWith('#open='))try{ui.openView(JSON.parse(decodeURIComponent(location.hash.slice(6))));}catch{}
}else {
  // Capture: the unsent draft is written through Android's ordered private
  // store; WebView localStorage is only a compatibility mirror.
  let kept=await native('captureDraft');
  // Words already in the capture journal were sent; an older build left them in the box after sending.
  if(kept.present&&kept.text&&Object.values(data.intentV2?.captures??{}).some(c=>c.raw===kept.text))kept=await native('captureDraft',{text:''});
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
  const readCalendar=()=>native('calendarRead',{anchor:Date.now()}).then(value=>{calendar=value?.status==='ready'?calendarRows(value):null;calendarCopy=calendar??[];window.dispatchEvent(new Event('rpm-calendar-ready'));},()=>{});
  readCalendar();window.addEventListener('rpm-phone-status',readCalendar);
  window.RPM_PLATFORM.dayLoad=options=>dayLoad(data,{...options,events:calendar??[],deadline:id=>blockDue(data,id)});
  const {mountCapture}=await import('./capture-app.mjs');
  mountCapture(window.RPM_PLATFORM);
}
