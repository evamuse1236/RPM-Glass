// The current Capture response: proposals with any question inline, what else
// was heard, or a receipt. Every change still goes through the typed draft actions.
import {captureSchedule,captureDuration,scheduleText,dueText} from './capture-content.mjs';
import {duration,clock} from './planner/format.mjs';
import {el,icon,button,iconButton} from './capture-dom.mjs';
import {keptCard,dialogueCard,receiptCard,receiptActions,parkedCard,undoneCard,wordsToggle,warning} from './capture-states.mjs';

const ENTITY={task:'task',block:'Block',project:'Project',goal:'Goal',area:'Area'};
const FIELD_LABEL={purpose:'Why',notes:'Notes',projectId:'Project',goalId:'Goal',areaId:'Area',year:'Year',priority:'Position in Plan',recurrence:'Repeats',repeatAfterDays:'Repeats every',alert:'Alert'};
const REPEATS={daily:'Every day',weekly:'Every week',weekdays:'Every weekday'};
const deviceZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
// A day said with a part of day keeps that word beside the date, since no clock was chosen ("Sun 4 Oct · evening").
// The hours a part of day covers, for what else already sits in it (an exam on "Monday morning").
const WINDOW={tonight:[18,23],evening:[17,21],afternoon:[12,17],morning:[6,12]};
// A window that names no day, kept in the task's notes in Dara's words and shown where the date would be.
const VAGUE=/\b(?:this|next|coming)\s+(?:week|weekend|month)\b|\bsome\s?(?:day|time)\b|\bsoon\b|\beventually\b/i;
const PART=[[/\b(?:tonight|raat|night)\b/i,'tonight'],[/\b(?:evening|shaam|sham)\b/i,'evening'],[/\b(?:afternoon|after lunch|dopahar)\b/i,'afternoon'],[/\b(?:morning|subah|sakali)\b/i,'morning']];

export function opTitle(op){
 const set=op.fields.find(f=>f.name==='title'&&f.op==='set');
 const entity=ENTITY[op.entity]??'item';
 return set?.value??op.targetTitle??entity[0].toUpperCase()+entity.slice(1);
}
const actionBase=draft=>({conversationId:draft.conversationId,draftId:draft.id,revision:draft.revision});
const field=(op,name)=>op.fields.find(f=>f.name===name);
const plural=(n,one,many=one+'s')=>`${n} ${n===1?one:many}`;

/** Where a task goes: its Block with the Result's deadline, or the Inbox. */
function destination(op,ctx){
 if(op.entity!=='task')return null;
 const block=field(op,'blockId');
 if(block?.op==='clear'||!block&&op.kind==='create')return {name:'Inbox',inbox:true};
 if(block?.op!=='set')return null;
 return {name:block.displayValue??'Unavailable Block',id:block.value,due:ctx.blockDue?.(block.value)??null};
}

/** What a proposal still needs from Dara before it can be added: an open question, an unknown field or a time to check. */
function openNeed(op,draft){
 if(draft.question?.opId===op.opId)return {kind:'question'};
 const preview=draft.schedulePreview?.items?.find(p=>p.opId===op.opId);
 if(preview?.status==='review')return {kind:'time',reason:preview.reason};
 const unknown=op.fields.find(f=>f.op==='unknown');
 if(unknown)return {kind:'unknown',field:unknown.name};
 return null;
}

/**
 * The facts a proposal shows: destination, date and time (with a stated part of
 * day), Must, estimate, and what else bears on that time. The receipt reuses it.
 */
