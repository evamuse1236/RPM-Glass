// The current Capture response: proposals, one question, or a receipt.
// Every change still goes through the existing typed draft actions.
import {captureSchedule,captureDuration,scheduleText,dueText} from './capture-content.mjs';
import {duration,clock} from './planner/format.mjs';
import {actionPresentation} from './capture-session.mjs';
import {el,icon,button,iconButton,details} from './capture-dom.mjs';
import {keptCard,dialogueCard,receiptCard,receiptActions,parkedCard,undoneCard,wordsToggle,warning} from './capture-states.mjs';

const ENTITY={task:'task',block:'Block',project:'Project',goal:'Goal',area:'Area'};
const FIELD_LABEL={purpose:'Purpose',notes:'Notes',projectId:'Project',goalId:'Goal',areaId:'Area',year:'Year',priority:'Position in Plan',recurrence:'Repeats',repeatAfterDays:'Days between repeats',alert:'Alert'};
const CHANGE={update:'Change',complete:'Mark as done',archive:'Archive'};
const deviceZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;

export function opTitle(op){
 const set=op.fields.find(f=>f.name==='title'&&f.op==='set');
 const entity=ENTITY[op.entity]??'item';
 return set?.value??op.targetTitle??entity[0].toUpperCase()+entity.slice(1);
}
const actionBase=draft=>({conversationId:draft.conversationId,draftId:draft.id,revision:draft.revision});

function fieldValue(field){
 if(field.op==='unknown')return 'Needs your answer';
 if(field.op==='clear')return 'Remove';
 if(field.name==='minutes')return captureDuration(field.value);
 if(field.displayValue!==undefined)return field.displayValue;
 if(typeof field.value==='boolean')return field.value?'Yes':'No';
 return String(field.value);
}

/** Where a task goes: its Block with the Result's deadline, or the Inbox. */
function destination(op,ctx){
 if(op.entity!=='task')return null;
 const block=op.fields.find(f=>f.name==='blockId');
 if(block?.op==='clear'||!block&&op.kind==='create')return {name:'Inbox',inbox:true};
 if(block?.op!=='set')return null;
 return {name:block.displayValue??'Unavailable Block',id:block.value,due:ctx.blockDue?.(block.value)??null};
}

/**
 * The facts every proposal row shows in the same order: destination, date
 * and time (or "No date"), Must, the Result's deadline and what else holds that
 * day. The receipt reuses it, so what was added reads in the same words.
 */
function summary(op,draft,ctx){
 const preview=draft.schedulePreview?.items?.find(p=>p.opId===op.opId);
 const timeZone=draft.schedulePreview?.timezone??deviceZone();
 const title=opTitle(op),dest=destination(op,ctx),notes=[];
 const when=scheduleText(preview,{timeZone});
 const schedule=captureSchedule(preview,{timeZone,reference:new Date()});
 const minutes=preview?.minutes??op.fields.find(f=>f.name==='minutes'&&f.op==='set'&&Number.isFinite(f.value))?.value;
 const must=op.entity==='task'&&op.fields.find(f=>f.name==='must'&&f.op==='set')?.value===true;
 const estimate=Number.isFinite(minutes)&&minutes>0?duration(minutes):null;
 if(schedule?.review&&!draft.question)notes.push(el('p','needs-answer',schedule.review.replace(`For ${title}: `,'')));
 if(when&&!schedule?.review&&timeZone!==deviceZone()){
  const zone=new Intl.DateTimeFormat('en-GB',{timeZone,timeZoneName:'short'}).formatToParts(new Date(preview.planned??Date.now())).find(p=>p.type==='timeZoneName')?.value;
  if(zone)notes.push(el('p','detail-note','Times in '+zone));
 }
 const load=preview?.planned&&timeZone===deviceZone()?ctx.dayLoad?.({start:preview.planned,minutes,blockId:dest?.id,due:dest?.due?.value})??[]:[];
 const dated=op.entity==='task'&&op.kind==='create'||!!when;
 return {dest,when,estimate,must,notes,load,dated,day:preview?.planned?new Date(preview.planned):null,hasMinutes:minutes!=null};
}

