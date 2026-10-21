import {clock,duration,relativeDay} from './planner/format.mjs';
import {dayChips,whenOf} from './planner/task-values.mjs';

export const KIND_ICON={task:'add_task',block:'stacks',project:'folder',goal:'flag',area:'category'};
export const NOUN={time:'time',minutes:'length',blockId:'Block',recurrence:'repeat',alert:'alert',must:'must',purpose:'purpose',title:'title',projectId:'Project',goalId:'Goal',areaId:'Area'};
export const MAX_LABEL=14;
export const MAX_EMPTY=2;
export const TIME_RANGE=Object.freeze({min:360,max:1380,step:15});
const NAME={must:'Must',day:'Day',time:'Time',alert:'Alert',repeat:'Repeat',block:'Block',length:'Length',purpose:'Purpose',project:'Project',goal:'Goal',area:'Area',title:'Title'};
const REPEAT={daily:'Daily',weekdays:'Weekdays',weekly:'Weekly'};
const ALERT={off:'Off',reminder:'Reminder',alarm:'Alarm'};
const PRESET_TIMES=['09:00','12:00','15:00','19:00'];
const LENGTHS=[15,30,45,60,120];
const FIELD_KEY={time:'time',blockId:'block',alert:'alert',recurrence:'repeat',purpose:'purpose',projectId:'project',goalId:'goal',areaId:'area'};
const EMPTY_ORDER=['time','block','alert','repeat','day'];
const LIST={block:['blocks','Inbox'],project:['projects','None'],goal:['goals','None'],area:['areas','None']};

