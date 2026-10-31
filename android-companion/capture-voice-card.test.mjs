import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {wordStream,openTarget,spine} from './capture-voice-card.mjs';
import {voiceCard} from './capture-voice.mjs';

installFakeDom();
const settle=ms=>new Promise(r=>setTimeout(r,ms));

test('heard words arrive in a burst but stream in one at a time, each its own blurring word', async () => {
 const p=document.createElement('p'),words=wordStream(p,{every:20,reduced:()=>false});
 words.set('','Start talking.');
 assert.equal(p.textContent,'Start talking.');
 words.set('Call mom at eight');
 await settle(0);
 assert.equal(p.textContent,'Call ','the first word shows alone');
 await settle(90);
 assert.equal(p.textContent,'Call mom at eight');
 assert.equal(p.querySelectorAll('.w').length,4);
 words.set('Call mom at eight tomorrow');
 await settle(30);
 assert.equal(p.querySelectorAll('.w').length,5,'only the new word is added');
});

test('a transcript that rewrites its words, or Reduce Motion, shows the text at once', () => {
 const p=document.createElement('p'),words=wordStream(p,{reduced:()=>false});
 words.set('Call Ma');words.set('Call mom');
 assert.equal(p.textContent,'Call mom');
 const q=document.createElement('p');
 wordStream(q,{reduced:()=>true}).set('Call mom at eight');
 assert.equal(q.textContent,'Call mom at eight');
});

test('Edit opens a task, Block or Project in the planner, never a row that went to the Trash', () => {
 assert.deepEqual(openTarget({entity:'task',id:'12',verb:'Added'}),{collection:'tasks',id:12});
 assert.deepEqual(openTarget({entity:'block',id:'b-1',verb:'New Block'}),{collection:'blocks',id:'b-1'});
 assert.equal(openTarget({entity:'task',id:7,verb:'Moved to Trash'}),null);
 assert.equal(openTarget({entity:'task',id:null,verb:'Added'}),null);
});

const rows=[{verb:'Added',entity:'task',id:1,title:'Call mom',when:'Tomorrow, 8:00 PM',alert:'reminder'},
 {verb:'Done',entity:'task',id:2,title:'Call Raj'},{verb:'Moved to Trash',entity:'task',id:3,title:'Buy groceries'}];
const capture={messageId:'m',reply:'Done.',voice:{undoEvent:'e',undone:false}};
const byLabel=(node,label)=>[...node.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label);
const labels=node=>[...node.querySelectorAll('.voice-head .voice-actions button')].map(b=>b.getAttribute('aria-label'));

test('the receipt has Discard, Edit and Open planner as labelled symbols in its header, no bottom row, and Discard undoes this ramble', () => {
 const opened=[],discarded=[];
 const node=voiceCard(capture,{rows,discard:id=>discarded.push(id),openPlanner:()=>opened.push('planner'),openItem:t=>opened.push(t)});
 assert.deepEqual(labels(node),['Discard this ramble','Edit the changes','Open planner']);
 const head=node.querySelector('.voice-head');
 assert.equal(head.closest('.voice-scroll'),null,'the header stays pinned while the card scrolls');
 assert.ok(head.querySelector('.voice-title').textContent.length>0,'the tally leads the header');
 const buttons=[...head.querySelectorAll('.voice-actions button')];
 assert.deepEqual(buttons.map(b=>b.querySelector('.ms').textContent),['undo','edit_square','arrow_outward']);
 assert.equal(buttons[2].className.includes('primary'),true,'Open planner is the filled primary');
 assert.equal(buttons.slice(0,2).every(b=>b.className.includes('tonal')),true,'Discard and Edit are tonal');
 for(const old of ['.voice-dock','.voice-tools','.voice-top','.voice-stop','.actions','.orb'])assert.equal(node.querySelector(old),null,`no ${old}`);
 const outside=[...node.querySelectorAll('button')].filter(b=>!b.closest('.voice-head'));
 assert.ok(outside.every(b=>b.className.includes('spine-open')),'the only other buttons are the spine rows');
 assert.ok(node.querySelector('.voice-scroll .voice-sentence'),'the sentence sits under the header');
 assert.equal(node.classList.contains('enter'),false,'it grows from the live card instead of fading in');
 byLabel(node,'Discard this ramble').click();
 assert.deepEqual(discarded,['m']);
 byLabel(node,'Open planner').click();
 assert.deepEqual(opened,['planner']);
});

test('with several changes, Edit turns the rows into buttons; a tap opens that task in the planner', () => {
 const opened=[];
 const node=voiceCard(capture,{rows,discard(){},openPlanner(){},openItem:t=>opened.push(t)});
 const [mom]=node.querySelectorAll('.spine-open');
 mom.click();
 assert.deepEqual(opened,[],'rows do nothing until Edit');
 byLabel(node,'Edit the changes').click();
 assert.equal(node.classList.contains('editing'),true);
 mom.click();
 assert.deepEqual(opened,[{collection:'tasks',id:1}]);
 assert.equal(node.querySelectorAll('.spine-open').length,2,'the Trash row is not editable');
});

test('with one editable change, Edit opens it straight away; a discarded ramble keeps only Open planner', () => {
 const opened=[];
 const one=voiceCard(capture,{rows:rows.slice(0,1),discard(){},openPlanner(){},openItem:t=>opened.push(t)});
 byLabel(one,'Edit the changes').click();
 assert.deepEqual(opened,[{collection:'tasks',id:1}]);
 const gone=voiceCard({...capture,voice:{undoEvent:'e',undone:true}},{rows,discard(){},openPlanner(){},openItem(){}});
 assert.deepEqual(labels(gone),['Open planner']);
 assert.equal(gone.querySelector('.voice-title').textContent,'Discarded');
 assert.equal(gone.querySelector('.voice-sentence').textContent,'Your words are kept in History.');
 assert.equal(gone.classList.contains('discarded'),true);
});
