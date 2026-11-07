import {el,icon,button} from './capture-dom.mjs';
import {card,answerText,alsoHeard} from './capture-cards.mjs';
import {clock,relativeDay,longDate} from './planner/format.mjs';
import {scheduleText} from './capture-content.mjs';
import {localDay} from './planner-state.mjs';

/** The gutter stacks the clock over its AM/PM ("10:00" over "AM"), so the column is only as wide as "12:00". */
function agendaTime(item){
 const text=item.start==null?'Any time':item.allDay?'All day':clock(item.start);
 const [,main,rest]=/^(.*?)(?:[\s ]+(\S+))?$/.exec(text);
 const node=el('span','agenda-time',main);
 if(rest)node.append(' ',el('span','agenda-meridiem',rest));
 return node;
}

/** A row's context line drops the Block when the row above already named it. */
function agendaRow(item,now,prev){
 const row=el('li',['agenda-row',item.kind==='event'?'event':'',item.done?'done':'',item.start<=now&&(item.end??item.start)>now?'now':''].filter(Boolean).join(' '));
 row.append(agendaTime(item));
 row.append(icon(item.kind==='event'?'event':item.done?'check_circle':'radio_button_unchecked',{cls:'agenda-mark'}));
 const body=el('div','agenda-body'),title=el('p','agenda-title',item.title);
 if(item.must){const star=icon('star',{fill:true,cls:'must-mark'});star.removeAttribute('aria-hidden');star.setAttribute('role','img');star.setAttribute('aria-label','Must');title.append(star);}
 body.append(title);
 const block=item.block&&item.block!==prev?.block?item.block:null;
 const sub=[item.end&&!item.allDay?`until ${clock(item.end)}`:null,block,item.kind==='event'?'Calendar':null].filter(Boolean).join(' · ');
 if(sub)body.append(el('p','quiet',sub));
 row.append(body);
 return row;
}

function agendaCard(agenda,{now}){
 const node=el('div','lines');
 const rows=[...agenda.timed,...agenda.anytime];
 if(!rows.length){node.append(el('p','quiet','Nothing planned yet.'));return node;}
 const list=el('ul','agenda');
 list.append(...rows.map((item,i)=>agendaRow(item,now,rows[i-1])));
 node.append(list);
 return node;
}

function nextCard(item,{now}){
 if(!item)return el('p','quiet','Nothing else is planned for today or tomorrow.');
 const node=el('div','lines');
 const day=relativeDay(localDay(new Date(item.start)));
 node.append(el('p','quiet',item.now?'Happening now':`Next: ${day==='Today'?'':day+', '}${clock(item.start)}`));
 node.append(el('p','card-title',item.title));
 const sub=[item.end?`until ${clock(item.end)}`:null,item.block,item.kind==='event'?'Calendar':null].filter(Boolean).join(' · ');
 if(sub)node.append(el('p','quiet',sub));
 return node;
}

function taskCard(task){
 if(!task)return el('p','quiet','That task is no longer in your plan.');
 const node=el('div','lines');
 node.append(el('p','card-title',task.title));
 const when=scheduleText(task.planned?{planned:task.planned}:task.plannedDate?{plannedDate:task.plannedDate}:null,{});
 const sub=[task.done?'Done':null,when??'No date',task.block??'Inbox',task.must?'Must':null].filter(Boolean).join(' · ');
 node.append(el('p','quiet',sub));
 return node;
}

function healthCard(kind,health){
 if(!health)return el('p','quiet','RPM isn’t tracking water or meals on this phone yet.');
 const node=el('div','lines');
 if(kind==='water'){
  node.append(el('p','big-number',`${health.water.glasses} of ${health.water.goal}`),el('p','quiet','glasses of water today'));
  return node;
 }
 if(!health.meals.length)node.append(el('p','quiet','No meals logged today.'));
 const list=el('ul','agenda');
 for(const m of health.meals){const row=el('li','agenda-row');row.append(el('span','agenda-time',m.slot),el('p','agenda-title',m.text||'Logged'));list.append(row);}
 if(health.meals.length)node.append(list);
 return node;
}

const HEADING={next:'Up next',water:'Water',meals:'Meals today'};

/**
 * An answer to a question: a pre-built card (day agenda, next item, a task, water, meals) when the model chose one,
 * read from the plan as it is now, with its short plain-text answer; otherwise the text alone.
 */
export function answerCard(capture,{platform,on,now=Date.now()}){
 const node=card('answer'),kind=capture.card?.kind??null;
 if(kind==='agenda'){
  const day=capture.card.day??localDay(new Date(now));
  const label=relativeDay(day);
  node.append(el('p','card-title day-title',label==='Today'||label==='Tomorrow'?`${label}, ${longDate(day).replace(/^\w+,?\s*/,'')}`:longDate(day)));
 }else if(kind==='task'){
  node.append(el('p','kicker','Task'));
 }else if(kind)node.append(el('p','card-title',HEADING[kind]));
 if(capture.reply)node.append(answerText(capture.reply));
 if(kind==='agenda'){
  const agenda=platform.agenda?.(capture.card.day)??{timed:[],anytime:[]};
  node.append(agendaCard(agenda,{now}));
 }
 if(kind==='next')node.append(nextCard(platform.next?.()??null,{now}));
 if(kind==='task')node.append(taskCard(platform.task?.(capture.card.targetId)??null));
 if(kind==='water'||kind==='meals')node.append(healthCard(kind,platform.health?.()??null));
 if(!kind&&!capture.reply)node.append(el('p','quiet','No answer came back. Your words are saved.'));
 const also=alsoHeard({...capture,notes:(capture.notes??[]).filter(n=>n.disposition!=='question')},on);
 if(also)node.append(also);
 if(kind==='agenda'||kind==='next'||kind==='task'){
  const row=el('div','card-actions');
  row.append(button('Open planner',on.openPlanner,{role:'text'}));
  node.append(row);
 }
 return node;
}
