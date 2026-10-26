import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFakeDom,FakeElement} from './fake-dom.mjs';
import {createChipCard,FULL_ITEMS,SHOWN_ITEMS} from './capture-chip-card.mjs';
import {localDay} from './planner-state.mjs';

installFakeDom();
const today=localDay();
const at=(day,time)=>new Date(`${day}T${time}`).toISOString();
const task=(id,edit={},title='Call mom')=>({verb:'Added',entity:'task',id,title,edit:{opId:`o${id}`,missing:[],...edit}});
const choices={blocks:[{id:'b1',title:'Family',subtitle:'Health'}],projects:[],goals:[],areas:[]};

/** One receipt card wired the way capture-app wires it: every refresh rebuilds the card from the capture. */
function harness(lines,{result=()=>({ok:true}),edits=[]}={}){
 const capture={draft:{id:'d1',conversationId:'c1',lines,edits}};
 const sent=[];
 let resolve;
 const act=payload=>{sent.push(payload);return new Promise(r=>{resolve=()=>r(result(payload));});};
 const h={capture,sent,card:null,settle:()=>resolve()};
 const render=()=>{h.card=new FakeElement('section');h.card.className='card';h.card.append(h.chips.items(capture,h.card));};
 h.chips=createChipCard({act,refresh:render,choices:()=>choices,today:()=>today});
 h.render=render;
 render();
 h.chip=(key,item=0)=>h.card.querySelectorAll('li.chip-item')[item].querySelector(`.edit-chip[data-chip=${key}]`);
 h.tray=(item=0)=>h.card.querySelectorAll('li.chip-item')[item].querySelector('.chip-tray');
 return h;
}
const label=node=>node.querySelector('.chip-label').textContent;

test('a created reminder shows its kind icon, title and chips filled, empty and lit',()=>{
 const h=harness([task(1,{planned:at(today,'18:00'),alert:'reminder'})]);
 const head=h.card.querySelector('.item-head');
 assert.equal(head.querySelector('.ms').textContent,'add_task');
 assert.equal(head.querySelector('.item-title').textContent,'Call mom');
 assert.equal(head.getAttribute('aria-label'),'Task: Call mom. Change title');
 assert.ok(h.chip('time').classList.contains('filled'));
 assert.match(label(h.chip('time')),/^6\sPM$/);
 assert.ok(h.chip('alert').classList.contains('lit'));
 assert.ok(h.chip('alert').querySelector('.ms').classList.contains('fill'),'a lit chip has a filled icon');
 assert.ok(h.chip('repeat').classList.contains('empty'));
 assert.equal(label(h.chip('repeat')),'Add repeat');
 assert.equal(h.chip('time').getAttribute('aria-expanded'),'false');
 assert.equal(h.tray().inert,true,'a closed tray takes no focus');
});

test('a chip tap opens its tray in place and a second tap closes it',()=>{
 const h=harness([task(1,{planned:at(today,'18:00')})]);
 const time=h.chip('time');
 time.click();
 assert.ok(time.classList.contains('open')); assert.equal(time.getAttribute('aria-expanded'),'true');
 assert.equal(h.tray().inert,false); assert.ok(h.tray().classList.contains('open'));
 assert.equal(h.tray().querySelectorAll('.tray-pick').length,4);
 assert.ok(h.tray().querySelector('input.time-range'));
 assert.equal(h.chips.held('d1'),true,'a touched receipt no longer closes by itself');
 time.click();
 assert.equal(h.tray().inert,true); assert.equal(time.classList.contains('open'),false);
 h.chip('day').click();
 assert.equal(h.tray().querySelector('.tiles.tray-picks')?.children.length,8,'the day tray is the planner day strip plus No day');
 assert.equal(h.chips.closeTray(),true,'Back closes an open tray first');
 assert.equal(h.chips.closeTray(),false);
});

test('a tap in the card outside the tray closes it, a tap inside keeps it',()=>{
 const h=harness([task(1,{planned:at(today,'18:00')})]);
 h.chip('repeat').click();
 h.tray().querySelector('.tray-inner').click();
 assert.equal(h.tray().inert,false);
 h.card.click();
 assert.equal(h.tray().inert,true);
});

test('a pick saves at once through edit-item, shows the new value while saving, then pops',async()=>{
 const h=harness([task(1,{planned:at(today,'18:00')})]);
 h.chip('time').click();
 const pick=[...h.tray().querySelectorAll('.tray-pick')].find(b=>/^7\sPM$/.test(b.textContent));
 pick.click();
 assert.deepEqual({...h.sent[0],label:undefined},{kind:'edit-item',conversationId:'c1',draftId:'d1',entity:'task',id:'1',field:'time',value:`${today} 19:00`,label:undefined});
 assert.match(h.sent[0].label,/^Time set to 7\sPM$/);
 assert.ok(h.chip('time').classList.contains('saving'));
 assert.match(label(h.chip('time')),/^7\sPM$/);
 h.settle(); await new Promise(r=>setImmediate(r));
 assert.ok(h.chip('time').classList.contains('pop'));
 h.render();
 assert.equal(h.chip('time').classList.contains('pop'),false,'the pop plays once');
});