function summary(op,draft,ctx){
 const preview=draft.schedulePreview?.items?.find(p=>p.opId===op.opId);
 const timeZone=draft.schedulePreview?.timezone??deviceZone();
 const dest=destination(op,ctx);
 let when=scheduleText(preview,{timeZone});
 const part=preview&&!preview.planned&&preview.plannedDate?PART.find(([re])=>re.test(preview.source??''))?.[1]:null;
 if(when&&part)when=when==='Today'?{tonight:'Tonight',evening:'This evening',afternoon:'This afternoon',morning:'This morning'}[part]:`${when}, ${part}`;
 const minutes=preview?.minutes??field(op,'minutes')?.value;
 const must=op.entity==='task'&&field(op,'must')?.op==='set'&&field(op,'must').value===true;
 const estimate=Number.isFinite(minutes)&&minutes>0&&!preview?.end?duration(minutes):null;
 let load=preview?.planned&&timeZone===deviceZone()?ctx.dayLoad?.({start:preview.planned,minutes,blockId:dest?.id,due:dest?.due?.value})??[]:[];
 if(part&&preview.plannedDate&&timeZone===deviceZone()){
  // A day with a part of day: anything busy in those hours, and other Results due then.
  const [from,to]=WINDOW[part],start=new Date(`${preview.plannedDate}T${String(from).padStart(2,'0')}:00`);
  load=(ctx.dayLoad?.({start:start.toISOString(),minutes:(to-from)*60,blockId:dest?.id,due:dest?.due?.value})??[])
   .filter(i=>i.kind==='clash'||i.kind==='deadline'&&i.time&&i.at>=+start&&i.at<+start+(to-from)*36e5).map(i=>({...i,window:part}));
 }
 const dated=op.entity==='task'&&op.kind!=='complete'&&op.kind!=='archive'&&(op.kind==='create'||!!field(op,'time'));
 const alert=field(op,'alert')?.op==='set'&&field(op,'alert').value!=='off'?field(op,'alert').value:null;
 const repeats=field(op,'recurrence')?.op==='set'?REPEATS[field(op,'recurrence').value]:null;
 const notes=field(op,'notes')?.op==='set'?String(field(op,'notes').value):'';
 const vague=!when&&notes.length<=40&&VAGUE.test(notes)?notes:null;
 const guess=field(op,'time')?.op==='set'&&field(op,'time').origin==='suggested';
 return {dest,when,estimate,must,load,dated,alert,repeats,preview,vague,guess,day:preview?.planned?new Date(preview.planned):null};
}

/** The saved task's current day and time, for an update's "from" side. */
function beforeText(op){
 const b=op.targetBefore;
 if(!b)return null;
 if(b.planned)return scheduleText({planned:b.planned},{});
 if(b.plannedDate)return scheduleText({plannedDate:b.plannedDate},{});
 return 'No date';
}

/** One assist chip: an icon and a short label; tappable chips open their change. */
function chip(iconName,label,{onClick=null,ariaLabel=null,cls='',title=null,tag=null}={}){
 const node=el(onClick?'button':'span','pchip'+(cls?' '+cls:''));
 if(onClick){node.type='button';node.addEventListener('click',onClick);}
 if(ariaLabel)node.setAttribute('aria-label',ariaLabel);
 if(title)node.title=title;
 node.append(icon(iconName,{cls:'pchip-icon'}),el('span','pchip-label',label));
 if(tag)node.append(el('span','pchip-tag',tag));
 return node;
}

/** A filled amber star marks a Must, as everywhere in RPM; other proposals show none. */
function mustMark(){
 const star=icon('star',{fill:true,cls:'must-mark'});
 star.removeAttribute('aria-hidden');star.setAttribute('role','img');star.setAttribute('aria-label','Must');
 return star;
}

/**
 * The chips under a proposal's title, one wrapping line as in Google Tasks' quick add: where it goes (tap
 * to move), when (tap to change in words), then estimate, reminder and repeat. An update shows "from → to".
 */