/**
 * One meta line under a proposal's title, as in a Google Tasks detail page: an
 * icon on the title's edge, the words beside it, an optional second line.
 * Interactive lines are full-width buttons.
 */
function metaRow(iconName,lines,{onClick=null,ariaLabel=null,cls='',trailing=null}={}){
 const row=el(onClick?'button':'div','prop-row'+(cls?' '+cls:''));
 if(onClick){row.type='button';row.addEventListener('click',onClick);}
 if(ariaLabel)row.setAttribute('aria-label',ariaLabel);
 row.append(icon(iconName,{cls:'prop-icon'}));
 const text=el('span','prop-row-text');
 for(const line of lines.filter(Boolean))text.append(typeof line==='string'?el('span','prop-row-main',line):line);
 row.append(text);
 if(trailing)row.append(icon(trailing,{cls:'prop-drop'}));
 return row;
}

/** Where it goes: "Block · <Result>" with that Result's deadline under it, or "Inbox". Tapping opens Move to. */
function destinationRow(op,draft,ctx,dest){
 const due=dueText(dest.due),name=el('span','prop-row-main');
 if(dest.inbox)name.textContent='Inbox';
 else name.append(el('span','prop-label','Block · '),dest.name);
 const sub=due?el('span','prop-row-sub'+(dest.due.overdue?' overdue':''),due):null;
 return metaRow(dest.inbox?'inbox':'stacks',[name,sub],{
  onClick:e=>ctx.on.pickBlock(e.currentTarget,op,draft),trailing:'arrow_drop_down',cls:'prop-dest',
  ariaLabel:`${dest.inbox?'Inbox, no block':'Block: '+dest.name}${due?', '+due:''}. Move ${opTitle(op)}`});
}

/** Date and time, or an explicit "No date"; tapping starts a change in Dara's own words. */
function dateRow(op,draft,ctx,sum){
 const title=opTitle(op),label=[sum.when??'No date',sum.estimate].filter(Boolean).join(' · ');
 const run=op.kind==='create'?()=>ctx.on.prefill(sum.when?`Change the time of “${title}” to `:`Schedule “${title}” for `,draft):null;
 return metaRow(sum.when?'event':'calendar_add_on',[label],{onClick:run,cls:'prop-date'+(sum.when?'':' muted'),
  ariaLabel:run?`${sum.when??'No date'}. ${sum.when?'Change the time of':'Add a date to'} ${title}`:null});
}

// Which proposals have their day details open, so a re-render keeps them open.
const loadOpen=new Set();
const weekday=at=>new Date(at).toLocaleDateString('en-GB',{weekday:'short'});
const count=(n,one,many)=>`${n} ${n===1?one:many}`;
/**
 * What else bears on the proposed time. A calendar overlap is its own line in
 * the error colour. Other deadlines that day and a busy morning before the
 * Result is due fold into one counted disclosure ("Sun: 2 other deadlines" over
 * "Mon: 2 events before it's due") that opens to each item with its time, never cut mid-title.
 */
function loadNotes(sum,key){
 if(!sum.load.length)return [];
 const today=new Date().toDateString()===sum.day.toDateString();
 const day=today?'Today':weekday(sum.day);
 const nodes=[],clashes=sum.load.filter(i=>i.kind==='clash'),deadlines=sum.load.filter(i=>i.kind==='deadline'),before=sum.load.filter(i=>i.kind==='before');
 const range=i=>`${clock(i.start)}–${clock(i.end)}`;
 for(const c of clashes)nodes.push(metaRow('event_busy',[`Clashes with ${c.title}, ${range(c)}`],{cls:'prop-clash'}));
 if(!deadlines.length&&!before.length)return nodes;
 // Each counted line, and once opened the items under it: time first, so a long title wraps on its own.
 const keep=text=>text.replace(/ /g,' ');
 const groups=[];
 if(deadlines.length)groups.push([`${day}: ${count(deadlines.length,'other deadline','other deadlines')}`,deadlines.map(i=>[i.time?keep(i.time):'Due',i.title])]);
 if(before.length)groups.push([`${weekday(before[0].start)}: ${count(before.length,'event','events')} before it’s due`,before.map(i=>[keep(range(i)),i.title])]);
 const details=[],lines=groups.flatMap(([head,items])=>[head,...items.map(([when,title])=>{
  const line=el('span','prop-detail',`${when} · ${title}`);
  details.push(line);
  return line;
 })]);
 const toggle=metaRow('hourglass_bottom',lines,{cls:'prop-context',trailing:'expand_more',onClick:()=>set(details[0].hidden)});
 const set=open=>{for(const d of details)d.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)loadOpen.add(key);else loadOpen.delete(key);};
 set(loadOpen.has(key));
 nodes.push(toggle);
 return nodes;
}

