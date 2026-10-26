import {syncReplica} from './replica-sync.mjs';
import {createWebSyncProcessor} from './web-sync-commands.mjs';
import {createIntentService} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {planSnapshot} from './capture-snapshot.mjs';
import {calendarRows} from './planner-calendar.mjs';

if(!Array.prototype.toReversed)Object.defineProperty(Array.prototype,'toReversed',{value:function(){return this.slice().reverse();}});
if(!Array.prototype.findLast)Object.defineProperty(Array.prototype,'findLast',{value:function(fn){for(let i=this.length-1;i>=0;i--)if(fn(this[i],i,this))return this[i];}});
if(!AbortSignal.timeout)AbortSignal.timeout=ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;};
const waiting=new Map(),session=crypto.randomUUID();let serial=0;
window.rpmBridgeResult=(id,value,error)=>{const pending=waiting.get(id);if(!pending)return;waiting.delete(id);clearTimeout(pending.timer);error?pending.reject(new Error(error)):pending.resolve(value);};
function native(action,payload={}){
  const id=session+':'+(++serial);
  if(['model','decision'].includes(action))payload={requestId:id,...payload};
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Phone sync timed out. Saved words remain available.'));},['model','decision'].includes(action)?110000:15000);
    waiting.set(id,{resolve,reject,timer});window.RpmSync.invoke(id,action,JSON.stringify(payload));
  });
}
const backend={load:async()=>(await native('load')).data,save:async(expected,data)=>native('save',{expected,data})};
const service=createIntentService({backend,native,changePlanner,undo,editPlan,readCalendar:anchor=>native('calendarRead',{anchor}),snapshot:async({data})=>{
  const calendar=await native('calendarRead',{anchor:Date.now()});
  return planSnapshot(data,{now:new Date(),events:calendar?.status==='ready'?calendarRows(calendar):[]});
}});
const capture=createCaptureAgent({service,traces:createTraceStore({emit:()=>{}})});
const processor=createWebSyncProcessor({backend,capture});
window.rpmSyncRun=async()=>{
  try{
    const {commands,snapshots,revokedCommandIds}=await native('input'),acks=[];
    for(const command of commands)acks.push(await processor.process(command,{snapshots,revoked:revokedCommandIds.includes(command.id)}));
    const current=await backend.load();
    window.RpmSync.complete(JSON.stringify({snapshot:current?await processor.snapshot():null,acks}));
  }catch{window.RpmSync.failed();}
};
window.rpmReplicaRun=async()=>{
  try{
    const store=await syncReplica({
      load:backend.load,
      save:(expected,data,options)=>native('save',{expected,data,...options}),
      push:body=>native('push',body),pull:body=>native('pull',body),now:()=>new Date(),
    });
    window.RpmSync.complete(JSON.stringify({cursor:store.sync.cursor}));
  }catch{window.RpmSync.failed();}
};
await window.rpmSyncRun();
