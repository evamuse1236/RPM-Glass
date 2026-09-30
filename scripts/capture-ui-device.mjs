// Native Capture verification on the disposable response-design emulator only.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function openCaptureProbe({serial='emulator-5558',out='output/capture-response-2026-09-28/screens'}={}){
 const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{maxBuffer:16*1024*1024,timeout:30000});
 assert.match(adb('emu','avd','name').toString(),/^RPM_CAPTURE_RESPONSE\r?\n/,'Use the disposable Capture QA AVD');
 fs.mkdirSync(out,{recursive:true});adb('shell','am','force-stop','com.rpm.prototype');adb('shell','am','start','-n','com.rpm.prototype/.CompanionActivity');
 let pid;
 for(let i=0;i<50;i++){
  try{pid=adb('shell','pidof','com.rpm.prototype').toString().trim();if(adb('shell','cat','/proc/net/unix').toString().includes('webview_devtools_remote_'+pid))break;}catch{}
  await pause(200);
 }
 assert.ok(pid,'Capture process must be running');
 const port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid).toString().trim();
 let page;
 for(let i=0;i<50;i++){
  try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=pages.find(p=>p.url.includes('/index.html')&&JSON.parse(p.description||'{}').visible);if(page)break;}catch{}
  await pause(200);
 }
 assert.ok(page,'Native Capture WebView must be visible');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id)pending.get(r.id)?.resolve(r);};
 ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Capture page closed'));};
 const call=(method,params={})=>new Promise((resolve,reject)=>{
  const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('Capture probe timed out: '+method));},15000);
  pending.set(key,{resolve:r=>{clearTimeout(timer);pending.delete(key);r.error?reject(Error(JSON.stringify(r.error))):resolve(r);},reject:e=>{clearTimeout(timer);pending.delete(key);reject(e);}});
  ws.send(JSON.stringify({id:key,method,params}));
 });
 const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value;};
 for(let i=0;i<60&&!await ev("!!window.RPM_PLATFORM?.saveComposerDraft && !!document.querySelector('.capture-stage')");i++)await pause(250);
 assert.ok(await ev("!!window.RPM_PLATFORM?.saveComposerDraft && !!document.querySelector('.capture-stage')"),'Capture runtime must be ready');
 const state=()=>ev("fetch('/api/state').then(r=>r.json())");
 const hideKeyboard=async()=>{await ev('document.activeElement?.blur()');if(adb('shell','dumpsys','input_method').toString().includes('mInputShown=true'))adb('shell','input','keyevent','111');await pause(450);};
 const load=async fixture=>{
  await ev(`(async()=>{localStorage.setItem('rpm-conversation',${JSON.stringify(fixture.conversationId)});document.getElementById('message').value='';localStorage.setItem('rpm-native-draft','');document.getElementById('message').dispatchEvent(new Event('input',{bubbles:true}));const current=await RPM_PLATFORM.action('load'),data=${JSON.stringify(fixture.data)};data.version=current.data.version+1;await RPM_PLATFORM.action('save',{expected:current.data.version,data});await rpmPhoneRefresh();document.getElementById('home').click();})()`);
  await pause(450);
 };
 const screenshot=async name=>{await pause(250);fs.writeFileSync(`${out}/${name}.png`,adb('exec-out','screencap','-p'));};
 const touch=async selector=>{
  const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,reachable:e.contains(document.elementFromPoint(x,y))};})()`);
  assert.ok(p.reachable,selector+' must be touch reachable');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(400);
 };
 return {adb,ev,call,state,load,hideKeyboard,screenshot,touch,async close(){ws.close();try{adb('forward','--remove','tcp:'+port);}catch{}}};
}
