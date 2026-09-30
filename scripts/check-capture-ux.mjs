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
const page=pages.find(p=>p.url.includes('/index.html')&&JSON.parse(p.description||'{}').visible);
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
try {
 for(const scale of [1,2]){execFileSync('adb',['-s',serial,'shell','settings','put','system','font_scale',String(scale)]);await pause(650);
 for(const theme of ['dark','light']){await ev(`document.documentElement.dataset.appearance=${JSON.stringify(theme)};localStorage.setItem('rpm-clarity:appearance',${JSON.stringify(theme)})`);await snap(`capture-${theme}-${scale}x`);check(await ev('document.documentElement.scrollWidth<=innerWidth+1'),'Capture has no horizontal overflow');await click('#menu-toggle');await snap(`capture-menu-${theme}-${scale}x`);check((await body()).includes('Open planner'),'Capture has planner route');await click('#menu-dismiss');}
 }
 execFileSync('adb',['-s',serial,'shell','settings','put','system','font_scale','1']);await pause(500);await click('#close');console.log(JSON.stringify({checks}));
}finally{ws.close();}
