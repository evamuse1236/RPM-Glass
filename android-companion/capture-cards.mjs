import {el,icon,button} from './capture-dom.mjs';
import {scheduleText} from './capture-content.mjs';
import {actionPresentation} from './capture-session.mjs';
import {line,lines,tally} from './capture-lines.mjs';
import {attachSwipe} from './task-swipe.mjs';

const ENTITY={task:'Task',block:'Block',project:'Project',goal:'Goal',area:'Area',draft:'Draft'};
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
/** A tap on this card failed: say why on the card itself, under its heading. */
export function withProblem(node,text){
 const row=kicker(text,{name:'error',tone:'error'});
 row.classList.add('problem');row.setAttribute('role','alert');
 node.insertBefore(row,node.children[1]??null);
 return node;
}
function actionsRow(...nodes){
 const row=el('div','card-actions');
 row.append(...nodes.filter(Boolean));
 return row;
}
const words=raw=>el('p','words',raw);

/** The saved words as one quoted line behind a check; a tap shows them all. */
function keptWords(raw){
 const row=el('button','kept-words');
 row.type='button';
 row.setAttribute('aria-expanded','false');
 row.setAttribute('aria-label',`Your words are saved: ${raw}`);
 row.append(icon('check_circle',{fill:true}),el('span','words',raw));
 row.addEventListener('click',()=>row.setAttribute('aria-expanded',String(row.getAttribute('aria-expanded')!=='true')));
 return row;
}

export function opTitle(op){
 const set=op.fields.find(f=>f.name==='title'&&f.op==='set');
 return set?.value??op.targetTitle??ENTITY[op.entity]??'Item';
}

/** The model failed, or there is no key. The words stay saved and wait for Retry. */
export function wordsKeptCard({raw,error,aiEnabled,saved=true},on){
 const node=card('failure');
 if(saved)node.append(keptWords(raw));
 else node.append(kicker('Not saved yet',{name:'error',tone:'error'}),words(raw));
 const why=!aiEnabled?null
  :saved?(error?`Couldn’t read them: ${error}`:'Couldn’t read them yet.')
  :(error??'The phone did not respond.')+' Your words are still in the box.';
 if(why)node.append(el('p','quiet',why));
 const edit=on.edit?button('Edit',()=>on.edit(raw),{role:'text'}):null;
 node.append(aiEnabled
  ?actionsRow(edit,button('Retry',on.retry,{role:'filled',iconName:'refresh'}))
  :actionsRow(edit,button('Retry',on.retry,{role:'text'}),button('Connect an AI key',on.connectAI,{role:'filled',iconName:'key'})));
 return node;
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
export function receiptCard(capture,{canUndo,on,undoId}){
 const draft=capture.draft,node=card('receipt');
 const rows=draft.lines?.length?draft.lines:[{verb:'Saved',title:capture.raw}];
 const chips=on.chips&&rows.some(r=>r.edit)?on.chips:null;
 if(chips?.held(draft.id))node.classList.replace('enter','kept');
 node.append(kicker(draft.confirm==='kept'?'Kept':tally(rows),{name:'check_circle',tone:'done'}));
 node.append(chips?chips.items(capture,node):lines(rows));
 if(capture.reply&&!capture.reply.startsWith('Draft ready to review.'))node.append(answerText(capture.reply));
 appendReceiptHelp(node,draft,on);
 if(draft.applied?.warning)node.append(warnLine(draft.applied.warning));
 const also=alsoHeard(capture,on);
 if(also)node.append(also);
 const change=chips?.changeRow(capture,undoId);
 if(change)node.append(change);
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
 if(capture.reply&&!capture.reply.startsWith('Draft ready to review.'))node.append(el('p','card-text',capture.reply));
 appendReceiptHelp(node,draft,on);
 if(draft.applied?.warning)node.append(warnLine(draft.applied.warning));
 node.append(words(capture.raw));
 node.append(actionsRow(canUndo?button('Undo',()=>on.undo(draft),{role:'text',iconName:'undo'}):el('span','quiet','Changed since; Undo is in the planner.'),
  button('Keep',()=>on.keep(draft),{role:'filled',iconName:'check'})));
 return node;
}

function appendReceiptHelp(node,draft,on){
 const help=draft.nextStep;if(!help)return;
 if(help.text)node.append(el('p','quiet',help.text));
 if(help.action){
  const chips=el('div','chips'),chip=el('button','chip',help.label);
  chip.type='button';chip.addEventListener('click',()=>on.action(help.action));
  chips.append(chip);node.append(chips);
 }
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
  const verb=op.kind==='create'?'New':op.kind==='complete'?'Done':op.entity==='draft'?'Set aside':op.kind==='archive'?'Trash':'Change';
  list.append(line({verb,title:opTitle(op),when:when??null,was:null,where:null,minutes:null}));
 }
 if(draft.operations.length)node.append(list);
 node.append(words(capture.raw));
 const answers=(draft.actions??[]).filter(a=>a.action.kind==='answer');
 if(answers.length){
  const chips=el('div','chips');
  for(const a of answers){
   const chip=el('button','chip');
   chip.type='button';
   chip.append(icon(answerIcon(draft.question?.field)),el('span','',a.label));
   chip.addEventListener('click',()=>on.action(a.action));
   chips.append(chip);
  }
  node.append(chips);
 }
 const rest=(draft.actions??[]).filter(a=>a.action.kind!=='answer').map(a=>({a,p:actionPresentation(a,draft)})).sort((x,y)=>x.p.order-y.p.order);
 node.append(actionsRow(...rest.map(({a,p})=>button(p.label,()=>on.action(a.action),{role:p.role,iconName:p.icon??null}))));
 return node;
}