test('a failed save marks the chip and keeps the value it had',async()=>{
 const h=harness([task(1,{planned:at(today,'18:00')})],{result:()=>null});
 h.chip('alert').click();
 [...h.tray().querySelectorAll('.tray-pick')].find(b=>b.textContent==='Alarm').click();
 h.settle(); await new Promise(r=>setImmediate(r));
 assert.ok(h.chip('alert').classList.contains('failed'));
 assert.equal(label(h.chip('alert')),'Add alert');
});

test('tapping the value a field already has only closes the tray',()=>{
 const h=harness([task(1,{planned:at(today,'18:00'),alert:'reminder'})]);
 h.chip('alert').click();
 [...h.tray().querySelectorAll('.tray-pick')].find(b=>b.textContent==='Reminder').click();
 assert.equal(h.sent.length,0); assert.equal(h.tray().inert,true);
});

test('the title edits in place: Enter saves the words, Escape keeps the old title',()=>{
 const h=harness([task(1,{})]);
 h.card.querySelector('.item-head').click();
 const field=h.card.querySelector('textarea.item-title-edit');
 assert.equal(field.value,'Call mom');
 field.dispatch('keydown',{key:'Escape'});
 assert.equal(h.sent.length,0); assert.ok(h.card.querySelector('.item-head'));
 h.card.querySelector('.item-head').click();
 const again=h.card.querySelector('textarea.item-title-edit');
 again.value='Call mom about Sunday';
 again.dispatch('keydown',{key:'Enter'});
 again.dispatch('blur');
 assert.equal(h.sent.length,1,'Enter then blur saves once');
 assert.equal(h.sent[0].field,'title'); assert.equal(h.sent[0].value,'Call mom about Sunday');
});

test('the change row undoes only the newest edit, and hides once another change is newer',()=>{
 const edits=[{undoId:'e1',entity:'task',id:'1',field:'time',label:'Time set to 7 PM'}];
 const h=harness([task(1,{})],{edits});
 const row=h.chips.changeRow(h.capture,'e1');
 assert.equal(row.getAttribute('role'),'status');
 assert.equal(row.querySelector('.change-label').textContent,'Time set to 7 PM');
 const undo=row.querySelector('button');
 assert.equal(undo.getAttribute('aria-label'),'Undo time change');
 undo.click();
 assert.deepEqual(h.sent[0],{kind:'undo-edit',conversationId:'c1',draftId:'d1',undoId:'e1'});
 assert.equal(h.chips.changeRow(h.capture,'u-capture'),null,'the capture Undo is newer');
 edits[0].undone=true;
 assert.equal(h.chips.changeRow(h.capture,'e1'),null);
});

test('items after the third are compact rows, and after the sixth a "+N more" row',()=>{
 const rows=Array.from({length:8},(_,i)=>task(i+1,{},`Task ${i+1}`));
 const h=harness(rows);
 const items=[...h.card.querySelectorAll('ul.chip-items > li')];
 assert.equal(items.filter(li=>!li.classList.contains('compact')).length,FULL_ITEMS);
 assert.equal(items.length,SHOWN_ITEMS+1);
 assert.equal(items.at(-1).textContent,`+${rows.length-SHOWN_ITEMS} more`);
 const compact=items[FULL_ITEMS].querySelector('button.item-compact');
 assert.equal(compact.getAttribute('aria-label'),'Task: Task 4. Show details');
 compact.click();
 h.render();
 assert.equal([...h.card.querySelectorAll('ul.chip-items > li')].filter(li=>!li.classList.contains('compact')).length,FULL_ITEMS+1,'an opened item stays open');
 [...h.card.querySelectorAll('ul.chip-items > li')].at(-1).querySelector('button').click();
 h.render();
 assert.equal(h.card.querySelectorAll('ul.chip-items > li').length,rows.length);
});

test('chip styles never wrap a label, keep the three states apart and show no scrollbar',()=>{
 const css=fs.readFileSync(new URL('./capture-chips.css',import.meta.url),'utf8');
 assert.match(css,/\.edit-chip\{[^}]*white-space:nowrap/);
 assert.match(css,/\.edit-chip \.chip-label\{[^}]*text-overflow:ellipsis/);
 for(const state of ['empty','lit','open','failed','saving','pop'])assert.match(css,new RegExp(`\\.edit-chip\\.${state}[,{ ]`),state);
 assert.match(css,/\.tray-picks\.long\{[^}]*scrollbar-width:none/);
 assert.doesNotMatch(css,/position:fixed|backdrop/,'the tray opens in place with no scrim');
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/href="\/capture-chips\.css"/);
});