function otherFields(op,draft,{active,hasMinutes}){
 const nodes=[];
 for(const f of op.fields){
  if(['title','time','blockId','must'].includes(f.name))continue;
  if(f.name==='minutes'&&(hasMinutes||f.op==='set'))continue;
  if(f.op==='unknown'&&draft.question?.opId===op.opId&&draft.question.field===f.name)continue;
  const line=el('p','prop-field');
  line.append(el('span','field-label',f.name==='minutes'?'Estimate':FIELD_LABEL[f.name]??f.displayLabel??f.name),el('span','',fieldValue(f)));
  if(active&&f.origin==='suggested')line.append(el('span','tag','Suggested'));
  nodes.push(line);
 }
 return nodes;
}

/** A filled amber star marks a Must, as everywhere in RPM; other proposals show none. */
function mustMark(){
 const star=icon('star',{fill:true,cls:'must-mark'});
 star.removeAttribute('aria-hidden');star.setAttribute('role','img');star.setAttribute('aria-label','Must');
 return star;
}

/**
 * One proposal row, the same structure in every state: the title with the Must
 * star and, when there is more than one, a quiet Leave out control at the end;
 * then icon lines for the destination with its deadline, the date, and what
 * else bears on that time. A left-out row fades and offers Put back.
 */
function proposalItem(op,draft,ctx,{skipped=new Set()}){
 const title=opTitle(op),included=!skipped.has(op.opId);
 const item=el('article','prop'+(included?'':' skipped'));
 item.dataset.opId=op.opId;
 const top=el('div','prop-top'),heading=el('div','prop-heading');
 const kind=op.entity!=='task'?(op.kind==='create'?'New ':'')+ENTITY[op.entity]:null;
 const change=op.kind!=='create'?CHANGE[op.kind]??op.kind:null;
 const eyebrow=[change,kind].filter(Boolean).join(' · ');
 if(eyebrow)heading.append(el('p','prop-kind',eyebrow));
 // Tapping the title starts a change in Dara's own words; the composer takes it from there.
 const name=el('button','prop-title',title);
 name.type='button';
 name.setAttribute('aria-label',`${title}. Change it in your words`);
 name.addEventListener('click',()=>ctx.on.prefill(`For “${title}”: `,draft));
 heading.append(name);
 const titleField=op.fields.find(f=>f.name==='title'&&f.op==='set');
 if(included&&titleField?.origin==='suggested')heading.append(el('span','tag','Suggested title'));
 if(!included)heading.append(el('p','prop-left-out','Left out · kept in History'));
 top.append(heading);
 const sum=summary(op,draft,ctx);
 // Must changes in words or later in the task sheet, never by tapping the star.
 if(sum.must)top.append(mustMark());
 if(draft.operations.length>1){
  const toggle=()=>ctx.on.toggleInclude(draft,op.opId);
  top.append(included?iconButton('close',`Leave out “${title}”`,toggle,{cls:'prop-skip'})
   :button('Put back',toggle,{role:'text',cls:'prop-back',ariaLabel:`Put back “${title}”`}));
 }
 item.append(top);
 // A left-out row keeps its place and height, faded, so nothing under the thumb moves.
 const body=el('div','prop-body');
 body.inert=!included;
 if(sum.dest)body.append(destinationRow(op,draft,ctx,sum.dest));
 if(sum.dated)body.append(dateRow(op,draft,ctx,sum));
 body.append(...loadNotes(sum,`${draft.id}:${op.opId}`),...sum.notes,...otherFields(op,draft,{active:true,hasMinutes:sum.hasMinutes}));
 if(body.childElementCount)item.append(body);
 return item;
}

