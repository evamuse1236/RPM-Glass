import {installWidgetMenu} from './widget-menu.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {entryView,propose,undo} from '../chat-prototype/companion-tools.mjs';
import {createCompanionAgent,MODEL} from '../chat-prototype/companion-agent.mjs';
import {editPlan} from './planner-state.mjs';
import {phoneProposal,checkSchedule,scheduleSchema,repeatSuggestion} from './planner-chat.mjs';
import {createPlannerTools,plannerSummary,plannerInstruction,planningFocus} from './planner-tools.mjs';
import {createAppTools} from './app-tools.mjs';
import {executeCaptureAction,goalDraftAction} from './capture-actions.mjs';

// Android's WebView is updateable independently of the OS; support older engines.
if(!Array.prototype.toReversed)Object.defineProperty(Array.prototype,'toReversed',{value:function(){return this.slice().reverse();}});
if(!Array.prototype.findLast)Object.defineProperty(Array.prototype,'findLast',{value:function(fn){for(let i=this.length-1;i>=0;i--)if(fn(this[i],i,this))return this[i];}});
if(!AbortSignal.timeout)AbortSignal.timeout=ms=>{const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;};

// The bridge only talks to bundled app content. Secrets never enter this runtime.
const waiting=new Map(),session=crypto.randomUUID();let serial=0,data,busy=false,phone={};
window.rpmBridgeResult=(id,result,error)=>{const p=waiting.get(id);if(!p)return;waiting.delete(id);clearTimeout(p.timer);error?p.reject(new Error(error)):p.resolve(result);};
export function native(action,payload={}){return new Promise((resolve,reject)=>{const id=session+':'+(++serial);const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('The phone did not respond. Your last saved data is intact.'));},action==='model'?23000:10000);waiting.set(id,{resolve,reject,timer});window.RpmNative.invoke(id,action,JSON.stringify(payload));});}
const ready=(async()=>{const saved=await native('load');phone=saved.phone;data=saved.data??freshStore();if(!saved.data)await save();if(data.inFlight){const cid=data.inFlight.conversationId;data.inFlight=null;const c=cid?data.conversations.find(x=>x.id===cid):data.conversations.find(x=>x.messages.at(-1)?.role==='user');if(c)c.messages.push({id:crypto.randomUUID(),role:'assistant',at:new Date().toISOString(),text:'The previous request was interrupted. Your message is saved; no unfinished changes were applied. You can retry.',error:'interrupted'});await save();}})();
async function save(){const expected=data.version;const next={...data,version:expected+1};const result=await native('save',{expected,data:next});data=next;phone=result;}
const view=()=>({version:data.version,csrf:'native-local',busy,aiEnabled:phone.hasKey,model:MODEL,entries:data.entries.map(entryView),memories:data.memories,history:data.history,conversations:data.conversations,pending:data.pending,undoId:data.undo?.id??null,imported:data.imported,phone});
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
    }else if(b.type==='message'){
      if(c.archived||typeof b.text!=='string'||!b.text.trim()||b.text.length>12000)throw new Error('Write a message in an active conversation.');
      busy=true;const raw=b.text.trim();c.messages.push({role:'user',text:raw,id:crypto.randomUUID(),at:at()});if(c.messages.length===1)c.title=raw.slice(0,60);data.inFlight={conversationId:cid};await save();
      const draft=structuredClone(data);
      const readCalendar=anchor=>native('calendarRead',{anchor});
      const agent=createCompanionAgent({apiKey:phone.hasKey?'native-bridge':null,platform:'android',appTools:[...createPlannerTools({readCalendar}),...createAppTools({native})],appContext:d=>plannerSummary(d,captureFocus()),appInstruction:plannerInstruction,proposeImpl:(d,args,meta)=>phoneProposal(d,args,meta,readCalendar),scheduleCheck:(d,args)=>checkSchedule(d,args,readCalendar),scheduleSchema,fetchImpl:async(_,o)=>{const r=await native('model',{body:JSON.parse(o.body)});return response(r.body,r.status);}});
      const result=await agent(draft,raw,{conversationId:cid,phoneStatus:phone});draft.inFlight=null;draft.conversations.find(x=>x.id===cid).messages.push({role:'assistant',id:crypto.randomUUID(),at:at(),...result});draft.history.push({id:crypto.randomUUID(),at:at(),raw,response:result.text,source:'conversation',conversationId:cid,entryIds:result.entryIds??[],archived:false});
      if(!draft.pending&&!result.error){const suggestion=repeatSuggestion(draft);if(suggestion)draft.conversations.find(x=>x.id===cid).messages.at(-1).suggestions=[suggestion,...(result.suggestions??[]).slice(0,3)];}
      const journal=data;data=draft;try{await save();}catch(e){data=journal;throw e;}busy=false;
      // Navigation only after the receipt is durable and the chat has rendered.
      // It is never replayed on load, so returning from a picker cannot loop.
      if(result.appEffect)setTimeout(()=>native(result.appEffect.action,result.appEffect.payload).catch(error=>{const content=document.getElementById('content'),problem=document.createElement('p');problem.className='error';problem.setAttribute('role','alert');problem.textContent='Could not open that control: '+error.message;content?.prepend(problem);}),200);
      return response(view());
    }else throw new Error('Unknown action.');
    if(data.planner&&['archive','restore','undo'].includes(b.type))data.planner.undo=null;
    await save();return response(view());
  }catch(e){if(!busy)data=before;busy=false;return response({error:e.message,state:view()},500);}
};
const isPlanner=location.pathname==='/planner.html';
const widgetMenu=isPlanner?{onRender(){}}:installWidgetMenu();
window.RPM_PLATFORM={native:true,menuSend:true,compactReply:true,onRender:widgetMenu.onRender,action:native,delivery:id=>phone.delivery?.[String(id)],plansDescription:'Saved on this phone. Alert status below comes from Android.',about:['Your recent chat, relevant entries and explicit preferences go to OpenRouter when you send a message. Older unarchived history is available through tools. The model is '+MODEL+'.','Chat, plans and context are stored privately on this phone. The AI key is encrypted with Android Keystore, not included in this APK. No desktop server or CLI connection is needed.','RPM reminders use Android notifications. Ringing alarms use Android AlarmManager and alarm audio, at the planned time. They are not entries in Samsung Clock or Google Calendar. Phone permissions and notification settings must allow delivery.','Imported context is a copy. Imported alerts start disarmed, so old plans cannot unexpectedly ring. Review an entry and tap Enable on phone. Archive or Undo updates the phone schedule too.','You can hide the floating butterfly from its notification. No microphone or automatic wallpaper change. The older RPM screens remain separate in Settings.']};
// Refresh delivery outcomes/permissions without losing the current draft.
window.RPM_PLATFORM.openPlans=()=>native('planner');
window.RPM_PLATFORM.goalIdeas=()=>native('planner',{view:'ideas'});
window.RPM_PLATFORM.planningFocus=()=>planningFocus(data,captureFocus());
window.RPM_PLATFORM.clearPlanningFocus=()=>localStorage.removeItem('rpm-capture-context');
window.RPM_PLATFORM.captureAction=action=>executeCaptureAction(data,action,native);
window.RPM_PLATFORM.suggestionAction=(suggestion,sourceRaw,at)=>goalDraftAction(suggestion,sourceRaw,at?new Date(at):new Date());
window.rpmPhoneRefresh=async()=>{await ready;if(!busy){const latest=await native('load');phone=latest.phone;if(latest.data&&latest.data.version!==data.version){data=latest.data;window.dispatchEvent(new Event('rpm-data-refresh'));}}window.dispatchEvent(new Event('rpm-phone-status'));};
await ready;
if(isPlanner){
  const {mountPlanner}=await import('./planner.mjs');
  const ui=mountPlanner({getData:()=>data,getPhone:()=>phone,native,commit:async op=>{if(busy)throw new Error('Wait for the current save.');busy=true;const before=data;try{data=structuredClone(before);const id=editPlan(data,op);await save();return id;}catch(e){data=before;throw e;}finally{busy=false;}}});
  if(location.hash==='#ideas')ui.goalIdeas();
  else if(location.hash.startsWith('#open='))try{ui.openView(JSON.parse(decodeURIComponent(location.hash.slice(6))));}catch{}
}else await import('../chat-prototype/app.js');
