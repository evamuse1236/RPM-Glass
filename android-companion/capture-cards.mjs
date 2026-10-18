import {el,icon,button} from './capture-dom.mjs';
import {scheduleText} from './capture-content.mjs';
import {actionPresentation} from './capture-session.mjs';

const ENTITY={task:'Task',block:'Block',project:'Project',goal:'Goal',area:'Area'};
const KEEPABLE=new Set(['idea','preference','question']);
const NOTE_ICON={idea:'lightbulb',reflection:'chat',preference:'tune',question:'help',reference:'info',existing:'check_circle'};

export function card(cls=''){
 const node=el('section',['card','enter',cls].filter(Boolean).join(' '));
 return node;
}
function kicker(text,{name,tone=''}={}){
 const row=el('p',['kicker',tone].filter(Boolean).join(' '));
 if(name)row.append(icon(name,{fill:tone==='done'}));
 row.append(el('span','',text));
 return row;
}
function actionsRow(...nodes){
 const row=el('div','card-actions');
 row.append(...nodes.filter(Boolean));
 return row;
}
const words=raw=>el('p','words',raw);

export function opTitle(op){
 const set=op.fields.find(f=>f.name==='title'&&f.op==='set');
 return set?.value??op.targetTitle??ENTITY[op.entity]??'Item';
}

/** While the request runs: "Saving your words", then "Reading your words" once the phone has kept them. */
export function pendingCard({text,phase='saving',slow=false}){
 const node=card('pending');
 node.setAttribute('role','status');
 const spinner=el('span','spinner');
 spinner.setAttribute('aria-hidden','true');
 const body=el('div','pending-text');
 body.append(el('p','card-title',phase==='saving'?'Saving your words':'Your words are saved'));
 body.append(el('p','quiet',phase==='saving'?'One moment.':slow?'Still reading them. This can take a little longer.':'Reading them now.'));
 if(text)body.append(words(text));
 node.append(spinner,body);
 return node;
}

/** The model failed, or there is no key. The words stay saved and wait for Retry. */
export function wordsKeptCard({raw,error,aiEnabled,saved=true},on){
 const node=card('failure');
 node.append(kicker(saved?'Your words are saved':'Not saved yet',{name:saved?'check_circle':'error',tone:saved?'done':'error'}));
 node.append(words(raw));
 const why=!aiEnabled?'Connect an AI key to sort this into your plan. Your words stay saved either way.'
  :saved?(error?`Capture couldn’t read them: ${error}`:'Capture couldn’t read them yet.')
  :(error??'The phone did not respond.')+' Your words are still in the box.';
 node.append(el('p','quiet',why));
 const edit=on.edit?button('Edit',()=>on.edit(raw),{role:'text'}):null;
 node.append(aiEnabled
  ?actionsRow(edit,button('Retry',on.retry,{role:'filled',iconName:'refresh'}))
  :actionsRow(edit,button('Retry',on.retry,{role:'text'}),button('Connect an AI key',on.connectAI,{role:'filled',iconName:'key'})));
 return node;
}

function line(row){
 const item=el('li','line');
 const head=el('p','line-head');
 head.append(el('span','verb',row.verb));
 const title=el('span','line-title',row.title||'Untitled');
 if(row.must){const star=icon('star',{fill:true,cls:'must-mark'});star.removeAttribute('aria-hidden');star.setAttribute('aria-label','Must');star.setAttribute('role','img');title.append(' ',star);}
 head.append(title);
 item.append(head);
 const meta=el('p','line-meta');
 const parts=[];
 if(row.renamedFrom)parts.push(['was',row.renamedFrom]);
 if(row.was&&row.when)parts.push(['was',row.was],['arrow','→'],['',row.when]);
 else if(row.when)parts.push(['',row.when]);
 if(row.where)parts.push(['',row.where]);
 if(row.alert)parts.push(['',row.alert==='alarm'?'Alarm':'Reminder']);
 parts.forEach(([cls,text],i)=>{
  if(i&&parts[i-1][0]!=='arrow'&&cls!=='arrow')meta.append(' · ');
  else if(i)meta.append(' ');
  meta.append(cls==='was'?el('span','was',text):cls==='arrow'?el('span','',text+' '):text);
 });
 if(parts.length)item.append(meta);
 return item;
}
function lines(rows){
 const list=el('ul','lines');
 list.append(...rows.map(line));
 return list;
}

/** "Also heard": what was said but not planned, each keepable one tap away. */
export function alsoHeard(capture,on){
 const notes=capture.notes??[];
 if(!notes.length)return null;
 const box=el('div','lines also');
 box.append(el('p','section-title','Also heard'));
 for(const n of notes){
  const row=el('div','record');
  row.append(icon(NOTE_ICON[n.disposition]??'info'));
  const text=el('div','record-text');
  text.append(el('p','',n.note));
  if(n.keptTaskId!=null)text.append(el('p','quiet','In your Inbox'));
  row.append(text);
  if(KEEPABLE.has(n.disposition)&&on.keepNote){
   row.append(n.keptTaskId!=null
    ?button('Undo',()=>on.keepNote(capture,n,false),{role:'text',ariaLabel:`Take “${n.note}” out of the Inbox`})
    :button('Keep as task',()=>on.keepNote(capture,n,true),{role:'text',ariaLabel:`Keep “${n.note}” as an Inbox task`}));
  }
  box.append(row);
 }
 return box;
}

