// The current Capture response: proposals, one question, or a receipt.
// Every change still goes through the existing typed draft actions.
import {captureSchedule,captureDuration,scheduleText,dueText} from './capture-content.mjs';
import {duration} from './planner/format.mjs';
import {actionPresentation} from './capture-session.mjs';
import {el,icon,button,iconButton,chip,details} from './capture-dom.mjs';
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
 * day. The receipt reuses it, so what was added reads exactly as proposed.
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
 const load=preview?.planned&&timeZone===deviceZone()?ctx.dayLoad?.({start:preview.planned,minutes,blockId:dest?.id})??[]:[];
 const dated=op.entity==='task'&&op.kind==='create'||!!when;
 return {dest,when,estimate,must,notes,load,dated,day:preview?.planned?new Date(preview.planned):null,hasMinutes:minutes!=null};
}

/** The destination as a two-line list item: the Block (or Inbox) and its Result's deadline. */
function destinationLine(op,draft,ctx,dest,active){
 const line=el(active?'button':'div','prop-dest');
 line.append(icon(dest.inbox?'inbox':'stacks',{cls:'prop-icon'}));
 const text=el('span','prop-dest-text'),due=dueText(dest.due);
 text.append(el('span','prop-dest-name',dest.name));
 if(due)text.append(el('span','prop-due'+(dest.due.overdue?' overdue':''),due));
 line.append(text);
 if(active){
  line.type='button';
  line.setAttribute('aria-haspopup','menu');
  line.setAttribute('aria-label',`${dest.inbox?'Inbox, no block':'Block: '+dest.name}${due?', '+due:''}. Move ${opTitle(op)}`);
  line.append(icon('arrow_drop_down',{cls:'prop-drop'}));
  line.addEventListener('click',e=>ctx.on.pickBlock(e.currentTarget,op,draft));
 }
 return line;
}

/** Date and time as an assist chip; a task with none says "No date" rather than leaving a blank. */
function dateChip(op,draft,ctx,sum,active){
 const title=opTitle(op),label=sum.when?[sum.when,sum.estimate].filter(Boolean).join(' · '):sum.estimate?'No date · '+sum.estimate:'No date';
 const run=active&&op.kind==='create'?()=>ctx.on.prefill(sum.when?`Change the time of “${title}” to `:`Schedule “${title}” for `,draft):null;
 return chip(label,{iconName:sum.when||!run?'event':'calendar_add_on',onClick:run,cls:'prop-date'+(sum.when?'':' muted'),
  ariaLabel:run?`${sum.when?sum.when:'No date'}. ${sum.when?'Change the time of':'Add a date to'} ${title}`:null});
}

/** What else holds that day, in one quiet line; a calendar overlap is said separately, in the error colour. */
// A Result named in a note keeps its first three words ("RM critical review…"), so the note stays one glance.
const short=text=>{const words=text.split(' ');return words.length>3?words.slice(0,3).join(' ')+'…':text;};
function loadNotes(sum){
 if(!sum.load.length)return [];
 const today=new Date().toDateString()===sum.day.toDateString();
 const day=today?'Today':sum.day.toLocaleDateString('en-GB',{weekday:'short'});
 const nodes=[],clashes=sum.load.filter(i=>i.clash),others=sum.load.filter(i=>!i.clash);
 if(clashes.length)nodes.push(el('p','prop-load clash','Clashes with '+clashes.map(i=>i.text).join(', ')));
 if(others.length)nodes.push(el('p','prop-load',`${day} also due: `+others.map(i=>[short(i.title),i.time].filter(Boolean).join(' ')).join(', ')));
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

/**
 * One proposal row, the same structure in every state: a leading include box
 * (a success check once added), the title with the Must star, the destination
 * with its deadline, the date chip, then any note about that day.
 */
function proposalItem(op,draft,ctx,{active,added=false,skipped=new Set()}){
 const title=opTitle(op);
 const item=el(added?'li':'article','prop');
 item.dataset.opId=op.opId;
 const included=!skipped.has(op.opId);
 if(active){
  const box=iconButton(included?'check_box':'check_box_outline_blank',`Include ${title}`,()=>ctx.on.toggleInclude(draft,op.opId),{cls:'prop-check',fill:included});
  box.setAttribute('role','checkbox');
  box.removeAttribute('aria-pressed');
  box.setAttribute('aria-checked',String(included));
  item.append(box);
  if(!included)item.classList.add('skipped');
 }else item.append(icon(added?'check_circle':'radio_button_unchecked',{cls:'prop-lead'+(added?' added':''),fill:added}));
 const body=el('div','prop-body');
 const top=el('div','prop-top'),heading=el('div','prop-heading');
 const kind=op.entity!=='task'?(op.kind==='create'?'New ':'')+ENTITY[op.entity]:null;
 const change=op.kind!=='create'?CHANGE[op.kind]??op.kind:null;
 const eyebrow=[change,kind].filter(Boolean).join(' · ');
 if(eyebrow)heading.append(el('p','prop-kind',eyebrow));
 const name=el(active?'button':'h3','prop-title',title);
 if(active){
  // Tapping the title starts a change in Dara's own words; the composer takes it from there.
  name.type='button';
  name.setAttribute('aria-label',`${title}. Change it in your words`);
  name.addEventListener('click',()=>ctx.on.prefill(`For “${title}”: `,draft));
 }
 heading.append(name);
 const titleField=op.fields.find(f=>f.name==='title'&&f.op==='set');
 if(active&&titleField?.origin==='suggested')heading.append(el('span','tag','Suggested title'));
 top.append(heading);
 const sum=summary(op,draft,ctx);
 // A filled star marks a Must, as everywhere in RPM; other proposals show none. Must changes in words or later in the task sheet.
 if(sum.must){const star=icon('star',{fill:true,cls:'must-mark'});star.removeAttribute('aria-hidden');star.setAttribute('role','img');star.setAttribute('aria-label','Must');top.append(star);}
 body.append(top);
 if(sum.dest)body.append(destinationLine(op,draft,ctx,sum.dest,active));
 if(sum.dated){const row=el('div','prop-chips');row.append(dateChip(op,draft,ctx,sum,active));body.append(row);}
 body.append(...loadNotes(sum),...sum.notes,...otherFields(op,draft,{active,hasMinutes:sum.hasMinutes}));
 item.append(body);
 return item;
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
 // Proposals Dara unticked stay in the draft but are left out of Add.
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
 for(const op of draft.operations)items.append(proposalItem(op,draft,ctx,{active:true,skipped}));
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

/** The tasks a committed draft created, in the same rows as their proposals. */
function addedTasks(draft,ctx){
 const ops=draft.operations??[],skipped=new Set(draft.skipped??[]);
 if(!ops.length||ops.some(op=>op.kind!=='create'||op.entity!=='task'))return [];
 return ops.filter(op=>!skipped.has(op.opId)).map(op=>proposalItem(op,draft,ctx,{active:false,added:true}));
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
