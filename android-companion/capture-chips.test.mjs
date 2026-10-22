import test from 'node:test';
import assert from 'node:assert/strict';
import {chipsFor,trayOptions,editPayload,isCurrent,short,MAX_LABEL,MAX_EMPTY} from './capture-chips.mjs';
import {localDay,shiftDay} from './planner-state.mjs';

const today=localDay(),tomorrow=shiftDay(today,1);
const at=(day,time)=>new Date(`${day}T${time}`).toISOString();
const task=(edit,extra={})=>({verb:'Added',entity:'task',id:'t1',title:'Call mom',edit:{opId:'o',missing:[],...edit},...extra});
const choices={blocks:[{id:'b1',title:'Family time and errands',subtitle:'Health'}],projects:[{id:'p1',title:'Garden'}],goals:[{id:'g1',title:'Fit'}],areas:[{id:'a1',title:'Health'}]};
const keyed=chips=>Object.fromEntries(chips.map(c=>[c.key,c]));

test('a reminder task shows its day and time filled, the alert lit, and Inbox as a filled Block',()=>{
 const chips=chipsFor(task({planned:at(today,'18:00'),alert:'reminder'}),{choices});
 const c=keyed(chips);
 assert.deepEqual(chips.map(x=>x.key),['day','time','alert','repeat','block']);
 assert.equal(c.day.state,'filled'); assert.equal(c.day.label,'Today');
 assert.equal(c.time.state,'filled'); assert.match(c.time.label,/^6\sPM$/);
 assert.equal(c.alert.state,'lit'); assert.equal(c.alert.label,'Reminder'); assert.equal(c.alert.icon,'notifications');
 assert.equal(c.repeat.state,'empty'); assert.equal(c.repeat.label,'Add repeat');
 assert.equal(c.block.state,'filled'); assert.equal(c.block.label,'Inbox'); assert.equal(c.block.icon,'inbox');
 assert.match(c.time.aria,/^Time: 6\sPM\. Change$/);
});

test('an alarm is lit with the alarm icon, and a must leads with a starred chip',()=>{
 const c=keyed(chipsFor(task({planned:at(tomorrow,'07:30'),alert:'alarm',must:true,minutes:30,recurrence:'weekdays',blockId:'b1'}),{choices}));
 assert.equal(c.alert.icon,'alarm'); assert.equal(c.alert.state,'lit');
 assert.equal(c.must.tone,'must'); assert.equal(c.day.label,'Tomorrow');
 assert.match(c.time.label,/^7:30\sAM$/);
 assert.equal(c.repeat.label,'Weekdays'); assert.equal(c.length.label,'30 min');
 assert.equal(c.block.label.length<=MAX_LABEL,true); assert.ok(c.block.label.endsWith('…'));
 assert.equal(c.block.aria,'Block: Family time and errands. Change');
});

test('a task with nothing set shows at most two empty chips, missing fields first',()=>{
 const chips=chipsFor(task({missing:['blockId']}),{choices});
 const empty=chips.filter(c=>c.state==='empty').map(c=>c.key);
 assert.equal(empty.length,MAX_EMPTY);
 assert.deepEqual(empty,['time','block'],'shown in chip order');
 assert.deepEqual(chipsFor(task({missing:['recurrence']}),{choices}).filter(c=>c.state==='empty').map(c=>c.key),['time','repeat'],'a missing field wins a slot');
 assert.equal(chips.some(c=>c.key==='alert'),false,'no alert chip without a time');
 const plain=chipsFor(task({}),{choices}).filter(c=>c.state==='empty').map(c=>c.key);
 assert.deepEqual(plain,['time','repeat']);
});

test('every chip and tray label fits in 14 characters',()=>{
 assert.equal(short('A very long block name indeed').length,MAX_LABEL);
 const row=task({planned:at(today,'09:00'),blockId:'b1'});
 for(const c of chipsFor(row,{choices}))assert.ok(c.label.length<=MAX_LABEL,c.label);
 for(const key of ['day','time','alert','repeat','block','length','must']){
  for(const o of trayOptions(key,row,{choices,today}).options)assert.ok(o.label.length<=MAX_LABEL,`${key}: ${o.label}`);
 }
});

