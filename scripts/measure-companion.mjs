// Emulator-only, read-only timings. Reports no conversation, entry, or credential content.
import fs from 'node:fs';
const [page]=await(await fetch('http://127.0.0.1:9229/json/list')).json();
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let id=0;const pending=new Map();socket.onmessage=event=>{const reply=JSON.parse(event.data);if(reply.id){pending.get(reply.id)?.(reply);pending.delete(reply.id);}};
function call(method,params){return new Promise(resolve=>{const key=++id;pending.set(key,resolve);socket.send(JSON.stringify({id:key,method,params}));});}
const result=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const original=window.rpmBridgeResult;let replies=0;
  window.rpmBridgeResult=(...args)=>{replies++;return original(...args);};
  const start=performance.now();await window.rpmPhoneRefresh();await new Promise(r=>setTimeout(r,250));
  const refreshReplies=replies;const samples=[];
  for(let i=0;i<8;i++){const t=performance.now();await window.RPM_PLATFORM.action('status');samples.push(performance.now()-t);}
  window.rpmBridgeResult=original;
  const css=getComputedStyle(document.getElementById('content'));
  return {refreshReplies,statusRoundtripMs:samples.map(n=>Math.round(n*10)/10),replyTransition:{duration:css.transitionDuration,delay:css.transitionDelay,property:css.transitionProperty},viewport:{width:innerWidth,height:innerHeight},readyState:document.readyState};
})()`});
socket.close();if(result.result?.exceptionDetails)throw new Error(JSON.stringify(result.result.exceptionDetails));
const report=JSON.stringify(result.result.result.value,null,2)+'\n';
if(process.argv[2])fs.writeFileSync(process.argv[2],report);console.log(report);