function chips(op,draft,ctx,sum,need){
 const row=el('div','pchips'),title=opTitle(op);
 if(op.kind==='complete'){row.append(chip('task_alt','Tick off',{cls:'pchip-flat'}));return row;}
 if(op.kind==='archive'){row.append(chip('archive','Archive',{cls:'pchip-flat'}));return row;}
 let destChip=null;
 if(sum.dest){
  const move=e=>ctx.on.pickBlock(e.currentTarget,op,draft);
  destChip=(chip(sum.dest.inbox?'inbox':'stacks',sum.dest.name,{onClick:move,cls:'pchip-dest',title:sum.dest.name,
   ariaLabel:`${sum.dest.inbox?'Inbox, no Block':'Block: '+sum.dest.name}${sum.dest.due?', '+dueText(sum.dest.due):''}. Move ${title}`}));
 }
 // The day comes first; chips wrap to a second line rather than cut a name short. A day the assistant
 // suggested (Dara named none) is dashed and says so; a window with no day ("sometime this week") shows as said.
 if(sum.dated&&need?.kind!=='time'&&!(need?.kind==='question'&&draft.question.field==='time')){
  const change=op.kind==='create'?()=>ctx.on.prefill(sum.when?`Change the time of “${title}” to `:`Schedule “${title}” for `,draft):null;
  const before=op.kind==='update'&&field(op,'time')?beforeText(op):null;
  const shown=sum.when??sum.vague??'No date';
  const label=before&&before!==shown?`${before} → ${shown}`:shown;
  row.append(chip(sum.when?'event':'calendar_add_on',label,{onClick:change,cls:(sum.when?'':'pchip-muted')+(sum.when&&sum.guess?' pchip-guess':''),tag:sum.when&&sum.guess?'Suggested':null,
   ariaLabel:change?`${shown}${sum.guess?', suggested':''}. ${sum.when?'Change the time of':'Add a date to'} ${title}`:null}));
 }
 if(destChip)row.append(destChip);
 if(sum.estimate)row.append(chip('timer',sum.estimate));
 if(sum.alert)row.append(chip(sum.alert==='alarm'?'alarm':'notifications',sum.alert==='alarm'?'Alarm':'Reminder'));
 if(sum.repeats)row.append(chip('repeat',sum.repeats));
 if(op.kind==='update'&&field(op,'blockId')&&op.targetBefore){
  // A move into a Block reads as one: the chip above already names where it goes.
  row.querySelector('.pchip-dest')?.classList.add('pchip-changed');
 }
 return row.childElementCount?row:null;
}

/**
 * A calendar overlap at the proposed time (or in the part of day said), another Result due in that part of
 * day, and a date that lands after its Result's deadline: the only warnings.
 */
function warnings(sum){
 const nodes=[];
 const windowed=sum.load.filter(i=>i.window);
 if(windowed.length){
  // The first two, briefly ("DAD exam 9–10 AM"); the rest as a count.
  const items=windowed.slice(0,2).map(i=>i.kind==='clash'?`${i.title} ${span(i.start,i.end)}`:`${i.title} due ${short(i.at)}`);
  const more=windowed.length>2?`, +${windowed.length-2} more`:'';
  nodes.push(el('p','prop-warn',`That ${windowed[0].window==='tonight'?'night':windowed[0].window} also has ${items.join(', ')}${more}`));
 }
 for(const c of sum.load.filter(i=>i.kind==='clash'&&!i.window))nodes.push(el('p','prop-warn',`Clashes with ${c.title}, ${clock(c.start)}–${clock(c.end)}`));
 const due=sum.dest?.due,at=sum.preview?.planned?Date.parse(sum.preview.planned):NaN;
 if(due?.value&&Number.isFinite(at)&&due.value.length>10&&at>Date.parse(due.value))nodes.push(el('p','prop-warn',`After this Result is ${dueText(due).replace(/^Due/,'due')}`));
 return nodes;
}

// "9 AM", "10:30 AM", and "9–10 AM" when both ends share AM or PM.
const short=at=>clock(at).replace(/:00(?=\s|\u00a0)/,'');
function span(start,end){
 const a=short(start),b=short(end),[, am]=a.split(/\s|\u00a0/),[, bm]=b.split(/\s|\u00a0/);
 return am===bm?`${a.replace(/(?:\s|\u00a0)[AP]M$/i,'')}–${b}`:`${a}–${b}`;
}

