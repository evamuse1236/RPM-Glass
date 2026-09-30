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
try {
 for(let i=0;i<50;i++){if(await ev('typeof window.rpmHandleBack==="function"'))break;await pause(100);}
 await ev(fs.readFileSync('scripts/planner-ux-fixture.js','utf8'));await pause(300);await click('.day-layout-toggle button:first-child');
 check((await body()).includes('↳ Explain the chapter clearly'),'Today Result context');
 check(await ev('document.querySelectorAll("#planner-tabs button").length===4'),'Four destinations');
 await click('[data-task-id="101"] .task-check');check((await saved()).entries.find(t=>t.id===101).done,'One-tap completion');
 await click('#notice button');check(!(await saved()).entries.find(t=>t.id===101).done,'Completion Undo');
 await nav('Blocks');await click('.block-card .card-main');
 check((await body()).includes('Why this matters'),'Block detail');
 const before=(await saved()).entries.map(t=>({id:t.id,planned:t.planned}));
 const rects=await ev('[...document.querySelectorAll(".task-list .task-row")].map(r=>{const b=r.querySelector(".drag-handle").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,id:Number(r.dataset.taskId)}})');
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rects[0].x,y:rects[0].y}]});
 for(let i=1;i<=12;i++){await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rects[0].x,y:rects[0].y+(rects[2].y-rects[0].y)*i/12}]});await pause(20);}
 await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(300);
 let d=await saved();check(d.entries.find(t=>t.id===101).priority===3,'Touch drag persists order');assert.deepEqual(d.entries.map(t=>({id:t.id,planned:t.planned})),before);checks++;
 await click('#notice button');
 await ev('document.querySelector(".inline-add input").value="Synthetic inline task";document.querySelector(".inline-add").requestSubmit()');await pause(350);
 check((await saved()).entries.some(t=>t.title==='Synthetic inline task'&&t.blockId==='qa-block-a'),'Inline task persisted');await click('#notice button');
 await ev('rpmHandleBack()');await pause(200);await nav('Today');await click('#planner-actions .fab');
 check(await ev('document.activeElement===document.querySelector(".quick-title input")'),'Quick add focuses title');
 await snap('quick-add-keyboard');
 await ev('const n=document.querySelector(".quick-title input");n.value="Synthetic quick task";n.dispatchEvent(new Event("input",{bubbles:true}))');await click('#editor .primary');
 check((await saved()).entries.some(t=>t.title==='Synthetic quick task'),'Quick add save');check(await ev('!document.querySelector("#editor").hidden&&!document.querySelector(".quick-title input").value'),'Quick add stays open and clears title');
 await ev('rpmHandleBack()');await pause(100);execFileSync('adb',['-s',serial,'shell','input','keyevent','111']);await pause(250);
 await click('#notice button');
 // Task detail save, original capture disclosure and explicit completion.
 await click('[data-task-id="102"] .task-title');check((await body()).includes('Mark complete'),'Task completion action');check((await body()).includes('Part of'),'Task Result/Purpose context');await snap('task-detail-dark');await ev('rpmHandleBack()');
 for(const scale of [1,2]){
   execFileSync('adb',['-s',serial,'shell','settings','put','system','font_scale',String(scale)]);await pause(600);
   for(const theme of ['dark','light']){
     await ev(`document.documentElement.dataset.appearance=${JSON.stringify(theme)};localStorage.setItem('rpm-clarity:appearance',${JSON.stringify(theme)})`);
     for(const label of ['Today','Blocks','Projects','Life']){
       await nav(label);await ev('document.querySelector("#planner-scroll").scrollTop=0');await snap(`${label.toLowerCase()}-${theme}-${scale}x`);
       const geometry=await ev(`({width:innerWidth,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('button,summary,input,textarea,select')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>({label:n.getAttribute('aria-label')||n.textContent.slice(0,50),w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})).filter(r=>r.w<47.5||r.h<47.5)})`);
       reports.push({screen:label,theme,scale,...geometry});check(geometry.scroll<=geometry.width+1,`${label} horizontal overflow at ${scale}x`);
       await ev('document.querySelector("#planner-scroll").scrollTop=99999');await pause(150);
       if(label==='Today')check(await ev('document.querySelector(".day-list > .link").getBoundingClientRect().bottom < document.querySelector("#planner-actions").getBoundingClientRect().top'),'Last row clears floating action');
     }
     await nav('Today');await click('[aria-label="Settings"]');await snap(`settings-${theme}-${scale}x`);check(!(await body()).includes('Solid navigation'),'No transparency workaround');await ev('rpmHandleBack()');
   }
 }
 execFileSync('adb',['-s',serial,'shell','settings','put','system','font_scale','1']);await pause(500);
 await ev('document.documentElement.dataset.appearance="dark";localStorage.setItem("rpm-clarity:appearance","dark")');
 await nav('Life');await click('.area-row');await snap('area-detail-dark');await ev('rpmHandleBack()');await click('.wheel-panel');check((await body()).includes('Save ratings'),'Rate Areas sheet');await ev('const slider=document.querySelector(".rating-field input");slider.value=6.5;slider.dispatchEvent(new Event("input",{bubbles:true}))');await click('#editor .primary');check((await saved()).planner.areas[0].rating===6.5,'Half-step rating saved');await click('#notice button');
 await nav('Projects');await click('.project-card');await snap('project-detail-dark');await ev('rpmHandleBack()');
 await nav('Blocks');await click('.block-card .card-main');await snap('block-detail-dark');await ev('rpmHandleBack()');
 await nav('Today');await click('.day-layout-toggle button:nth-child(2)');await ev('document.querySelector("#planner-scroll").scrollTop=0');await snap('timeline-top-dark');await ev('{const host=document.querySelector("#planner-scroll"),line=document.querySelector(".now-line");host.scrollTop+=line.getBoundingClientRect().top-host.getBoundingClientRect().top-80}');await snap('timeline-dark');await click('.day-layout-toggle button:first-child');
 fs.writeFileSync('output/ux-2026-09-26/layout-checks.json',JSON.stringify(reports,null,2));
 console.log(JSON.stringify({checks,layoutReports:reports.length,smallTargets:reports.filter(r=>r.small.length)},null,2));
}finally{ws.close();}
