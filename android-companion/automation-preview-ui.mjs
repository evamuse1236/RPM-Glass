import {createFocusPreview,focusDecision,createMockUpdateAdapters,createUpdatePreview} from './automation-preview.mjs';
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
export function automationPreview(){
  const section=el('section','','settings-group');section.dataset.section='automation-preview';section.append(el('h2','Automation previews'),el('p','Try sample events. These previews do not hide real notifications, block apps, build updates or send messages.','settings-note'));
  function field(label,value,type){const wrap=el('label','','field'),input=el('input');input.type=type;input.value=value;wrap.append(el('span',label),input);section.append(wrap);return input;}
  const start=field('Focus starts','09:00','time'),end=field('Focus ends','11:00','time'),time=field('Sample event time','09:30','time');
  const out=el('p','','settings-note');out.setAttribute('role','status');const focus=createFocusPreview();let sequence=0;
  function action(label,fn){const b=el('button',label,'menu-action link');b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){out.textContent=e.message;}finally{b.disabled=false;}});section.append(b);}
  const schedule=()=>({start:start.value,end:end.value,time:time.value});
  action('Preview notification batch',()=>{const result=focus.receive({id:String(++sequence),title:'Sample notification'},schedule());out.textContent=result.notification==='batch'?`${result.queued} sample notifications held out of view until release.`:'Outside focus hours: the sample notification appears normally.';});
  action('Release sample batch',()=>{const digest=focus.release();out.textContent=digest.length?`Sample digest: ${digest.length} notifications ready to review.`:'No sample notifications waiting.';});
  action('Preview opening X / Twitter',()=>{out.textContent=focusDecision({...schedule(),url:'https://x.com/home'}).app==='block'?'X / Twitter would be blocked during these focus hours.':'X / Twitter would be available outside these focus hours.';});
  section.append(el('h3','Update handoff'));
  const threshold=field('Verified features per update (sample)','3','number');threshold.min='1';threshold.max='100';
  action('Preview Hermes → WhatsApp update',async()=>{const count=Number(threshold.value);if(!Number.isInteger(count)||count<1||count>100)throw new Error('Choose 1 to 100 sample features.');const adapters=createMockUpdateAdapters(),flow=createUpdatePreview({threshold:count,...adapters});for(let i=1;i<=count;i++)flow.add({id:'sample-'+i,title:'Sample feature '+i,verified:true});const result=await flow.run({releaseId:'sample-release',recipient:'sample-recipient'});out.textContent=`Simulated: Hermes prepared ${result.featureCount} sample features; WhatsApp attachment handoff recorded. Nothing was built or sent.`;});
  section.append(out);return section;
}