/** A chip label never runs past 14 characters; a longer name ends in an ellipsis. */
export function short(text){
 const s=String(text??'').trim();
 return s.length>MAX_LABEL?s.slice(0,MAX_LABEL-1).trimEnd()+'…':s;
}
const pad=n=>String(n).padStart(2,'0');
export const hhmm=minutes=>`${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
export const minutesOf=time=>{const [h,m]=String(time).split(':').map(Number);return h*60+m;};
/** "7 PM" for a whole hour, "7:30 PM" otherwise; a 24-hour locale keeps its own form. */
export function timeLabel(day,time){
 return clock(new Date(`${day}T${time}`)).replace(/:00(?=\s)/,'');
}

function chip(key,field,iconName,label,state='filled',extra={}){
 const full=String(label);
 return {key,field,icon:iconName,label:short(full),state,aria:state==='empty'?full:`${NAME[key]}: ${full}. Change`,...extra};
}
const titleIn=(list,id)=>list?.find(x=>String(x.id)===String(id))?.title;
const purposeChip=e=>e.purpose?chip('purpose','purpose','favorite',e.purpose):chip('purpose','purpose','favorite','Add purpose','empty');
const readOnly=(key,iconName,title)=>title?[chip(key,null,iconName,title,'filled',{readOnly:true,aria:`${NAME[key]}: ${title}`})]:[];
const link=(key,field,iconName,id,title)=>id!=null?chip(key,field,iconName,title??NAME[key]):chip(key,field,iconName,`Add ${NAME[key]}`,'empty');

function taskChips(e,choices){
 const {day,time}=whenOf(e),missing=new Set(e.missing??[]);
 const all=[];
 if(e.must)all.push(chip('must','must','star','Must','filled',{tone:'must'}));
 all.push(day?chip('day','time','event',relativeDay(day)):chip('day','time','event','Add day','empty'));
 all.push(time?chip('time','time','schedule',timeLabel(day,time)):chip('time','time','schedule','Add time','empty'));
 if(time)all.push(e.alert&&e.alert!=='off'?chip('alert','alert',e.alert==='alarm'?'alarm':'notifications',ALERT[e.alert]??'Reminder','lit'):chip('alert','alert','notifications','Add alert','empty'));
 all.push(e.recurrence?chip('repeat','recurrence','repeat',REPEAT[e.recurrence]??'Repeats'):chip('repeat','recurrence','repeat','Add repeat','empty'));
 if(missing.has('blockId'))all.push(chip('block','blockId','stacks','Add Block','empty'));
 else all.push(e.blockId!=null?chip('block','blockId','stacks',titleIn(choices?.blocks,e.blockId)??'Block'):chip('block','blockId','inbox','Inbox'));
 if(e.minutes!=null)all.push(chip('length','minutes','timer',duration(e.minutes)));
 const empties=new Set([...new Set([...[...missing].map(f=>FIELD_KEY[f]).filter(Boolean),...EMPTY_ORDER])]
  .filter(k=>all.some(c=>c.key===k&&c.state==='empty')).slice(0,MAX_EMPTY));
 return all.filter(c=>c.state!=='empty'||empties.has(c.key));
}

/** The chips under one created item, in the order Must, Day, Time, Alert, Repeat, Block, Length (a task) or Purpose then links. */
export function chipsFor(row,{choices}={}){
 const e=row?.edit;
 if(!e)return [];
 if(row.entity==='task')return taskChips(e,choices);
 if(row.entity==='block')return [purposeChip(e),link('project','projectId','folder',e.projectId,titleIn(choices?.projects,e.projectId)??e.project),...readOnly('area','category',e.area)];
 if(row.entity==='project')return [purposeChip(e),link('goal','goalId','flag',e.goalId,titleIn(choices?.goals,e.goalId)??e.goal),...readOnly('area','category',e.area)];
 if(row.entity==='goal')return [purposeChip(e),link('area','areaId','category',e.areaId,titleIn(choices?.areas,e.areaId)??e.area)];
 if(row.entity==='area')return [purposeChip(e)];
 return [];
}

const pick=(label,choice,current,aria=label)=>({label:short(label),choice,current,aria});

/** What a chip's tray offers: pick chips, a time slider, or a text field. */
export function trayOptions(key,row,{choices,today}={}){
 const e=row?.edit??{};
 const {day,time}=whenOf(e);
 if(key==='day')return {type:'pick',options:[...dayChips(today,day).map(c=>pick(c.label,c.day,c.day===day,c.aria||c.label)),pick('No day',null,!day)]};
 if(key==='time')return {type:'time',options:PRESET_TIMES.map(t=>pick(timeLabel(day||today,t),t,t===time)),
  range:{...TIME_RANGE,value:Math.min(TIME_RANGE.max,Math.max(TIME_RANGE.min,time?minutesOf(time):19*60))}};
 if(key==='alert')return {type:'pick',options:Object.entries(ALERT).map(([v,l])=>pick(l,v,(e.alert||'off')===v))};
 if(key==='repeat')return {type:'pick',options:[pick('Never',null,!e.recurrence),...Object.entries(REPEAT).map(([v,l])=>pick(l,v,e.recurrence===v))]};
 if(key==='length')return {type:'pick',options:[...LENGTHS.map(m=>pick(duration(m),m,e.minutes===m)),pick('None',null,e.minutes==null)]};
 if(key==='must')return {type:'pick',options:[pick('Must',true,!!e.must),pick('Not a must',false,!e.must)]};
 if(key==='purpose'||key==='title')return {type:'text',value:key==='title'?row.title??'':e.purpose??''};
 const list=LIST[key];
 if(!list)return {type:'pick',options:[]};
 const field=key==='block'?'blockId':`${key}Id`;
 return {type:'pick',options:[pick(list[1],null,e[field]==null),...(choices?.[list[0]]??[]).map(x=>pick(x.title,x.id,String(x.id)===String(e[field]),x.subtitle?`${x.title}, ${x.subtitle}`:x.title))]};
}

/** The edit-item fields for one choice, with the words the change row shows ("Time set to 7 PM"). */
export function editPayload(key,row,choice,{choices,today}={}){
 const e=row?.edit??{};
 const {day}=whenOf(e);
 const clear=field=>({field,clear:true});
 switch(key){
  case 'day':return choice==null?{...clear('time'),label:'Day cleared'}:{field:'time',value:choice,label:`Day set to ${relativeDay(choice)}`};
  case 'time':return {field:'time',value:`${day||today} ${choice}`,label:`Time set to ${timeLabel(day||today,choice)}`};
  case 'alert':return {field:'alert',value:choice,label:choice==='off'?'Alert off':`Alert set to ${ALERT[choice]}`};
  case 'repeat':return choice==null?{...clear('recurrence'),label:'Repeat off'}:{field:'recurrence',value:choice,label:`Repeats ${REPEAT[choice].toLowerCase()}`};
  case 'length':return choice==null?{...clear('minutes'),label:'Length cleared'}:{field:'minutes',value:choice,label:`Length set to ${duration(choice)}`};
  case 'must':return {field:'must',value:!!choice,label:choice?'Marked as a must':'No longer a must'};
  case 'purpose':case 'title':{
   const text=String(choice??'').trim();
   return text?{field:key,value:text,label:key==='title'?'Title changed':'Purpose set'}:{...clear(key),label:key==='title'?'Title kept':'Purpose cleared'};
  }
 }
 const list=LIST[key];
 if(!list)return null;
 const field=key==='block'?'blockId':`${key}Id`;
 if(choice==null)return {...clear(field),label:key==='block'?'Moved to Inbox':`${NAME[key]} removed`};
 const title=titleIn(choices?.[list[0]],choice)??NAME[key];
 return {field,value:choice,label:key==='block'?`Moved to ${title}`:`${NAME[key]} set to ${title}`};
}

/** Whether a field's value is already what this choice would set, so a tap on it only closes the tray. */
export function isCurrent(key,row,choice,opts){
 const tray=trayOptions(key,row,opts);
 return tray.type!=='text'&&tray.options.some(o=>o.current&&o.choice===choice);
}
