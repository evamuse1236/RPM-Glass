// Review-only adapters: no native bridge, network, notification access or timers.
const minutes=value=>{if(!/^\d{2}:\d{2}$/.test(value))throw new Error('Choose a valid time.');const [h,m]=value.split(':').map(Number);if(h>23||m>59)throw new Error('Choose a valid time.');return h*60+m;};
export function inFocusHours(time,start,end){const t=minutes(time),a=minutes(start),b=minutes(end);if(a===b)return false;return a<b?t>=a&&t<b:t>=a||t<b;}
export function focusDecision({time,start,end,packageName='',url='',urgent=false}){
  const active=inFocusHours(time,start,end);let host='';try{host=new URL(url).hostname.toLowerCase();}catch{}
  const twitter=packageName==='com.twitter.android'||['x.com','twitter.com'].some(domain=>host===domain||host.endsWith('.'+domain));
  return {active,notification:active&&!urgent?'batch':'show',app:active&&twitter?'block':'allow',mock:true};
}
export function createFocusPreview(){const queued=new Map();return {
  receive(notification,schedule){const decision=focusDecision(schedule);if(decision.notification==='batch')queued.set(notification.id,{...notification});return {...decision,queued:queued.size};},
  release(){const digest=[...queued.values()];queued.clear();return digest;},
  count:()=>queued.size
};}
export function createMockUpdateAdapters(){const calls=[];return {calls,hermes:{async prepare(input){calls.push({service:'hermes',...input});return {status:'prepared',artifact:'mock://rpm/'+input.releaseId+'.apk'};}},whatsapp:{async send(input){calls.push({service:'whatsapp',...input});return {status:'simulated',requestId:input.requestId};}}};}
export function createUpdatePreview({threshold,hermes,whatsapp}){
  if(!Number.isInteger(threshold)||threshold<1)throw new Error('Choose at least one verified feature.');
  const features=new Map(),finished=new Map();let running=false;
  return {add(feature){if(!feature?.id||feature.verified!==true)throw new Error('Only verified features count toward an update.');features.set(feature.id,{...feature});return features.size;},
    async run({releaseId,recipient}){if(!releaseId||!recipient)throw new Error('Choose a release and recipient for the preview.');if(finished.has(releaseId))return finished.get(releaseId);if(running)throw new Error('An update preview is already running.');if(features.size<threshold)return {status:'waiting',count:features.size,threshold,mock:true};running=true;
      try{const batch=[...features.values()];const prepared=await hermes.prepare({releaseId,features:batch,mock:true});if(prepared.status!=='prepared'||!prepared.artifact?.startsWith('mock://'))throw new Error('Preview requires a mock artifact.');const sent=await whatsapp.send({recipient,artifact:prepared.artifact,requestId:'rpm-update:'+releaseId,mock:true});if(sent.status!=='simulated')throw new Error('Preview delivery was not confirmed.');const result={status:'simulated',featureCount:batch.length,requestId:sent.requestId,mock:true};finished.set(releaseId,result);batch.forEach(f=>features.delete(f.id));return result;}finally{running=false;}}
  };
}