/** One added task in the receipt: its title with the Must star, then when and where in one quiet line. */
function receiptRow(op,draft,ctx){
 const sum=summary(op,draft,ctx),row=el('li','receipt-row');
 const top=el('p','receipt-name');
 top.append(el('span','',opTitle(op)));
 if(sum.must)top.append(mustMark());
 // When and where wrap as whole phrases, never mid-name.
 const parts=[sum.dated?sum.when??'No date':null,sum.dest?sum.dest.inbox?'Inbox':sum.dest.name:null].filter(Boolean);
 const meta=el('p','receipt-meta');
 parts.forEach((part,i)=>meta.append(...(i?[' ']:[]),el('span','',i<parts.length-1?part+' ·':part)));
 row.append(top,meta);
 return row;
}

function draftKicker(draft,{focused}){
 const ops=draft.operations,n=ops.length;
 if(draft.validationNotice)return 'Check this draft';
 if(draft.question)return 'One thing to check';
 if(draft.review)return 'Check the time';
 if(focused)return 'Editing this draft';
 if(n>1)return ops.every(op=>op.entity==='task'&&op.kind==='create')?`${n} tasks from your note`:`${n} proposed changes`;
 const op=ops[0];
 if(op?.kind==='update')return `Change to a ${ENTITY[op.entity]??'record'}`;
 if(op?.kind!=='create')return 'Proposed change';
 return `Proposed ${ENTITY[op?.entity]??'task'}`;
}

function questionBlock(draft,ctx){
 const box=el('div','question');
 box.append(el('p','question-prompt',draft.question.prompt));
 const others=draft.operations.length-1;
 if(others>0)box.append(el('p','question-sub',`The other ${others===1?'one is':others+' are'} ready and will wait.`));
 const list=el('div','choices');
 list.setAttribute('role','group');
 list.setAttribute('aria-label','Answers');
 for(const item of draft.actions.filter(a=>a.action.kind==='answer')){
  const info=ctx.describe?.(item.action.field,item.action.value);
  const row=el('button','choice');
  row.type='button';
  if(info?.tone){const dot=el('span','dot');dot.style.background=`var(--${info.tone})`;row.append(dot);}
  else row.append(icon(item.action.field==='time'?'schedule':'radio_button_unchecked'));
  const text=el('span','choice-text');
  text.append(el('span','choice-title',info?.title??item.label));
  if(info?.subtitle)text.append(el('span','choice-sub',info.subtitle));
  row.append(text);
  row.addEventListener('click',()=>ctx.on.action(item.action));
  list.append(row);
 }
 const asked=draft.operations.find(op=>op.opId===draft.question.opId);
 if(draft.question.field==='blockId'&&asked?.entity==='task'){
  // Leaving the Block unset is always a valid answer: the task stays in the Inbox.
  const row=el('button','choice');
  row.type='button';
  row.append(icon('inbox',{cls:'inbox'}));
  const text=el('span','choice-text');
  text.append(el('span','choice-title','Keep it in the Inbox'),el('span','choice-sub','No block for now'));
  row.append(text);
  row.addEventListener('click',()=>ctx.on.action({...actionBase(draft),kind:'set-field',opId:asked.opId,field:'blockId',clear:true}));
  list.append(row);
 }
 box.append(list);
 return box;
}

function draftActions(draft,{multi,selected}){
 const items=(draft.actions??[]).filter(a=>a.action.kind!=='answer');
 const hasCommit=items.some(a=>a.action.kind==='commit');
 return items
  .filter(a=>!(multi&&hasCommit&&a.action.kind==='open'))
  .map(item=>({item,...actionPresentation(item,draft,{selected})}))
  .sort((a,b)=>a.order-b.order);
}