/** Fields with no chip of their own (a new Block's Purpose, notes, a Project link). */
function otherFields(op){
 const nodes=[];
 for(const f of op.fields){
  if(['title','time','blockId','must','minutes','alert','recurrence'].includes(f.name)||f.op==='unknown')continue;
  if(f.name==='notes'&&f.op==='set'&&VAGUE.test(String(f.value))&&String(f.value).length<=40)continue;
  const line=el('p','prop-field');
  line.append(el('span','field-label',FIELD_LABEL[f.name]??f.displayLabel??f.name),el('span','',f.op==='clear'?'Remove':f.displayValue??String(f.value)));
  nodes.push(line);
 }
 return nodes;
}

/**
 * What a proposal needs, asked inside its own row: the assistant's question with
 * its answers as chips, or a time that couldn't be read, with "No date" and
 * "Type a time". Until it's answered the row is not added; the others still are.
 */
function needBlock(op,draft,ctx,need){
 const box=el('div','prop-need'),title=opTitle(op);
 const answers=el('div','need-chips');
 answers.setAttribute('role','group');
 const answer=(label,run,{iconName=null,sub=null}={})=>{
  const node=el('button','need-chip');node.type='button';
  if(iconName)node.append(icon(iconName,{cls:'need-chip-icon'}));
  node.append(el('span','',label));
  if(sub)node.append(el('span','need-chip-sub',sub));
  node.addEventListener('click',run);answers.append(node);
 };
 if(need.kind==='question'){
  const q=draft.question;
  box.append(el('p','need-prompt',q.prompt));
  answers.setAttribute('aria-label',q.prompt);
  for(const item of draft.actions.filter(a=>a.action.kind==='answer')){
   const info=ctx.describe?.(item.action.field,item.action.value);
   answer(info?.title??item.label,()=>ctx.on.action(item.action),{iconName:item.action.field==='time'?'schedule':item.action.field==='blockId'?'stacks':null,sub:info?.subtitle??null});
  }
  if(q.field==='blockId'&&op.entity==='task')answer('Inbox',()=>ctx.on.action({...actionBase(draft),kind:'set-field',opId:op.opId,field:'blockId',clear:true}),{iconName:'inbox'});
  if(q.field==='time'&&op.kind==='create')answer('No date',()=>ctx.on.action({...actionBase(draft),kind:'set-field',opId:op.opId,field:'time',clear:true}),{iconName:'event_busy'});
 }else{
  const said=need.kind==='time'?field(op,'time')?.value:null;
  box.append(el('p','need-prompt',need.kind==='time'?(said?`When is “${said}”?`:'When should this be?'):`What should the ${FIELD_LABEL[need.field]??need.field} be?`));
  if(need.kind==='time'&&need.reason)box.append(el('p','need-sub',need.reason.replace(`For ${title}: `,'')));
  if(need.kind==='time'&&op.kind==='create')answer('No date',()=>ctx.on.action({...actionBase(draft),kind:'set-field',opId:op.opId,field:'time',clear:true}),{iconName:'event_busy'});
  answer('Type it',()=>ctx.on.prefill(`For “${title}”: `,draft),{iconName:'edit'});
 }
 box.append(answers);
 return box;
}

/**
 * One proposal row, the same structure in every state: the title with the Must
 * star and a quiet Leave out control; one line of chips; any warning; and,
 * inside the row, whatever it still needs from Dara.
 */
