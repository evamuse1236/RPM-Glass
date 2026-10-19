/** A Capture card's changed items, read at a glance: a glyph for what happened, the title, then icon chips for the facts. */
import {el,icon} from './capture-dom.mjs';
import {captureDuration} from './capture-content.mjs';

const GLYPH={Added:'add_task',New:'add_task','New Block':'stacks','New Project':'folder','New Goal':'flag','New Area':'category',
 Done:'check_circle','Moved to Trash':'delete',Trash:'delete',Restored:'restore_from_trash',Reopened:'replay',
 Renamed:'edit',Changed:'edit_note',Change:'edit_note','Set aside':'inventory_2','Alarm off':'alarm_off'};

/** "Today, 10:30 AM" → {day:'Today', time:'10:30 AM'}; "Tue 20 Oct" → {day:'Tue 20 Oct', time:null}. */
export function splitWhen(text){
 if(!text)return {day:null,time:null};
 const at=text.lastIndexOf(', ');
 if(at>0&&/\d/.test(text.slice(at+2)))return {day:text.slice(0,at),time:text.slice(at+2)};
 return {day:text,time:null};
}

function glyphOf(row){
 if(row.verb==='Moved')return row.was?'event_upcoming':'drive_file_move';
 return GLYPH[row.verb]??'edit_note';
}

function fact(symbol,now,before=null,cls=''){
 const chip=el('li',['fact',cls].filter(Boolean).join(' '));
 chip.append(icon(symbol));
 if(before&&before!==now&&!/^No /.test(before)){chip.append(el('s','fact-was',before),el('span','fact-now',now));chip.setAttribute('aria-label',`${before}, changed to ${now}`);}
 else chip.append(el('span','fact-now',now));
 return chip;
}

/** Fixed order: day, time, length, Block, alert. A move shows the old value struck before the new one. */
export function factsOf(row){
 const now=splitWhen(row.when),was=row.was?splitWhen(row.was):{day:null,time:null};
 const list=[];
 if(now.day||was.day)list.push(fact('event',now.day??'No date',row.was?was.day??'No date':null));
 if(now.time||was.time)list.push(fact('schedule',now.time??'No time',row.was?was.time??'No time':null));
 if(row.minutes)list.push(fact('timer',captureDuration(row.minutes)));
 if(row.where)list.push(fact(row.where==='Inbox'?'inbox':'stacks',row.where));
 if(row.alert)list.push(fact(row.alert==='alarm'?'alarm':'notifications',row.alert==='alarm'?'Alarm':'Reminder'));
 return list;
}

export function line(row){
 const item=el('li','line');
 const glyph=el('span','line-glyph');
 glyph.append(icon(glyphOf(row)));
 glyph.setAttribute('role','img');
 glyph.setAttribute('aria-label',row.verb);
 const body=el('div','line-body');
 body.append(el('p','line-title',row.title||'Untitled'));
 if(row.renamedFrom)body.append(el('s','line-was',row.renamedFrom));
 const facts=factsOf(row);
 if(row.must){const must=el('li','fact fact-must');must.append(icon('star',{fill:true}),el('span','fact-now','Must'));facts.unshift(must);}
 if(facts.length){const list=el('ul','facts');list.append(...facts);body.append(list);}
 item.append(glyph,body);
 return item;
}

export function lines(rows){
 const list=el('ul','lines');
 list.append(...rows.map(line));
 return list;
}

/** "3 added", "Added", or "2 changes" when the verbs differ. */
export function tally(rows){
 const verbs=new Set(rows.map(r=>r.verb));
 if(rows.length===1)return rows[0].verb;
 return verbs.size===1?`${rows.length} ${rows[0].verb.toLowerCase()}`:`${rows.length} changes`;
}
