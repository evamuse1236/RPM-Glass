import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFakeDom,FakeElement} from './fake-dom.mjs';
import {installForming} from './capture-forming.mjs';
import {createChipCard} from './capture-chip-card.mjs';
import {localDay} from './planner-state.mjs';

installFakeDom();
const said='call mom at 8pm and buy milk tomorrow';
const titles=host=>host.querySelectorAll('.forming-title').map(n=>n.textContent);

function screen(){
 const host=new FakeElement('div'),content=new FakeElement('div');
 const forming=installForming({host,platform:{},conversationId:()=>'c1'});
 forming.update(said,{enabled:false,visible:true});
 return {host,content,forming};
}

function receipt(content,rows){
 const lines=rows.map(([opId,title])=>({verb:'Added',entity:'task',id:opId,title,edit:{opId,missing:[]}}));
 const chips=createChipCard({act:async()=>({ok:true}),refresh:()=>{},choices:()=>({blocks:[],projects:[],goals:[],areas:[]}),today:localDay});
 const card=new FakeElement('section');card.className='card enter';
 card.append(chips.items({draft:{id:'d1',conversationId:'c1',lines,edits:[]}},card));
 content.replaceChildren(card);
 return card;
}

test('the cards formed while typing stay on screen after Send, with no waiting card',()=>{
 const s=screen();
 const before=s.host.children.slice();
 assert.ok(before.length>0);
 assert.equal(s.forming.hold(said),true);
 s.forming.update('',{enabled:false,visible:true});
 assert.deepEqual(s.host.children,before,'the same cards are kept, not redrawn');
 assert.deepEqual(titles(s.host),['Call mom and buy milk']);
 assert.equal(s.host.getAttribute('aria-busy'),'true');
 assert.doesNotMatch(s.host.textContent,/Reading them now|Saving your words/);
});

test('streamed operations rename a held card in place and add the cards the model splits out',()=>{
 const s=screen();
 s.forming.hold(said);
 const first=s.host.children[0];
 s.forming.fill([{opId:'o1',kind:'create',entity:'task',title:'Call mom',time:'8pm',minutes:null}]);
 assert.equal(s.host.children[0],first,'the card is filled in place');
 assert.deepEqual(titles(s.host),['Call mom']);
 assert.match(first.textContent,/8:00\sPM/);
 s.forming.fill([
  {opId:'o1',kind:'create',entity:'task',title:'Call mom',time:'8pm',minutes:null},
  {opId:'o2',kind:'create',entity:'task',title:'Buy milk',time:'tomorrow',minutes:15},
 ]);
 assert.equal(s.host.children[0],first);
 assert.deepEqual(titles(s.host),['Call mom','Buy milk']);
 assert.match(s.host.children[1].textContent,/15 min/);
});

test('when the receipt is ready the held cards hand over to its saved rows, in order',()=>{
 const s=screen();
 s.forming.hold(said);
 s.forming.fill([{opId:'o1',kind:'create',entity:'task',title:'Call mom',time:'8pm',minutes:null},{opId:'o2',kind:'create',entity:'task',title:'Buy milk',time:null,minutes:null}]);
 const land=s.forming.lift();
 const card=receipt(s.content,[['o1','Call mom'],['o2','Buy milk']]);
 assert.equal(land(s.content),true);
 assert.equal(s.host.children.length,0,'no unsaved copy is left behind');
 assert.equal(s.host.getAttribute('aria-busy'),null);
 assert.deepEqual(card.querySelectorAll('.item-title').map(n=>n.textContent),['Call mom','Buy milk']);
 assert.ok(card.classList.contains('kept'),'the saved card does not enter a second time');
});

test('a held card the model dropped leaves; with nothing streamed the cards still hand over by order',()=>{
 const s=screen();
 s.forming.hold('Buy milk. Call the bank about the card');
 assert.equal(s.host.children.length,2);
 const land=s.forming.lift();
 receipt(s.content,[['x1','Buy milk']]);
 assert.equal(land(s.content),true);
 assert.equal(s.host.children.length,0);
});

test('with no AI key the cards stay after the words are saved, until new words are typed',()=>{
 const s=screen();
 s.forming.hold(said);
 const kept=s.host.children.slice();
 const land=s.forming.lift();
 const card=new FakeElement('section');card.className='card enter failure';
 s.content.replaceChildren(card);
 assert.equal(land(s.content,{keep:true}),false);
 assert.deepEqual(s.host.children,kept,'the same cards stay');
 assert.equal(s.host.getAttribute('aria-busy'),null);
 s.forming.update('',{enabled:false,visible:true});
 assert.deepEqual(s.host.children,kept,'an empty field does not clear them');
 s.forming.update('water the plants tonight',{enabled:false,visible:true});
 assert.deepEqual(titles(s.host),['Water the plants']);
});

test('a failed send lets the cards form again from the words put back',()=>{
 const s=screen();
 s.forming.hold(said);
 s.forming.release();
 assert.equal(s.host.getAttribute('aria-busy'),null);
 s.forming.update(said,{enabled:false,visible:true});
 assert.deepEqual(titles(s.host),['Call mom and buy milk']);
 s.forming.update('',{enabled:false,visible:true});
 assert.equal(s.host.children.length,0);
});

test('Capture no longer shows a waiting card after Send',()=>{
 const app=fs.readFileSync(new URL('./capture-app.mjs',import.meta.url),'utf8');
 const cards=fs.readFileSync(new URL('./capture-cards.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(app,/pendingCard|Reading them now/);
 assert.doesNotMatch(cards,/pendingCard|Reading them now|Saving your words/);
 assert.match(app,/type==='partial'/);
 assert.match(app,/keep:wordsOnly\(request\)/);
});
