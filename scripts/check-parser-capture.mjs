// Synthetic, deterministic parser integration in an owned Android WebView.
// Back up emulator private data first; this replaces its test store. No AI calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {planner,editPlan} from '../android-companion/planner-state.mjs';
import {changePlanner} from '../android-companion/planner-tools.mjs';
import {createIntentService} from '../android-companion/intent-service.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
const serial=process.env.RPM_QA_DEVICE??'emulator-5554';if(!serial.startsWith('emulator-'))throw new Error('Emulator only');
const output=process.env.RPM_QA_OUTPUT??'output/parser-2026-09-27';fs.mkdirSync(output,{recursive:true});
const pages=await(await fetch(`http://127.0.0.1:${process.env.RPM_QA_CDP_PORT??9229}/json/list`)).json(),page=pages.find(p=>p.url.includes('/index.html')&&JSON.parse(p.description||'{}').visible);assert.ok(page,'Open native Capture');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){pending.get(x.id)(x);pending.delete(x.id);}};
const call=(method,params={})=>new Promise(r=>{const id=++next;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};
const state=()=>ev("fetch('/api/state').then(r=>r.json())");
const buttons=()=>ev("[...document.querySelectorAll('.intent-actions button')].map(b=>b.textContent)");
const snapshot=async name=>{await pause(250);fs.writeFileSync(`${output}/${name}.png`,execFileSync('adb',['-s',serial,'exec-out','screencap','-p']));};
const action=async extra=>{const s=await state(),d=s.intent.captures[0].draft;const payload={type:'intentAction',version:s.version,conversationId:d.conversationId,actionId:`qa-${Date.now()}`,action:{conversationId:d.conversationId,draftId:d.id,revision:d.revision,...extra}};const result=await ev(`fetch('/api/turn',{body:JSON.stringify(${JSON.stringify(payload)})}).then(r=>r.json())`);assert.ok(!result.error,result.error);await ev("window.dispatchEvent(new Event('rpm-phone-status'))");await pause(100);return result;};
try{
 for(const scale of [1,2]){
  execFileSync('adb',['-s',serial,'shell','settings','put','system','font_scale',String(scale)]);await pause(500);
  const seed=freshStore();planner(seed).uxVersion=1;const raw='Finish one WID assessment tomorrow from 2 to 3',backend=createMemoryBackend(seed),service=createIntentService({backend,model:async()=>turn(raw,[operation([field('title','Finish one WID assessment','Finish one WID assessment'),field('time','tomorrow from 2 to 3','tomorrow from 2 to 3')])]),changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan});
  await service.capture({messageId:'range-qa',conversationId:seed.conversations[0].id,text:raw});
  await ev(`(async()=>{const current=await RPM_PLATFORM.action('load'),data=${JSON.stringify(await backend.load())};data.version=current.data.version+1;await RPM_PLATFORM.action('save',{expected:current.data.version,data});await rpmPhoneRefresh();})()`);await pause(300);
  check(!(await buttons()).includes('Add'),'unresolved preview has no Add');check((await state()).entries.length===0,'draft is not a task');
  await ev("document.querySelector('.intent-schedule').scrollIntoView({block:'center'})");await snapshot(`review-${scale}x`);
  await action({kind:'set-field',opId:'task1',field:'time',value:'tomorrow from two to three pm'});
  let s=await state(),preview=s.intent.captures[0].draft.schedulePreview.items[0];check(preview.minutes===60,'native parser derives duration');check(preview.status==='parsed','native parser accepts spoken range');check((await buttons()).includes('Add'),'corrected preview enables Add');
  check(await ev("document.documentElement.scrollWidth<=innerWidth+1"),'no horizontal overflow');
  await ev("document.querySelector('.intent-schedule').scrollIntoView({block:'center'})");await snapshot(`range-${scale}x`);
  check(await ev("[...document.querySelectorAll('.intent-actions button')].every(b=>b.getBoundingClientRect().height>=48)"),'48dp action targets');
  await ev("document.querySelector('.intent-actions').scrollIntoView({block:'center'})");await pause(150);await snapshot(`actions-${scale}x`);
  const point=await ev("(()=>{const b=[...document.querySelectorAll('.intent-actions button')].find(b=>b.textContent==='Add'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b}})()");check(point.hit,'Add is reachable at enlarged text');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  for(let i=0;i<30;i++){s=await state();if(s.entries.length)break;await pause(100);}
  check(s.entries.length===1&&s.entries[0].minutes===60,'native Add persists sixty minutes');check(s.entries[0].planned===preview.planned,'saved time equals preview');check(s.entries[0].raw===raw,'raw words unchanged');
  for(let i=0;i<30;i++){if(await ev("[...document.querySelectorAll('button')].some(b=>b.textContent==='Undo this save')"))break;await pause(100);}
  check(await ev("[...document.querySelectorAll('button')].some(b=>b.textContent==='Undo this save')"),'Undo rendered');
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Undo this save').click()");
  for(let i=0;i<30;i++){s=await state();if(!s.entries.length)break;await pause(100);}
  check(s.entries.length===0,'native Undo restores entries');check(s.intent.captures[0].raw===raw,'Undo retains capture');
 }
 fs.writeFileSync(`${output}/native-checks.json`,JSON.stringify({checks,scales:[1,2],fixture:'synthetic extraction; native parser, save and Undo',liveModel:false},null,2));console.log(JSON.stringify({checks}));
}finally{execFileSync('adb',['-s',serial,'shell','settings','put','system','font_scale','1.0']);ws.close();}
