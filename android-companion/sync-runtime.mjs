import {syncReplica} from './replica-sync.mjs';
if(!Array.prototype.toReversed)Object.defineProperty(Array.prototype,'toReversed',{value:function(){return this.slice().reverse();}});
if(!Array.prototype.findLast)Object.defineProperty(Array.prototype,'findLast',{value:function(fn){for(let i=this.length-1;i>=0;i--)if(fn(this[i],i,this))return this[i];}});
if(!AbortSignal.timeout)AbortSignal.timeout=ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;};
const waiting=new Map(),session=crypto.randomUUID();let serial=0;
window.rpmBridgeResult=(id,value,error)=>{const pending=waiting.get(id);if(!pending)return;waiting.delete(id);clearTimeout(pending.timer);error?pending.reject(new Error(error)):pending.resolve(value);};
function native(action,payload={}){
  const id=session+':'+(++serial);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Phone sync timed out. Saved words remain available.'));},15000);
    waiting.set(id,{resolve,reject,timer});window.RpmSync.invoke(id,action,JSON.stringify(payload));
  });
}
window.rpmReplicaRun=async()=>{
  try{
    const store=await syncReplica({
      load:async()=>(await native('load')).data,
      save:(expected,data,options)=>native('save',{expected,data,...options}),
      push:body=>native('push',body),pull:body=>native('pull',body),now:()=>new Date(),
    });
    window.RpmSync.complete(JSON.stringify({cursor:store.sync.cursor}));
  }catch{window.RpmSync.failed();}
};
await window.rpmReplicaRun();
