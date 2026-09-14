// Development-only UI probe for the owned Android emulator's debuggable WebView.
import fs from 'node:fs';
let pages;
for(let attempt=0;attempt<20;attempt++){try{pages=await(await fetch('http://127.0.0.1:9229/json/list',{signal:AbortSignal.timeout(1000)})).json();if(pages.length)break;}catch(error){if(attempt===19)throw error;}await new Promise(r=>setTimeout(r,250));}
const visible=pages.filter(p=>JSON.parse(p.description||'{}').visible);
const page=visible.find(p=>p.url.includes('/planner.html'))??visible[0];
if(!page)throw new Error('No emulator WebView found.');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let serial=0;const pending=new Map();socket.onmessage=event=>{const r=JSON.parse(event.data);if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('WebView probe timed out: '+method));},55000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});socket.send(JSON.stringify({id,method,params}));});
try{
  if(process.argv[2]==='screenshot'){const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.argv[3],Buffer.from(r.result.data,'base64'));console.log('Saved emulator WebView screenshot.');}
  else if(process.argv[2]==='gesture'){const [x,y,endX,endY]=process.argv.slice(3).map(Number);await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(endX-x)*i/12,y:y+(endY-y)*i/12}]});await new Promise(r=>setTimeout(r,20));}await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});console.log('Emulator touch gesture sent.');}
  else{const expression=process.argv[2]==='file'?fs.readFileSync(process.argv[3],'utf8'):process.argv[2];const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));console.log(JSON.stringify(r.result.result.value??r.result.result.description,null,2));}
}finally{socket.close();}