/** New items: "Added · Call the bank · Today, 10:30 AM · Inbox" with Undo, and a countdown before Capture closes. */
export function receiptCard(capture,{canUndo,on}){
 const draft=capture.draft,node=card('receipt');
 const kept=draft.confirm==='kept';
 if(kept)node.append(kicker('Kept',{name:'check_circle',tone:'done'}));
 node.append(lines(draft.lines?.length?draft.lines:[{verb:'Saved',title:capture.raw}]));
 if(draft.applied?.warning)node.append(warnLine(draft.applied.warning));
 const also=alsoHeard(capture,on);
 if(also)node.append(also);
 const countdown=el('span','countdown');
 countdown.setAttribute('aria-live','off');
 node.append(actionsRow(countdown,canUndo?button('Undo',()=>on.undo(draft),{role:'text',iconName:'undo'}):null,
  button('Open planner',on.openPlanner,{role:'text'})));
 return node;
}

function warnLine(text){
 const row=el('p','warn');
 row.append(icon('warning'),el('span','',text));
 return row;
}

/** A change to something already saved: applied now, then Keep or Undo in one tap. */
export function confirmCard(capture,{canUndo,on}){
 const draft=capture.draft,node=card('confirm');
 const count=draft.lines?.length??0;
 node.append(kicker(draft.mode==='plan'?'Plan applied. Keep it?':count>1?`${count} changes made. Keep them?`:'Changed. Keep it?',{name:'edit_note',tone:'change'}));
 node.append(lines(draft.lines??[]));
 if(capture.reply&&draft.mode==='plan')node.append(el('p','card-text',capture.reply));
 if(draft.applied?.warning)node.append(warnLine(draft.applied.warning));
 node.append(words(capture.raw));
 node.append(actionsRow(canUndo?button('Undo',()=>on.undo(draft),{role:'text',iconName:'undo'}):el('span','quiet','Changed since; Undo is in the planner.'),
  button('Keep',()=>on.keep(draft),{role:'filled',iconName:'check'})));
 return node;
}

export function undoneCard(capture,on){
 const node=card('undone');
 node.append(kicker('Undone. Your plan is as it was.',{name:'undo'}));
 node.append(words(capture.raw));
 node.append(actionsRow(button('Edit words',()=>on.edit(capture.raw),{role:'text'})));
 return node;
}

export function parkedCard(capture,on){
 const node=card('parked');
 node.append(kicker('Left as a draft',{name:'inventory_2'}),words(capture.raw),el('p','quiet','Nothing changed. Your words are in History.'));
 node.append(actionsRow(button('Review again',()=>on.resume(capture.draft),{role:'tonal'})));
 return node;
}

/** Words kept with no change and no answer: an acknowledgement, with anything heard. */
export function savedCard(capture,on){
 const node=card('saved');
 node.append(kicker('Saved',{name:'check_circle',tone:'done'}),words(capture.raw));
 const also=alsoHeard(capture,on);
 if(also)node.append(also);
 return node;
}

const NEED={question:'One question first',time:'Check the time',unknown:'One detail is missing',check:'Check this draft'};
function needOf(draft){
 if(draft.validationNotice)return 'check';
 if(draft.question)return 'question';
 if(draft.schedulePreview?.items?.some(i=>i.status==='review'))return 'time';
 if(draft.operations.some(op=>op.fields.some(f=>f.op==='unknown')))return 'unknown';
 return null;
}

/** A draft that could not apply on its own: an AM/PM, a time to check, a missing detail. */
export function openCard(capture,on){
 const draft=capture.draft,node=card('open');
 node.append(kicker(NEED[needOf(draft)]??'Ready to add',{name:'help',tone:'change'}));
 const prompt=draft.question?.prompt??draft.review?.question??draft.validationNotice??capture.reply;
 if(prompt)node.append(el('p','card-title',prompt));
 const list=el('ul','lines');
 for(const op of draft.operations){
  const preview=draft.schedulePreview?.items?.find(p=>p.opId===op.opId);
  const when=scheduleText(preview,{timeZone:draft.schedulePreview?.timezone});
  const verb=op.kind==='create'?'New':op.kind==='complete'?'Done':op.kind==='archive'?'Trash':'Change';
  list.append(line({verb,title:opTitle(op),when:when??null,was:null,where:null}));
 }
 if(draft.operations.length)node.append(list);
 node.append(words(capture.raw));
 const answers=(draft.actions??[]).filter(a=>a.action.kind==='answer');
 if(answers.length){
  const chips=el('div','chips');
  for(const a of answers){
   const chip=el('button','chip',a.label);
   chip.type='button';
   chip.addEventListener('click',()=>on.action(a.action));
   chips.append(chip);
  }
  node.append(chips);
 }
 const rest=(draft.actions??[]).filter(a=>a.action.kind!=='answer').map(a=>({a,p:actionPresentation(a,draft)})).sort((x,y)=>x.p.order-y.p.order);
 node.append(actionsRow(...rest.map(({a,p})=>button(p.label,()=>on.action(a.action),{role:p.role,iconName:p.icon??null}))));
 return node;
}

/** A plain-text answer, grounded in the plan snapshot. Paragraphs only; never markup from the model. */
export function answerText(reply){
 const box=el('div','card-text');
 for(const para of String(reply??'').split(/\n{2,}/).map(p=>p.trim()).filter(Boolean))box.append(el('p','',para));
 return box;
}

