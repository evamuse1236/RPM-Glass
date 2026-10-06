// Repo capture: the widget's second way in. Pick a repo (or a new one), say or type the idea, add
// screenshots, Send. The phone keeps the idea first, then files it in the ideas repo on GitHub, where
// Claude and Codex pick it up ("pull from recent"). Nothing here goes to a model.
import {installCapturePresentation,enter,reducedMotion} from './capture-presentation.mjs';
import {installComposer,listeningCard} from './capture-composer.mjs';
import {el,icon,button} from './capture-dom.mjs';
import {prepareIdea,recentRepos,filterRepos,shortName} from './repo-ideas.mjs';

const AUTO_CLOSE_MS=6000;
const REPOS_STALE_MS=6*60*60*1000;
const MAX_SHOTS=10;

export function mountRepoCapture(platform){
 const $=id=>document.getElementById(id);
 const panel=$('panel'),content=$('content'),dock=$('capture-actions'),message=$('message');
 const native=platform.action;
 const s={phone:null,draft:{repo:null,isNew:false,newName:'',text:'',shots:[]},receipt:null,busy:false,listening:false,
  reposLoading:false,reposError:null,autoClose:null,countdown:null,popover:null,draftSaved:false};

 function status(text,error=false){
  const node=$('status');
  node.textContent=text;
  node.classList.toggle('error',error);
  node.setAttribute('role',error?'alert':'status');
 }
 const github=()=>s.phone?.github??{};
 const inboxName=()=>shortName(github().inbox)||'second-brain';
 const label=fullName=>{const [owner,name]=String(fullName).split('/');return owner===github().login?name:fullName;};

 // ---- the draft is kept on the phone as it changes, like Capture's words ----
 let draftTimer=null;
 function keepDraft(){
  clearTimeout(draftTimer);
  const draft={...s.draft,text:message.value};
  draftTimer=setTimeout(()=>native('repoDraft',{draft}).then(()=>{if(message.value===draft.text){s.draftSaved=true;syncHint();}},
   ()=>status('Couldn’t keep this draft on the phone. Keep this window open.',true)),250);
 }
 function choose(patch){
  Object.assign(s.draft,patch);
  s.draftSaved=false;keepDraft();render();
 }

 // ---- repo choice --------------------------------------------------------
 function repoChip(repo){
  const chosen=!s.draft.isNew&&s.draft.repo?.toLowerCase()===repo.fullName.toLowerCase();
  const chip=el('button','chip filter-chip'+(chosen?' selected':''));
  chip.type='button';chip.setAttribute('role','radio');chip.setAttribute('aria-checked',String(chosen));
  chip.setAttribute('aria-label',repo.fullName+(repo.private?' (private)':''));
  if(chosen)chip.append(icon('check'));
  chip.append(el('span','chip-label',label(repo.fullName)));
  chip.addEventListener('click',()=>choose({repo:repo.fullName,isNew:false}));
  return chip;
 }
 function repoPicker(){
  const box=el('section','repo-pick');
  const head=el('p','field-label','For');head.id='repo-label';
  const row=el('div','chip-row');
  row.setAttribute('role','radiogroup');row.setAttribute('aria-labelledby','repo-label');
  const chips=recentRepos({selected:s.draft.isNew?null:s.draft.repo,used:s.phone.used??[],repos:s.phone.repos??[],limit:3});
  for(const repo of chips)row.append(repoChip(repo));
  const more=el('button','chip more-chip');
  more.type='button';more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded','false');
  more.append(el('span','chip-label','All repos'),icon('arrow_drop_down'));
  more.addEventListener('click',()=>openRepoList(more));
  const fresh=el('button','chip filter-chip'+(s.draft.isNew?' selected':''));
  fresh.type='button';fresh.setAttribute('role','radio');fresh.setAttribute('aria-checked',String(s.draft.isNew));
  fresh.append(icon(s.draft.isNew?'check':'add'),el('span','chip-label','New repo'));
  fresh.addEventListener('click',()=>{choose({isNew:true});content.querySelector('.repo-name')?.focus({preventScroll:true});});
  row.append(more,fresh);
  box.append(head,row);
  if(s.draft.isNew){
   const name=el('input','repo-name');
   name.type='text';name.maxLength=100;name.value=s.draft.newName;name.placeholder='Name it (optional)';
   name.setAttribute('aria-label','New repo name');name.setAttribute('enterkeyhint','next');name.autocomplete='off';
   name.addEventListener('input',()=>{s.draft.newName=name.value;keepDraft();});
   name.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();message.focus({preventScroll:true});}});
   box.append(name);
  }
  return box;
 }

 /** "All repos": every repo on GitHub, searchable, as a menu anchored over the panel. */
 function openRepoList(anchor){
  closePopover();
  anchor.setAttribute('aria-expanded','true');
  const pop=el('div','popover wide repo-list');
  pop.setAttribute('role','dialog');pop.setAttribute('aria-label','All repos');
  const search=el('input','repo-search');
  search.type='search';search.placeholder='Search your repos';search.setAttribute('aria-label','Search your repos');search.autocomplete='off';
  const list=el('div','repo-items');list.setAttribute('role','listbox');
  const fill=()=>{
   list.replaceChildren();
   const repos=s.phone.repos??[];
   if(!github().connected){
    list.append(el('p','popover-note','Connect GitHub to see all your repos. Ideas stay on this phone until then.'),
     button('Connect GitHub',()=>{closePopover();connect();},{role:'text'}));
    return;
   }
   if(!repos.length){list.append(el('p','popover-note',s.reposLoading?'Loading your repos…':s.reposError??'No repos found.'));return;}
   const shown=filterRepos(repos,search.value);
   if(!shown.length)list.append(el('p','popover-note','No repo matches. Try New repo for one that doesn’t exist yet.'));
   for(const repo of shown.slice(0,60)){
    const row=el('button','popover-item');
    row.type='button';row.setAttribute('role','option');
    const chosen=!s.draft.isNew&&s.draft.repo?.toLowerCase()===repo.fullName.toLowerCase();
    row.setAttribute('aria-selected',String(chosen));
    row.append(icon('code'));
    const text=el('span','popover-text');
    text.append(el('span','',label(repo.fullName)));
    if(repo.description)text.append(el('span','popover-sub',repo.description));
    row.append(text);
    if(chosen)row.append(icon('check',{cls:'popover-check'}));
    row.addEventListener('click',()=>{closePopover();choose({repo:repo.fullName,isNew:false});message.focus({preventScroll:true});});
    list.append(row);
   }
  };
  search.addEventListener('input',fill);
  pop.append(search,list);
  panel.append(pop);
  // Over the content, under the header: the list gets the room above the keyboard.
  const p=panel.getBoundingClientRect(),top=(panel.querySelector('.panel-header')?.getBoundingClientRect().bottom??p.top)-p.top;
  pop.style.top=top+'px';pop.style.left='8px';pop.style.right='8px';
  // A fixed height, so the panel holds still while the search narrows the list.
  pop.style.height=Math.max(180,p.height-top-8)+'px';
  s.popover={node:pop,anchor,fill};
  fill();
  if(!reducedMotion()&&pop.animate)pop.animate([{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'none'}],{duration:150,easing:'cubic-bezier(.05,.7,.1,1)'});
  search.focus({preventScroll:true});
  refreshRepos();
 }
 function closePopover(){
  if(!s.popover)return false;
  s.popover.anchor.setAttribute('aria-expanded','false');
  s.popover.node.remove();s.popover=null;
  return true;
 }
 document.addEventListener('pointerdown',e=>{if(s.popover&&!s.popover.node.contains(e.target)&&!s.popover.anchor.contains(e.target))closePopover();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&s.popover){e.preventDefault();const a=s.popover.anchor;closePopover();a.focus();}});

 async function refreshRepos({force=true}={}){
  if(!github().connected||s.reposLoading)return;
  if(!force&&s.phone.reposAt&&Date.now()-s.phone.reposAt<REPOS_STALE_MS)return;
  s.reposLoading=true;s.reposError=null;s.popover?.fill();
  try{
   const result=await native('repoRepos');
   s.phone.repos=result.repos;s.phone.reposAt=result.reposAt;
  }catch(error){s.reposError=error.message;}
  s.reposLoading=false;
  if(s.popover)s.popover.fill();
  else if(!s.receipt)render();
 }
 const connect=()=>native('settingsAction',{action:'connect_github'}).catch(error=>status(error.message,true));

 // ---- screenshots ----------------------------------------------------------
 async function attach(){
  if(s.busy||s.draft.shots.length>=MAX_SHOTS){if(s.draft.shots.length>=MAX_SHOTS)status(`Up to ${MAX_SHOTS} screenshots per idea.`);return;}
  try{
   const picked=await native('repoPick',{max:MAX_SHOTS-s.draft.shots.length});
   if(picked?.error)status(picked.error,true);
   if(picked?.shots?.length){leaveReceipt();choose({shots:[...s.draft.shots,...picked.shots].slice(0,MAX_SHOTS)});}
  }catch(error){status(error.message,true);}
 }
 function removeShot(id){
  choose({shots:s.draft.shots.filter(x=>x!==id)});
  native('repoShotRemove',{id}).catch(()=>{});
 }
 function shotStrip(){
  const strip=el('div','shots');
  strip.setAttribute('aria-label',`${s.draft.shots.length} screenshot${s.draft.shots.length===1?'':'s'}`);
  s.draft.shots.forEach((id,i)=>{
   const tile=el('div','shot');
   const img=el('img');img.src=`/shot/${id}.jpg`;img.alt=`Screenshot ${i+1}`;img.decoding='async';
   const remove=el('button','shot-remove');remove.type='button';remove.setAttribute('aria-label',`Remove screenshot ${i+1}`);
   remove.append(icon('close'));remove.addEventListener('click',()=>removeShot(id));
   tile.append(img,remove);strip.append(tile);
  });
  return strip;
 }

 // ---- send, receipt, undo ------------------------------------------------
 async function send(){
  if(s.busy)return;
  const text=message.value;
  if(!s.draft.isNew&&!s.draft.repo){status('Choose a repo above, or New repo.',true);return;}
  let idea;
  try{idea=prepareIdea({repo:s.draft.isNew?null:s.draft.repo,newName:s.draft.newName,text,shots:s.draft.shots});}
  catch(error){status(error.message,true);return;}
  s.busy=true;status('');controls();
  clearTimeout(draftTimer);
  try{
   const saved=await native('repoSave',{...idea,text:text.trim()});
   s.phone.used=saved.used??s.phone.used;
   s.receipt={...idea,state:saved.state,url:saved.url??null,error:saved.error??null,text:text.trim(),shotCount:idea.shots.length};
   s.draft={repo:s.draft.isNew?null:s.draft.repo,isNew:false,newName:'',text:'',shots:[]};
   composer.set('',{focus:false});s.draftSaved=false;
   s.busy=false;
   render();
   enter(content.firstElementChild);enter(dock,{distance:4,duration:180});
   if(saved.state==='sent'||saved.state==='sending')scheduleAutoClose();
  }catch(error){
   s.busy=false;controls();
   status(error.message||'The idea couldn’t be saved. Your words are still here.',true);
  }
 }
 // The phone reports the upload when it finishes; the receipt's delivery line follows it.
 window.rpmRepoIdeaStatus=update=>{
  if(update?.waiting!==undefined&&s.phone)s.phone.waiting=update.waiting;
  if(!s.receipt||update?.id!==s.receipt.id)return;
  Object.assign(s.receipt,{state:update.state,url:update.url??s.receipt.url,error:update.error??null});
  render();
 };
 function delivery(r){
  const shots=r.shotCount?`${r.shotCount} screenshot${r.shotCount===1?'':'s'} · `:'';
  if(r.state==='sent')return shots+`In ${inboxName()} for Claude and Codex`;
  if(r.state==='sending')return shots+`Sending to ${inboxName()}…`;
  if(r.state==='not-connected')return shots+'Saved on this phone · connect GitHub to send it';
  return shots+'Saved on this phone · '+(r.error??'sends when you’re online');
 }
 function receipt(frag){
  const r=s.receipt,box=el('section','state-card repo-receipt');
  box.setAttribute('role','status');
  box.append(el('p','receipt-title',r.repo?`Idea saved for ${label(r.repo)}`:'New repo idea saved'));
  const list=el('ul','receipt-list'),item=el('li');
  item.append(el('p','receipt-name',r.title),el('p','receipt-meta',delivery(r)));
  list.append(item);box.append(list);
  frag.append(box);
  const actions=[el('span','close-countdown')];
  actions.push(button('Undo',undo,{role:'tonal'}));
  if(r.state==='not-connected')actions.push(button('Connect GitHub',connect,{role:'text'}));
  else if(r.url)actions.push(button('Open',()=>native('repoOpen',{id:r.id}).catch(error=>status(error.message,true)),{role:'text',ariaLabel:'Open on GitHub'}));
  return actions;
 }
 async function undo(){
  const r=s.receipt;if(!r||s.busy)return;
  cancelAutoClose();s.busy=true;controls();
  if(r.state==='sent')status(`Removing it from ${inboxName()}…`);
  try{
   const back=await native('repoUndo',{id:r.id});
   s.receipt=null;s.busy=false;
   s.draft={repo:back.draft.repo??null,isNew:!!back.draft.isNew,newName:back.draft.newName??'',text:'',shots:back.draft.shots??[]};
   composer.set(back.draft.text??'');
   status(r.state==='sent'?`Removed from ${inboxName()}. Your words are back to edit.`:'Not sent. Your words are back to edit.');
   keepDraft();render();
  }catch(error){s.busy=false;controls();status(error.message,true);}
 }
 function leaveReceipt(){if(s.receipt){s.receipt=null;cancelAutoClose();render();}}

 function scheduleAutoClose(){
  cancelAutoClose();
  const ends=Date.now()+AUTO_CLOSE_MS;
  const tick=()=>{const line=dock.querySelector('.close-countdown'),left=Math.ceil((ends-Date.now())/1000);if(line)line.textContent=left>0?`Closing in ${left}s`:'';};
  tick();s.countdown=setInterval(tick,250);
  s.autoClose=setTimeout(()=>{cancelAutoClose();if(s.receipt&&!message.value.trim()&&!s.busy)native('minimize').catch(()=>{});},AUTO_CLOSE_MS);
 }
 function cancelAutoClose(){
  clearTimeout(s.autoClose);clearInterval(s.countdown);s.autoClose=null;s.countdown=null;
  const line=dock.querySelector('.close-countdown');if(line)line.textContent='';
 }
 for(const type of ['pointerdown','keydown','wheel'])panel.addEventListener(type,cancelAutoClose,{capture:true,passive:true});

 // ---- rendering ----------------------------------------------------------
 function syncHint(){
  const hint=$('composer-hint'),text=!!message.value.trim(),compose=!s.receipt&&!s.busy&&!s.listening;
  const saved=compose&&text&&s.draftSaved;
  hint.hidden=!compose;
  hint.dataset.kind=saved?'saved':'promise';
  $('hint-text').textContent=saved?'Draft saved':s.draft.isNew?`Goes to ${inboxName()} as a new repo idea`:`Goes to ${inboxName()} for Claude and Codex`;
 }
 function controls(){
  const canSend=!s.busy&&(!!message.value.trim()||s.draft.shots.length>0);
  $('send').dataset.canSend=String(canSend);
  panel.dataset.hasShots=String(s.draft.shots.length>0);
  for(const id of ['send','dictate','attach'])$(id).disabled=s.busy||(id==='dictate'&&s.listening);
  panel.dataset.busy=String(s.busy);
  message.placeholder=s.draft.isNew?'What should the new repo do?':'What’s the idea?';
  syncHint();
 }
 let floor=0;
 function render(){
  if(!s.phone)return;
  const before=panel.offsetHeight;
  closePopover();
  const frag=document.createDocumentFragment();
  let actions=[];
  panel.dataset.state=s.listening?'listening':s.receipt?'committed':'idle';
  if(s.listening)frag.append(listeningCard(el,icon));
  else if(s.receipt)actions=receipt(frag);
  else{
   if(!github().connected){
    const note=el('div','note');
    note.append(icon('key'),el('p','','Connect GitHub to send ideas. Until then they wait on this phone.'),button('Connect',connect,{role:'text'}));
    frag.append(note);
   }else if(s.phone.waiting>0){
    const note=el('div','note');
    note.append(icon('cloud_upload'),el('p','',`${s.phone.waiting} idea${s.phone.waiting===1?'':'s'} waiting to send`),
     button('Send now',()=>native('repoSendWaiting').then(r=>{s.phone.waiting=r.waiting;render();},error=>status(error.message,true)),{role:'text'}));
    frag.append(note);
   }
   frag.append(repoPicker());
   if(s.draft.shots.length)frag.append(shotStrip());
  }
  content.replaceChildren(frag);
  dock.replaceChildren(...actions);dock.hidden=!actions.length;
  controls();
  // Like Capture, the panel never shrinks under the thumb while composing; the receipt settles to its size.
  panel.style.minHeight='';
  if(s.receipt){floor=0;return;}
  floor=Math.max(floor,before,panel.offsetHeight);
  const limit=parseFloat(getComputedStyle(panel).maxHeight)||Infinity;
  panel.style.minHeight=Math.min(floor,limit)+'px';
 }

 // ---- voice ----------------------------------------------------------------
 async function voice(){
  if(s.listening||s.busy)return;
  leaveReceipt();
  s.listening=true;render();
  try{
   const result=await native('dictate');
   s.listening=false;render();
   if(result?.text){composer.append(result.text);status('Check your words, then send.');}
  }catch(error){s.listening=false;render();status(error.message,true);}
 }

 // ---- wiring ---------------------------------------------------------------
 const presentation=installCapturePresentation({action:native});
 const composer=installComposer({
  onSubmit:()=>send(),
  onInput:text=>{
   if(s.receipt&&text.trim())leaveReceipt();
   s.draftSaved=false;keepDraft();status('');controls();
  },
  onVoice:voice,
 });
 // The composer sends only words; screenshots alone are an idea too.
 $('composer').addEventListener('submit',()=>{if(!message.value.trim()&&s.draft.shots.length)send();});
 $('attach').addEventListener('pointerdown',e=>{if(document.activeElement===message)e.preventDefault();});
 $('attach').addEventListener('click',attach);
 $('close').addEventListener('click',()=>native('minimize'));
 window.rpmHandleBack=()=>closePopover();
 window.addEventListener('pagehide',()=>{clearTimeout(draftTimer);native('repoDraft',{draft:{...s.draft,text:message.value}}).catch(()=>{});});
 // Settings changed (GitHub connected in the native dialog, text size): read the phone's state again.
 async function load({shared=false}={}){
  const phone=await native('repoState');
  const first=!s.phone;
  s.phone=phone;
  const d=phone.draft??{};
  if(first){
   s.draft={repo:d.repo??phone.used?.[0]??null,isNew:!!d.isNew,newName:d.newName??'',text:'',shots:d.shots??[]};
   composer.set(d.text??'',{focus:false});
  }else if(shared){
   // Screenshots shared from another app join the idea being written.
   leaveReceipt();
   s.draft.shots=[...new Set([...s.draft.shots,...(d.shots??[])])].slice(0,MAX_SHOTS);
  }
  render();
  presentation.updateOverflow();
  refreshRepos({force:false});
 }
 window.addEventListener('rpm-settings-refresh',()=>load().catch(()=>{}));
 window.rpmRepoShared=()=>load({shared:true}).catch(()=>{});
 load().then(()=>{
  if(!content.querySelector('.repo-name'))message.focus({preventScroll:true});
 }).catch(error=>status('Repo capture could not open. '+error.message,true));
}
