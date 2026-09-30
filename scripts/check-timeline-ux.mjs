// Native Android WebView integration and layout checks. Requires an owned emulator
// with the synthetic planner-ux-fixture, never run against a personal phone.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const serial=process.env.RPM_QA_DEVICE??'emulator-5554';
if(!serial.startsWith('emulator-'))throw new Error('Synthetic QA is emulator-only');
const output='output/ux-2026-09-26/screens';fs.mkdirSync(output,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let pages;for(let i=0;i<30;i++){try{pages=await(await fetch('http://127.0.0.1:9229/json/list')).json();if(pages.length)break;}catch{}await pause(200);}
const page=pages.find(p=>p.url.includes('/planner.html')&&JSON.parse(p.description||'{}').visible);
if(!page)throw new Error('Open the planner first');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){pending.get(x.id)(x);pending.delete(x.id);}};
const cdp=(method,params={})=>new Promise(r=>{const id=++next;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value;};
const click=async selector=>{assert.ok(await ev(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await ev(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(300);};
const saved=()=>ev('RPM_PLATFORM.action("load").then(x=>x.data)');
const body=()=>ev('document.body.innerText');
const snap=async name=>{await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await pause(250);fs.writeFileSync(`${output}/${name}.png`,execFileSync('adb',['-s',serial,'exec-out','screencap','-p']));};
const nav=label=>click(`#planner-tabs [aria-label="${label}"]`);
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};
const reports=[];
try{
 await ev(fs.readFileSync('scripts/planner-ux-fixture.js','utf8'));await pause(300);
 await ev(`(async()=>{const x=await RPM_PLATFORM.action('load'),clockNow=new Date();clockNow.setMinutes(58,0,0);const fixed=clockNow.getTime();window.rpmRealNow=Date.now;Date.now=()=>fixed;for(const [id,minutes,offset] of [[101,15,-3],[102,30,-2],[103,45,40]]){const task=x.data.entries.find(t=>t.id===id);task.minutes=minutes;task.planned=new Date(fixed+offset*60000).toISOString();}await RPM_PLATFORM.action('save',{expected:x.data.version,data:{...x.data,version:x.data.version+1}});await rpmPhoneRefresh();})()`);await pause(300);
 await click('.day-layout-toggle button:nth-child(2)');await ev('{const host=document.querySelector("#planner-scroll"),line=document.querySelector(".now-line");host.scrollTop+=line.getBoundingClientRect().top-host.getBoundingClientRect().top-80}');await snap('timeline-edge-cases-dark');
 check(await ev('[...document.querySelectorAll(".timed h3")].every(n=>n.getBoundingClientRect().height>=parseFloat(getComputedStyle(n).lineHeight)-1)'),'15 and 30 minute overlapping tasks retain title');
 check(await ev('document.querySelector(".now-time").getBoundingClientRect().height<=parseFloat(getComputedStyle(document.querySelector(".now-time")).lineHeight)+1'),'Now label single line');
 check(await ev('(()=>{const now=document.querySelector(".now-time").getBoundingClientRect();return [...document.querySelectorAll(".hour-label")].filter(n=>!n.hidden).every(n=>{const r=n.getBoundingClientRect();return r.bottom<=now.top||r.top>=now.bottom})})()'),'Now label clears hour labels');
 check(await ev('[...document.querySelectorAll(".open-event")].every(n=>n.getBoundingClientRect().height>=48)'),'Short timeline controls retain 48dp');
 check(await ev('Number(getComputedStyle(document.querySelector(".now-line")).zIndex)<Number(getComputedStyle(document.querySelector(".timed")).zIndex)'), 'Now line stays behind task titles');
 console.log(JSON.stringify({checks,scenario:'Synthetic 58 minutes past the hour, overlapping15/30minute tasks'}));
}finally{await ev('if(window.rpmRealNow)Date.now=window.rpmRealNow');await ev(fs.readFileSync('scripts/planner-ux-fixture.js','utf8'));ws.close();}