function activeDraft(capture,ctx){
 const draft=capture.draft,multi=draft.operations.length>1;
 // Proposals Dara left out stay in the draft but are not added.
 const skipped=ctx.skippedFor?.(draft)??new Set(),selected=draft.operations.length-skipped.size;
 const card=el('section','state-card proposal-card');
 card.dataset.status=draft.status;
 // The header names what is proposed; the original words open right under it.
 const notes=draft.schedulePreview?.items?.flatMap(i=>i.assumptions??[])??[];
 const words=wordsToggle(capture,notes);
 const head=el('div','card-head'),kicker=el('p','kicker');
 if(draft.validationNotice)kicker.append(icon('error',{cls:'warning-icon'}));
 kicker.append(el('span','',draftKicker(draft,ctx)));
 head.append(kicker,words.toggle);
 card.append(head,words.region);
 if(draft.mode==='plan'&&capture.reply){
  const lead=el('p','reply-lead',capture.reply);
  card.append(lead);
 }
 if(draft.validationNotice)card.append(warning('Check this draft',draft.validationNotice));
 if(draft.review)card.append(el('p','needs-answer',draft.review.question));
 const items=el('div','props');
 for(const op of draft.operations)items.append(proposalItem(op,draft,ctx,{skipped}));
 if(draft.question){
  card.append(questionBlock(draft,ctx),details(multi?`Show all ${draft.operations.length} proposals`:'Show the proposal',[items],'details props-details'));
 }else card.append(items);
 const actions=draftActions(draft,{multi,selected}).map(a=>{
  const commit=a.item.action.kind==='commit',action=commit&&skipped.size?{...a.item.action,skip:[...skipped]}:a.item.action;
  const node=button(a.label,()=>ctx.on.action(action),{role:a.role,iconName:a.icon});
  if(commit&&!selected)node.disabled=true;
  return node;
 });
 return {node:card,actions};
}

/** The tasks a committed draft created, one compact line each, so the receipt never looks like the proposals. */
function addedTasks(draft,ctx){
 const ops=draft.operations??[],skipped=new Set(draft.skipped??[]);
 if(!ops.length||ops.some(op=>op.kind!=='create'||op.entity!=='task'))return [];
 return ops.filter(op=>!skipped.has(op.opId)).map(op=>receiptRow(op,draft,ctx));
}

/**
 * Render one capture. Returns the scrollable card and the actions that belong
 * in the dock above the composer.
 */
export function renderResponse(capture,ctx){
 const draft=capture.draft;
 if(capture.status==='captured'){
  const actions=[button('Edit',e=>ctx.on.editWords(capture.raw,e.currentTarget),{role:'text'})];
  const retry=()=>ctx.on.retry(capture.messageId);
  if(ctx.aiEnabled)actions.push(button('Retry',retry,{role:'filled',iconName:'refresh'}));
  else actions.push(button('Retry',retry,{role:'text'}),button('Connect AI',ctx.on.connectAI,{role:'filled',iconName:'key'}));
  return {node:keptCard(capture,ctx),actions,kind:'kept'};
 }
 if(!draft)return {node:dialogueCard(capture),actions:[],kind:'dialogue'};
 if(draft.status==='committed'){
  return {node:receiptCard(capture,ctx,addedTasks(draft,ctx)),actions:receiptActions(capture,ctx),kind:'receipt'};
 }
 if(draft.status==='parked'){
  return {node:parkedCard(capture),actions:[button('Review draft',()=>ctx.on.resume(draft),{role:'tonal'})],kind:'parked'};
 }
 if(draft.status==='undone')return {node:undoneCard(capture),actions:[],kind:'undone'};
 const {node,actions}=activeDraft(capture,ctx);
 return {node,actions,kind:draft.question?'question':'proposal'};
}

/** A History card keeps its own actions inline, so older drafts stay recoverable. */
export function historyCard(capture,ctx){
 const canUndo=!!capture.draft?.receipt?.undoId&&capture.draft.receipt.undoId===ctx.undoId;
 const {node,actions}=renderResponse(capture,{...ctx,history:true,canUndo});
 node.classList.add('history-card');
 if(actions.length){
  const row=el('div','card-actions');
  row.append(...actions);
  node.append(row);
 }
 return node;
}
