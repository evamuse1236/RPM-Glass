// The current Capture response: proposals, one question, or a receipt.
// Every change still goes through the existing typed draft actions.
import {captureSchedule,captureDuration,scheduleText} from './capture-content.mjs';
import {duration} from './planner/format.mjs';
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

/** Where a task goes, said plainly: "Block: …" with the Result's deadline, or "Inbox · No block". */
function destination(op,ctx){
 if(op.entity!=='task')return null;
 const block=op.fields.find(f=>f.name==='blockId');
 if(block?.op==='clear'||!block&&op.kind==='create')return {text:'Inbox · No block',inbox:true};
 if(block?.op!=='set')return null;
 const name=block.displayValue??'Unavailable Block';
 return {text:'Block: '+name,name,due:ctx.blockDue?.(block.value)??null};
}

/**
 * One quiet line per proposal: destination · date and time · estimate · Must.
 * The receipt reuses it, so what was added reads exactly as what was proposed.
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
 const parts=[dest?.text,when,estimate,must?'Must':null].filter(Boolean);
 if(schedule?.review&&!draft.question)notes.push(el('p','needs-answer',schedule.review.replace(`For ${title}: `,'')));
 if(when&&!schedule?.review&&timeZone!==deviceZone()){
  const zone=new Intl.DateTimeFormat('en-GB',{timeZone,timeZoneName:'short'}).formatToParts(new Date(preview.planned??Date.now())).find(p=>p.type==='timeZoneName')?.value;
  if(zone)notes.push(el('p','detail-note','Times in '+zone));
 }
 return {parts,dest,when,must,notes,hasMinutes:minutes!=null};
}

function summaryLine(parts,cls='prop-summary-line'){
 return el('span',cls,parts.join(' · '));
}

/** Must keeps the Google Tasks star; the summary line says the word. */
function mustStar(op,draft,ctx,must){
 return iconButton('star',`Must: ${opTitle(op)}`,()=>ctx.on.action({...actionBase(draft),kind:'set-field',opId:op.opId,field:'must',value:!must}),{cls:'must-star',fill:must,pressed:must});
}

/** Tapping the summary opens editing: Block, date and time, wording, removal. */
function editMenu(anchor,op,draft,ctx,{dest,when,multi}){
 const title=opTitle(op),items=[];
 if(dest)items.push({label:dest.inbox?'Choose a Block':'Move to another Block',sub:dest.inbox?'In the Inbox now':dest.name,icon:'stacks',run:()=>ctx.on.pickBlock(anchor,op,draft)});
 if(op.entity==='task'&&op.kind==='create')items.push({label:when?'Change date and time':'Add a date',sub:when??'No date',icon:'event',
  run:()=>ctx.on.prefill(when?`Change the time of “${title}” to `:`Schedule “${title}” for `,draft)});
 items.push({label:'Change in your words',icon:'edit',run:()=>ctx.on.prefill(`For “${title}”: `,draft)});
 if(multi)items.push({label:'Remove from this draft',icon:'remove_circle_outline',run:()=>ctx.on.prefill(`Remove “${title}” from this draft.`,draft)});
 ctx.on.itemMenu(anchor,items);
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

function proposalItem(op,draft,ctx,{multi,active}){
 const title=opTitle(op);
 const item=el('article','prop');
 item.dataset.opId=op.opId;
 const top=el('div','prop-top'),heading=el('div','prop-heading');
 const kind=op.entity!=='task'?(op.kind==='create'?'New ':'')+ENTITY[op.entity]:null;
 const change=op.kind!=='create'?CHANGE[op.kind]??op.kind:null;
 const eyebrow=[change,kind].filter(Boolean).join(' · ');
 if(eyebrow)heading.append(el('p','prop-kind',eyebrow));
 heading.append(el('h3','prop-title',title));
 const titleField=op.fields.find(f=>f.name==='title'&&f.op==='set');
 if(active&&titleField?.origin==='suggested')heading.append(el('span','tag','Suggested title'));
 top.append(heading);
 const sum=summary(op,draft,ctx);
 const canMust=op.entity==='task'&&['create','update'].includes(op.kind);
 if(active&&canMust)top.append(mustStar(op,draft,ctx,sum.must));
 item.append(top);
 const editable=active&&(sum.parts.length||multi);
 const line=el(editable?'button':'div','prop-summary');
 if(editable){
  line.type='button';
  line.setAttribute('aria-haspopup','menu');
  line.addEventListener('click',e=>editMenu(e.currentTarget,op,draft,ctx,{...sum,multi}));
 }
 const due=sum.dest?.due?'Block '+sum.dest.due.label[0].toLowerCase()+sum.dest.due.label.slice(1):null;
 if(editable)line.setAttribute('aria-label',`${[...sum.parts,due].filter(Boolean).join(', ')||'Edit'}. Change ${title}`);
 const text=el('span','prop-summary-text');
 if(sum.parts.length)text.append(summaryLine(sum.parts));
 if(due)text.append(el('span','prop-due'+(sum.dest.due.overdue?' overdue':''),due));
 if(text.childElementCount)line.append(text);
 if(editable)line.append(icon(sum.parts.length?'edit':'more_horiz',{cls:'prop-summary-icon'}));
 if(line.childElementCount)item.append(line);
 item.append(...sum.notes,...otherFields(op,draft,{active,hasMinutes:sum.hasMinutes}));
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

function draftActions(draft,{multi}){
 const items=(draft.actions??[]).filter(a=>a.action.kind!=='answer');
 const hasCommit=items.some(a=>a.action.kind==='commit');
 return items
  .filter(a=>!(multi&&hasCommit&&a.action.kind==='open'))
  .map(item=>({item,...actionPresentation(item,draft)}))
  .sort((a,b)=>a.order-b.order);
}

function activeDraft(capture,ctx){
 const draft=capture.draft,multi=draft.operations.length>1;
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
 for(const op of draft.operations)items.append(proposalItem(op,draft,ctx,{multi,active:true}));
 if(draft.question){
  card.append(questionBlock(draft,ctx),details(multi?`Show all ${draft.operations.length} proposals`:'Show the proposal',[items],'details props-details'));
 }else card.append(items);
 const actions=draftActions(draft,{multi}).map(a=>button(a.label,()=>ctx.on.action(a.item.action),{role:a.role,iconName:a.icon}));
 return {node:card,actions};
}

/** The tasks a committed draft created, each with the same summary line as its proposal. */
function addedTasks(draft,ctx){
 const ops=draft.operations??[];
 if(!ops.length||ops.some(op=>op.kind!=='create'||op.entity!=='task'))return [];
 return ops.map(op=>{
  const row=el('li','receipt-item');
  row.append(el('p','receipt-title',opTitle(op)),summaryLine(summary(op,draft,ctx).parts,'receipt-line'));
  return row;
 });
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
