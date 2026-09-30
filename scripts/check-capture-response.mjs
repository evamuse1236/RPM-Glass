// Isolated Android integration and layout checks; no paid model or personal data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {openCaptureProbe,pause} from './capture-ui-device.mjs';
import {captureFixture} from './capture-response-fixtures.mjs';
process.env.TZ='Asia/Kolkata';
const out=process.env.RPM_CAPTURE_OUTPUT??'output/capture-response-2026-09-28',p=await openCaptureProbe({out:out+'/screens'}),checks=[],layouts=[];
const check=(v,label)=>{assert.ok(v,label);checks.push(label);};
const click=async s=>{await p.ev(`document.querySelector(${JSON.stringify(s)}).click()`);await pause(450);};
const theme=async t=>p.ev(`document.documentElement.dataset.appearance=${JSON.stringify(t)};localStorage.setItem('rpm-clarity:appearance',${JSON.stringify(t)})`);
const metric=()=>p.ev(`(()=>{const c=document.getElementById('content'),r=n=>{if(!n)return null;const v=n.getBoundingClientRect();return {top:v.top,bottom:v.bottom,left:v.left,right:v.right,height:v.height,width:v.width}};return {height:innerHeight,panelHeight:document.getElementById('panel').offsetHeight,width:innerWidth,scroll:c.scrollTop,scrollHeight:c.scrollHeight,content:r(c),stage:r(document.querySelector('.capture-stage')),title:r(document.querySelector('.cap-card-title,.formatted-reply')),composer:r(document.getElementById('composer')),actions:r(document.getElementById('capture-actions')),more:!document.getElementById('capture-overflow').hidden,horizontal:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll('#capture-actions button')].map(b=>({text:b.textContent,...r(b),reachable:b.contains(document.elementFromPoint(r(b).left+r(b).width/2,r(b).top+r(b).height/2))}))};})()`);
const layout=async name=>{await pause(500);const m=await metric();layouts.push({name,...m});check(!m.horizontal,name+': no horizontal overflow');check(m.scroll<=1,name+': response starts at top');check(m.content.height>40,name+': response has visible space');check(m.composer.bottom<=m.height+1,name+': composer fits');for(const b of m.buttons)check(b.height>=48&&b.width>=48&&b.reachable,name+': '+b.text+' is a reachable 48dp target');if(m.title)check(m.title.top+Math.min(m.title.height,48)<=m.content.bottom+1&&m.title.top>=m.content.top-1,name+': first title visible');await p.screenshot(name);return m;};
const load=async kind=>{await p.load(await captureFixture(kind,{history:kind!=='empty'}));};
try {
 p.adb('shell','settings','put','system','font_scale','1');await pause(500);await p.hideKeyboard();
 for(const t of process.env.RPM_CAPTURE_SKIP_MATRIX?[]:['dark','light']){
  await theme(t);for(const kind of ['range','saved','date-only','unscheduled','long-title','multi','ambiguous','reflection','long-reply','error','wrong-follow-up']){await load(kind);await layout(`${kind}-${t}`);}
 }
 await theme('dark');await load('wrong-follow-up');check(await p.ev("document.querySelector('.cap-state').innerText==='Check this draft'&&!document.querySelector('#capture-actions .primary')&&document.querySelector('#capture-actions .choice').textContent==='Edit'&&document.querySelector('.cap-needs-answer').textContent.includes('wrong thought')"),'Unrelated-title draft visibly requires Edit and cannot Add');
 await load('range');
 check(await p.ev("!document.getElementById('content').innerText.includes('Earlier')&&document.querySelectorAll('.cap-response').length===1"),'Only current response is in Capture');
 check(await p.ev("document.querySelector('.cap-time').textContent==='2 pm to 3 pm· 1 hr'"),'Same-day clock range is compact');
 check(await p.ev("!document.querySelector('.cap-schedule').innerText.includes('→')&&!document.querySelector('.cap-schedule').innerText.includes(':00')"),'No parser arrows or redundant zero minutes');
 const closedHeight=(await metric()).panelHeight;
 await p.touch('.cap-details summary');check((await metric()).panelHeight>closedHeight,'Details expands native height');
 check(await p.ev("document.querySelector('.cap-original').innerText==='Finish one assessment tomorrow from 2 pm to 3 pm'"),'Original words preserved exactly');
 await p.ev('rpmPhoneRefresh()');await pause(400);check(await p.ev("document.querySelector('.cap-details').open"),'Phone refresh preserves opened Details');
 await p.touch('.cap-details summary');const afterClose=await metric();check(Math.abs(afterClose.panelHeight-closedHeight)<=2,`Closing Details shrinks window (before ${closedHeight}, after ${afterClose.panelHeight})`);
 // Edit focus, failed save, retry, receipt, Undo all use production actions.
 await click('#capture-actions .choice');check(await p.ev("document.getElementById('message').placeholder.includes('change')"),'Edit switches composer context');await p.hideKeyboard();
 await p.ev(`(()=>{window.qaFetch=fetch;window.qaActions=[];window.fetch=async(url,options)=>{if(url==='/api/turn'){qaActions.push(JSON.parse(options.body));return {ok:false,json:async()=>({error:'Synthetic save failure',state:await qaFetch('/api/state').then(r=>r.json())})};}return qaFetch(url,options);};})()`);
 await p.touch('#capture-actions .primary');check(await p.ev("!!document.querySelector('.cap-failure')&&document.querySelector('#capture-actions .primary').textContent==='Retry'"),'Save failure exposes Retry and keeps the draft');
 check((await p.state()).entries.length===0,'Failed save does not create a task');await p.screenshot('failed-save');
 await p.ev(`window.fetch=async(url,options)=>{if(url==='/api/turn')qaActions.push(JSON.parse(options.body));return qaFetch(url,options);}`);
 await p.touch('#capture-actions .primary');
 check(await p.ev('qaActions[0].actionId===qaActions[1].actionId'),'Retry preserves action identity');
 check((await p.state()).entries.length===1,'Retry saves one task');check(await p.ev("document.querySelector('.cap-state').innerText==='Saved to Planner'&&!document.querySelector('#capture-actions .primary')"),'Receipt replaces proposal actions');
 check(await p.ev("document.getElementById('message').placeholder==='Capture a thought…'"),'Save clears stale editing placeholder');await layout('saved-after-retry');
 await p.touch('.cap-undo');check((await p.state()).entries.length===0,'Undo restores original plan');check(await p.ev("document.querySelector('.cap-state').innerText==='Save undone'"),'Undo is reflected in current card');await p.ev('window.fetch=qaFetch');
 await load('ambiguous');check(await p.ev("!document.querySelector('#capture-actions .primary')"),'Ambiguous range cannot be added');await p.touch('#capture-actions .choice:nth-child(2)');check(await p.ev("!!document.querySelector('#capture-actions .primary')&&document.querySelector('.cap-time').textContent.includes('2 pm to 3 pm')"),'Explicit answer resolves ambiguity before Add');
 // Dedicated History, retained classic messages, current view returns cleanly.
 await click('#menu-toggle');await p.touch('#history-view');await click('.conversation-link');check(await p.ev("document.getElementById('panel').dataset.view==='conversation'&&document.querySelectorAll('.message').length>=47"),'History contains earlier captures and Classic messages');await click('#home');check(await p.ev("document.querySelectorAll('.cap-response').length===1"),'Return to Capture shows just current response');
 // Keyboard plus native 200% font scaling; both themes and long response.
 for(const scale of [1,2]){
  p.adb('shell','settings','put','system','font_scale',String(scale));await pause(800);
  for(const t of ['dark','light']){
   await theme(t);await load('multi');await p.hideKeyboard();await layout(`multi-${scale}x-${t}-closed`);
   await p.touch('#message');await p.ev("RPM_PLATFORM.action('keyboard')");await pause(650);
   check(p.adb('shell','dumpsys','input_method').toString().includes('mInputShown=true'),`${scale}x ${t}: native keyboard visible`);const m=await layout(`multi-${scale}x-${t}-keyboard`);
   if(m.scrollHeight>m.content.height+3){check(m.more,`${scale}x ${t}: overflow announced`);await p.touch('#capture-overflow');check((await metric()).scroll>0,`${scale}x ${t}: More below scrolls down`);await p.ev("document.getElementById('content').scrollTop=0");}
   await p.touch('#menu-toggle');check(await p.ev("(()=>{const m=document.getElementById('quick-menu').getBoundingClientRect(),c=document.getElementById('composer').getBoundingClientRect(),b=document.getElementById('plans-view').getBoundingClientRect();return m.top>=0&&m.bottom<=c.top&&b.bottom<=m.bottom})()"),`${scale}x ${t}: menu and Planner fit above keyboard`);await p.screenshot(`menu-${scale}x-${t}-keyboard`);await click('#menu-dismiss');await p.hideKeyboard();
  }
 }
 p.adb('shell','settings','put','system','font_scale','1');await pause(650);await theme('dark');await load('range');await p.hideKeyboard();
 await p.ev("document.getElementById('message').value='Keep these exact words — and spacing.';document.getElementById('message').dispatchEvent(new Event('input',{bubbles:true}));window.qaFetch=fetch;window.qaTurns=[];window.fetch=(url,options)=>url==='/api/turn'?new Promise((resolve,reject)=>{qaTurns.push(JSON.parse(options.body));window.qaReject=reject;}):qaFetch(url,options)");
 await pause(500);const point=await p.ev("(()=>{const r=document.getElementById('send').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await p.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await pause(500);await p.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(400);
 check(await p.ev("document.getElementById('panel').dataset.menuOpen==='true'&&qaTurns.length===0"),'Hold Send opens menu without submitting');await p.touch('#plans-view');await pause(600);
 check(p.adb('shell','dumpsys','activity','activities').toString().includes('com.rpm.prototype/.PlannerActivity'),'Menu opens native Planner');p.adb('shell','input','keyevent','4');await pause(600);check(await p.ev("document.getElementById('message').value==='Keep these exact words — and spacing.'"),'Planner round trip preserves unsent draft');
 await p.touch('#send');await pause(500);check(await p.ev("qaTurns.length===1&&document.getElementById('panel').dataset.capState==='waiting'&&getComputedStyle(document.querySelector('.capture-stage')).display==='none'"),'Waiting replaces prior response and uses real request state');await p.screenshot('waiting');
 await p.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});check(await p.ev("getComputedStyle(document.querySelector('.cap-waiting'),'::before').animationName==='none'"),'Reduced motion stops waiting flow');await p.screenshot('waiting-reduced');await p.ev("qaReject(new Error('Synthetic transport failure'))");await pause(400);check(await p.ev("document.getElementById('message').value==='Keep these exact words — and spacing.'"),'Transport failure restores exact unsent words');await p.ev('window.fetch=qaFetch');
 fs.writeFileSync(`${out}/native-checks.json`,JSON.stringify({checks:checks.length,assertions:checks,layouts,fixture:true,liveModel:false},null,2));console.log(JSON.stringify({checks:checks.length,layouts:layouts.length}));
} catch(error){fs.writeFileSync(`${out}/native-checks-partial.json`,JSON.stringify({checks,layouts,error:error.message},null,2));try{await p.screenshot('check-failure');}catch{}throw error;}
finally{try{p.adb('shell','settings','put','system','font_scale','1');}catch{}await p.close();}