/** The choice a right swipe on an open question picks: the first one the card offers; none once it is answered. */
export const swipeChoice=q=>q?.actions?.[0]??null;
/** The 18px icon before each "Which one?" chip: what choosing it does. */
export const choiceIcon=action=>({remove:'delete',complete:'check_circle'})[action]??'arrow_forward';
/** The 18px icon before each answer chip of a field question: the kind of value it sets. */
export const answerIcon=field=>({time:'schedule',minutes:'timer',blockId:'target',recurrence:'repeat',alert:'notifications',title:'edit'})[field]??'chat_bubble';

/**
 * "Which one?": the question, the words it answers, and one chip per choice, each led by what choosing does. A tap
 * answers it with no model call; a right swipe on the card answers with the first chip, outlined so the pick is visible.
 */
export function questionCard(capture,on){
 const q=capture.clarification,node=card('question');
 node.append(kicker(NEED.question,{name:'help',tone:'change'}),el('p','card-title',q.prompt));
 if(capture.draft?.lines?.length)node.append(lines(capture.draft.lines));
 node.append(words(capture.raw));
 const chips=el('div','chips');
 const first=swipeChoice(q);
 for(const a of q.actions){
  const chip=el('button','chip');
  chip.type='button';
  chip.setAttribute('aria-label',`Choose ${a.label}`);
  if(a===first)chip.classList.add('chip-first');
  chip.append(icon(choiceIcon(q.action)),el('span','',a.label));
  chip.addEventListener('click',()=>on.choose(a.action));
  chips.append(chip);
 }
 node.append(chips);
 if(first)attachSwipe(node,{right:{kind:'choose',word:first.label,symbol:choiceIcon(q.action),run:()=>on.choose(first.action)}});
 return node;
}

/** A plain-text answer, grounded in the plan snapshot. Paragraphs only; never markup from the model. */
export function answerText(reply){
 const box=el('div','card-text');
 for(const para of String(reply??'').split(/\n{2,}/).map(p=>p.trim()).filter(Boolean))box.append(el('p','',para));
 return box;
}