test('block, project, goal and area rows get Purpose and their links',()=>{
 const block=chipsFor({entity:'block',edit:{projectId:'p1',area:'Health'}},{choices});
 assert.deepEqual(block.map(c=>[c.key,c.state]),[['purpose','empty'],['project','filled'],['area','filled']]);
 assert.equal(block[2].readOnly,true); assert.equal(block[1].label,'Garden');
 const project=chipsFor({entity:'project',edit:{purpose:'Grow food'}},{choices});
 assert.deepEqual(project.map(c=>[c.key,c.state,c.label]),[['purpose','filled','Grow food'],['goal','empty','Add Goal']]);
 const goal=chipsFor({entity:'goal',edit:{areaId:'a1'}},{choices});
 assert.equal(goal[1].label,'Health'); assert.equal(goal[1].readOnly,undefined);
 assert.deepEqual(chipsFor({entity:'area',edit:{}}).map(c=>c.key),['purpose']);
 assert.deepEqual(chipsFor({entity:'task',title:'x'}),[],'a row without edit data has no chips');
});

test('trays offer the plan\'s choices with the current one marked',()=>{
 const row=task({planned:at(today,'19:00'),alert:'reminder',blockId:'b1'});
 const day=trayOptions('day',row,{choices,today});
 assert.equal(day.options.length,8); assert.equal(day.options.at(-1).label,'No day');
 assert.equal(day.options.find(o=>o.current).choice,today);
 const time=trayOptions('time',row,{choices,today});
 assert.equal(time.type,'time'); assert.equal(time.options.length,4);
 assert.equal(time.options.find(o=>o.current).choice,'19:00');
 assert.deepEqual(time.range,{min:360,max:1380,step:15,value:1140});
 assert.deepEqual(trayOptions('alert',row,{today}).options.map(o=>[o.label,o.current]),[['Off',false],['Reminder',true],['Alarm',false]]);
 assert.deepEqual(trayOptions('repeat',row,{today}).options.map(o=>o.label),['Never','Daily','Weekdays','Weekly']);
 const block=trayOptions('block',row,{choices,today});
 assert.deepEqual(block.options.map(o=>[o.choice,o.current]),[[null,false],['b1',true]]);
 assert.equal(block.options[1].aria,'Family time and errands, Health');
 assert.deepEqual(trayOptions('length',row,{today}).options.map(o=>o.choice),[15,30,45,60,120,null]);
 assert.deepEqual(trayOptions('purpose',{...row,edit:{...row.edit,purpose:'Stay close'}},{today}),{type:'text',value:'Stay close'});
 assert.equal(isCurrent('alert',row,'reminder',{today}),true);
 assert.equal(isCurrent('alert',row,'alarm',{today}),false);
});

test('each choice becomes the edit-item fields the backend saves, with change-row words',()=>{
 const row=task({planned:at(today,'18:00')});
 const time=editPayload('time',row,'19:00',{today});
 assert.equal(time.field,'time'); assert.equal(time.value,`${today} 19:00`); assert.match(time.label,/^Time set to 7\sPM$/);
 assert.deepEqual(editPayload('day',row,tomorrow,{today}),{field:'time',value:tomorrow,label:'Day set to Tomorrow'});
 assert.deepEqual(editPayload('day',row,null,{today}),{field:'time',clear:true,label:'Day cleared'});
 assert.deepEqual(editPayload('alert',row,'alarm'),{field:'alert',value:'alarm',label:'Alert set to Alarm'});
 assert.deepEqual(editPayload('repeat',row,null),{field:'recurrence',clear:true,label:'Repeat off'});
 assert.deepEqual(editPayload('repeat',row,'weekly'),{field:'recurrence',value:'weekly',label:'Repeats weekly'});
 assert.deepEqual(editPayload('length',row,45),{field:'minutes',value:45,label:'Length set to 45 min'});
 assert.deepEqual(editPayload('block',row,'b1',{choices}),{field:'blockId',value:'b1',label:'Moved to Family time and errands'});
 assert.deepEqual(editPayload('block',row,null,{choices}),{field:'blockId',clear:true,label:'Moved to Inbox'});
 assert.deepEqual(editPayload('purpose',row,'  Stay close  '),{field:'purpose',value:'Stay close',label:'Purpose set'});
 assert.deepEqual(editPayload('project',{entity:'block',edit:{}},'p1',{choices}),{field:'projectId',value:'p1',label:'Project set to Garden'});
 assert.equal(editPayload('nope',row,1),null);
 const noDay=task({});
 assert.equal(editPayload('time',noDay,'09:00',{today}).value,`${today} 09:00`,'a time with no day lands today');
});