function proposalItem(op,draft,ctx,{skipped}){
 const title=opTitle(op),included=!skipped.has(op.opId),need=openNeed(op,draft);
 const item=el('article','prop'+(included?'':' skipped')+(need&&included?' waiting':''));
 item.dataset.opId=op.opId;
 const top=el('div','prop-top'),heading=el('div','prop-heading');
 if(op.entity!=='task')heading.append(el('p','prop-kind',(op.kind==='create'?'New ':'Change ')+ENTITY[op.entity]));
 else if(op.kind==='update')heading.append(el('p','prop-kind','Change'));
 // Tapping the title starts a change in Dara's own words; the composer takes it from there.
 const name=el('button','prop-title'+(op.kind==='complete'?' done':''),title);
 name.type='button';
 name.setAttribute('aria-label',`${title}. Change it in your words`);
 name.addEventListener('click',()=>ctx.on.prefill(`For “${title}”: `,draft));
 heading.append(name);
 // A renamed saved task says what it was, so a retitle never reads as a new task.
 const renamed=op.kind==='update'&&field(op,'title')?.op==='set'&&op.targetTitle&&op.targetTitle!==title;
 if(renamed)heading.append(el('p','prop-was',`Was “${op.targetTitle}”`));
 if(!included)heading.append(el('p','prop-left-out','Left out · kept in History'));
 top.append(heading);
 const sum=summary(op,draft,ctx);
 // Must changes in words or later in the task sheet, never by tapping the star.
 if(sum.must)top.append(mustMark());
 // Every card can be left out, even a lone one (Save then has nothing to add).
 const toggle=()=>ctx.on.toggleInclude(draft,op.opId);
 top.append(included?iconButton('close',`Leave out “${title}”`,toggle,{cls:'prop-skip'})
  :button('Put back',toggle,{role:'text',cls:'prop-back',ariaLabel:`Put back “${title}”`}));
 item.append(top);
 // A left-out row keeps its place and height, faded, so nothing under the thumb moves.
 const body=el('div','prop-body');
 body.inert=!included;
 const line=chips(op,draft,ctx,sum,need);
 if(line)body.append(line);
 body.append(...warnings(sum),...otherFields(op));
 if(need&&included)body.append(needBlock(op,draft,ctx,need));
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

/** One plain line naming what the draft holds, the same in every mode, adding up to the cards: "3 new · 1 change · 1 to answer". */
function draftKicker(draft,waiting){
 const ops=draft.operations;
 if(draft.validationNotice)return 'Check this draft';
 const parts=[];
 const created=ops.filter(o=>o.kind==='create').length,changes=ops.filter(o=>o.kind==='update').length;
 const ticks=ops.filter(o=>o.kind==='complete').length,archives=ops.filter(o=>o.kind==='archive').length;
 const onlyTasks=ops.every(o=>o.kind!=='create'||o.entity==='task');
 if(created)parts.push(onlyTasks?plural(created,'new task'):`${created} new`);
 if(changes)parts.push(plural(changes,'change'));
 if(ticks)parts.push(`${ticks} to tick off`);
 if(archives)parts.push(`${archives} to archive`);
 if(waiting)parts.push(`${waiting} to answer`);
 return parts.join(' · ')||'Nothing to add';
}

/** "Also heard": what Dara said that isn't a proposal, each kept one tap away (or already saved). */
const KEEPABLE=new Set(['idea','preference','question']);
const NOTE_ICON={idea:'lightbulb',reflection:'chat',preference:'tune',question:'help',reference:'info',existing:'check_circle'};
export function alsoHeard(capture,ctx){
 const notes=capture.notes??[];
 if(!notes.length)return null;
 const box=el('section','also');
 box.append(el('p','also-head','Also heard'));
 const list=el('ul','also-list');
 for(const n of notes){
  const row=el('li','also-row'+(n.disposition==='existing'?' existing':''));
  row.append(icon(NOTE_ICON[n.disposition]??'info',{cls:'also-icon'}));
  const text=el('span','also-text');
  text.append(el('span','also-note',n.note));
  if(n.keptTaskId!=null)text.append(el('span','also-sub','Added to your Inbox'));
  row.append(text);
  // An idea or an intention can become an Inbox task in one tap; a feeling or a fact is only acknowledged.
  if(KEEPABLE.has(n.disposition)&&!ctx.history){
   row.append(n.keptTaskId!=null
    ?button('Undo',()=>ctx.on.keepNote(capture,n,false),{role:'text',ariaLabel:`Take “${n.note}” out of the Inbox`})
    :button('Add to Inbox',()=>ctx.on.keepNote(capture,n,true),{role:'text',ariaLabel:`Add “${n.note}” to the Inbox`}));
  }
  list.append(row);
 }
 box.append(list);
 return box;
}

/**
 * The footer: Not now, and one filled button that adds the proposals that are
 * ready (included and needing nothing), so an open question never blocks the rest.
 */
function draftFooter(draft,{excluded,ready}){
 const actions=draft.actions??[],out=[];
 const dismiss=actions.find(a=>a.action.kind==='dismiss')?.action??{...actionBase(draft),kind:'dismiss'};
 out.push({label:'Not now',role:'text',action:dismiss});
 const refresh=actions.find(a=>a.action.kind==='refresh-time');
 if(refresh){out.push({label:'Refresh times',role:'filled',icon:'refresh',action:refresh.action});return out;}
 const reviewCommit=draft.review?actions.find(a=>a.action.kind==='commit'):null;
 if(reviewCommit){out.push({label:reviewCommit.label,role:'filled',action:reviewCommit.action});return out;}
 const allCreate=draft.operations.every(op=>op.kind==='create');
 const verb=allCreate?'Add':'Save';
 const label=draft.operations.length>1&&ready>0?`${verb} ${ready}`:verb;
 out.push({label,role:'filled',disabled:!ready,action:{...actionBase(draft),kind:'commit',...(excluded.size?{skip:[...excluded]}:{})}});
 return out;
}

function activeDraft(capture,ctx){
 const draft=capture.draft;
 // Proposals Dara left out stay in the draft but are not added; so do those still waiting for an answer.
 const skipped=ctx.skippedFor?.(draft)??new Set();
 const waiting=draft.operations.filter(op=>!skipped.has(op.opId)&&openNeed(op,draft)).map(op=>op.opId);
 const excluded=new Set([...skipped,...waiting]),ready=draft.operations.length-excluded.size;
 const card=el('section','state-card proposal-card');
 card.dataset.status=draft.status;
 // The header names what is proposed; the original words open right under it.
 const notes=draft.schedulePreview?.items?.flatMap(i=>i.assumptions??[])??[];
 const words=wordsToggle(capture,notes);
 const head=el('div','card-head'),kicker=el('p','kicker');
 if(draft.validationNotice)kicker.append(icon('error',{cls:'warning-icon'}));
 kicker.append(el('span','',draftKicker(draft,waiting.length)));
 head.append(kicker,words.toggle);
 card.append(head,words.region);
 if(['plan','query'].includes(draft.mode)&&capture.reply)card.append(el('p','reply-lead',capture.reply));
 if(draft.validationNotice)card.append(warning('Check this draft',draft.validationNotice));
 if(draft.review)card.append(el('p','review-note',draft.review.question));
 const items=el('div','props');
 for(const op of draft.operations)items.append(proposalItem(op,draft,ctx,{skipped}));
 card.append(items);
 const also=alsoHeard(capture,ctx);
 if(also)card.append(also);
 const actions=draftFooter(draft,{excluded,ready}).map(a=>{
  const node=button(a.label,()=>ctx.on.action(a.action),{role:a.role,iconName:a.icon});
  if(a.disabled)node.disabled=true;
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
 if(!draft){
  const node=dialogueCard(capture),also=alsoHeard(capture,ctx);
  if(also)node.append(also);
  return {node,actions:[],kind:'dialogue'};
 }
 if(draft.status==='committed'){
  const node=receiptCard(capture,ctx,addedTasks(draft,ctx)),also=alsoHeard(capture,ctx);
  if(also)node.append(also);
  return {node,actions:receiptActions(capture,ctx),kind:'receipt'};
 }
 if(draft.status==='parked'){
  return {node:parkedCard(capture),actions:[button('Review again',()=>ctx.on.resume(draft),{role:'tonal'})],kind:'parked'};
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
