// Synthetic Android regression: status refresh must retain the existing UI.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {motionPage,motionSampler} from './motion-page.mjs';
import {openCaptureProbe,pause} from './capture-ui-device.mjs';import {captureFixture} from './capture-response-fixtures.mjs';
const out=process.env.RPM_MOTION_OUTPUT??'output/motion-2026-09-28',p=await openCaptureProbe({out:out+'/screens'}),checks=[],samples={};let planner;
const check=(v,label)=>{assert.ok(v,label);checks.push(label);};
try{
 await p.load(await captureFixture('range'));await p.hideKeyboard();
 await p.ev("window.qaResponse=document.querySelector('.cap-response');window.qaStage=document.querySelector('.capture-stage');document.querySelector('.cap-details').open=true");await pause(400);
 for(let i=0;i<5;i++)await p.ev('rpmPhoneRefresh()');await pause(400);
 check(await p.ev("qaStage===document.querySelector('.capture-stage')&&qaResponse===document.querySelector('.cap-response')"),'Five unchanged phone refreshes keep the same response nodes');
 check(await p.ev("document.querySelector('.cap-details').open"),'Refresh retains expanded Details');
 await p.ev(motionSampler);
 await p.ev("window.qaTap={};const summary=document.querySelector('.cap-details summary');summary.addEventListener('touchend',()=>qaTap.end=performance.now(),{once:true});summary.addEventListener('click',()=>qaTap.click=performance.now(),{once:true})");
 await p.touch('.cap-details summary');samples.tap=await p.ev('qaTap');check(samples.tap.click-samples.tap.end<150,'A Details tap does not wait for double-tap detection');
 samples.height=await p.ev("qaSample(()=>document.querySelector('.cap-details summary').click(),'.cap-response',650)");
 check(new Set(samples.height.map(f=>f.height)).size>3,'Visible Capture height passes through intermediate sizes');
 check(new Set(samples.height.map(f=>f.viewportHeight)).size===1,'Capture resizing leaves the native viewport fixed');check(new Set(samples.height.map(f=>f.layoutHeight)).size<=2,'Capture changes layout once while its surface animates');
 await pause(400);const settled=await p.ev("({h:document.getElementById('panel').offsetHeight,more:!document.getElementById('capture-overflow').hidden})");await pause(600);
 check(await p.ev("document.getElementById('panel').offsetHeight")===settled.h&&!settled.more,'Resizing settles without overflow-button feedback');
 await p.ev("document.querySelector('.cap-details').open=false");await pause(400);
 samples.save=await p.ev("qaSample(()=>document.querySelector('#capture-actions .primary').click(),'.cap-response',700)");
 check(samples.save.some(f=>f.animations>0)&&new Set(samples.save.map(f=>f.opacity)).size>3,'New saved receipt visibly animates once');
 check((await p.state()).entries.length===1,'Animation preserves the reviewed save');
 await p.touch('.cap-undo');check((await p.state()).entries.length===0,'Undo remains functional');
 await p.ev("document.getElementById('menu-toggle').click()");await pause(300);
 samples.history=await p.ev("qaSample(()=>document.getElementById('history-view').click(),'.capture-stage')");check(samples.history.some(f=>f.animations>0),'Capture to History has a transition');
 await p.ev("document.getElementById('home').click()");await pause(400);
 await p.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 samples.reduced=await p.ev("qaSample(()=>document.querySelector('.cap-details summary').click(),'.cap-response')");check(new Set(samples.reduced.map(f=>f.height)).size<=2&&!samples.reduced.some(f=>f.animations>0),'Reduced motion skips response and native height animation');
 await p.call('Emulation.setEmulatedMedia',{features:[]});await p.ev("RPM_PLATFORM.action('planner')");await pause(650);planner=await motionPage(p.adb,'/planner.html');await planner.ev(motionSampler);await pause(500);
 await planner.ev("window.qaWorkspace=document.querySelector('#workspace').firstElementChild;window.qaTab=document.querySelector('#planner-tabs button')");for(let i=0;i<5;i++){await planner.ev('rpmPhoneRefresh()');await pause(100);}
 check(await planner.ev("qaWorkspace===document.querySelector('#workspace').firstElementChild&&qaTab===document.querySelector('#planner-tabs button')"),'Planner and its navigation retain nodes through unchanged status/calendar checks');
 for(const label of ['Blocks','Projects','Life','Today']){samples[label]=await planner.ev(`qaSample(()=>document.querySelector('#planner-tabs [aria-label="${label}"]').click(),'#workspace')`);check(samples[label].some(f=>f.animations>0)&&new Set(samples[label].map(f=>f.opacity)).size>3,label+' navigation runs through visible intermediate frames');}
 samples.sheetIn=await planner.ev("qaSample(()=>document.querySelector('#planner-actions button').click(),'#editor')");check(samples.sheetIn.some(f=>f.animations>0),'Editor sheet enters with motion');check(new Set(samples.sheetIn.map(f=>f.height)).size===1&&new Set(samples.sheetIn.map(f=>f.bodyHeight)).size<=2&&new Set(samples.sheetIn.map(f=>f.footerY)).size>3,'Keyboard moves Planner footer through intermediate positions with a single layout change');
 await planner.ev("window.qaField=document.querySelector('#editor input');qaField.value='Keep my local draft';qaField.dispatchEvent(new Event('input',{bubbles:true}))");await planner.ev('rpmPhoneRefresh()');await pause(300);check(await planner.ev("qaField.isConnected&&qaField.value==='Keep my local draft'"),'Status refresh preserves an actively edited field');
 await planner.ev("document.querySelector('#editor').dataset.dirty='false'");samples.sheetOut=await planner.ev("qaSample(()=>document.querySelector('#editor header button').click(),'#editor')");check(samples.sheetOut.some(f=>f.animations>0)&&await planner.ev("document.getElementById('editor').hidden"),'Sheet exit animates then closes');
 await planner.ev("document.querySelector('#planner-actions button').click();document.querySelector('#editor header button').click();document.querySelector('#planner-actions button').click()");await pause(500);check(await planner.ev("!document.getElementById('editor').hidden&&!document.getElementById('editor').inert&&document.querySelectorAll('#editor-scrim').length===1"),'Rapid close/reopen cannot hide the newer sheet or duplicate its scrim');await planner.ev("document.querySelector('#editor').dataset.dirty='false';document.querySelector('#editor header button').click()");await pause(300);
 await planner.ev("rpmOpenSettings('settings')");await pause(600);await planner.ev("window.qaSettings=document.querySelector('.settings-page');window.dispatchEvent(new Event('rpm-settings-refresh'))");await pause(400);check(await planner.ev("qaSettings===document.querySelector('.settings-page')"),'Unchanged Settings refresh retains its page');
 await planner.ev('rpmHandleBack()');await pause(400);await planner.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});samples.plannerReduced=await planner.ev("qaSample(()=>document.querySelector('#planner-tabs [aria-label=Blocks]').click(),'#workspace')");check(!samples.plannerReduced.some(f=>f.animations>0),'Planner respects reduced motion');await planner.call('Emulation.setEmulatedMedia',{features:[]});
 p.adb('shell','settings','put','system','font_scale','2');await pause(800);for(const label of ['Projects','Life','Today','Blocks']){await planner.ev(`document.querySelector('#planner-tabs [aria-label="${label}"]').click()`);await pause(350);check(await planner.ev("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#planner-tabs [aria-current=page]').getBoundingClientRect().bottom<=innerHeight+1"),'200% '+label+' stays inside viewport');}
 p.adb('shell','settings','put','system','font_scale','1');await pause(700);
 fs.writeFileSync(out+'/motion-samples.json',JSON.stringify(samples,null,2));
 fs.writeFileSync(out+'/motion-checks.json',JSON.stringify({checks:checks.length,assertions:checks},null,2));console.log(JSON.stringify({checks:checks.length}));
}finally{try{p.adb('shell','settings','put','system','font_scale','1');}catch{}planner?.close();await p.close();}
