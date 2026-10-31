import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {wordStream,openTarget} from './capture-voice-card.mjs';
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

test('a row opens a task, Block or Project in the planner, never a row that went to the Trash', () => {
 assert.deepEqual(openTarget({entity:'task',id:'12',verb:'Added'}),{collection:'tasks',id:12});
 assert.deepEqual(openTarget({entity:'block',id:'b-1',verb:'New Block'}),{collection:'blocks',id:'b-1'});
 assert.equal(openTarget({entity:'task',id:7,verb:'Moved to Trash'}),null);
 assert.equal(openTarget({entity:'task',id:null,verb:'Added'}),null);
});

const rows=[{verb:'Added',entity:'task',id:1,title:'Call mom',when:'Tomorrow, 8:00 PM',alert:'alarm',where:'Family'},
 {verb:'Done',entity:'task',id:2,title:'Call Raj'},{verb:'Moved to Trash',entity:'task',id:3,title:'Buy groceries'}];
const capture={messageId:'m',reply:'Done.',voice:{undoEvent:'e',undone:false,canUndo:true}};
const rowOf=(node,title)=>[...node.querySelectorAll('.voice-row')].find(r=>r.querySelector('.voice-title').textContent===title);

test('a past voice capture is the table alone: no header, no tally, no Undo and no reply sentence', () => {
 const node=voiceCard(capture,{rows,openItem(){}});
 assert.equal(node.querySelector('.voice-head'),null);
 assert.equal(node.querySelectorAll('.voice-row').length,3);
 assert.doesNotMatch(node.textContent,/\d+ changes?|Undo|Discard|Done\./);
 const labels=[...node.querySelectorAll('button')].map(b=>b.getAttribute('aria-label'));
 assert.deepEqual(labels,['Call mom, Family, Tomorrow, 8:00 PM','Call Raj, Done'],'the only buttons are the rows');
});

test('a tap on a task row opens that task in the planner', () => {
 const opened=[];
 const node=voiceCard(capture,{rows,openItem:target=>opened.push(target)});
 rowOf(node,'Call mom').querySelector('button').click();
 assert.deepEqual(opened,[{collection:'tasks',id:1}]);
});

test('a row moved to the Trash stays in view, struck through and not a button', () => {
 const node=voiceCard(capture,{rows,openItem(){}});
 const row=rowOf(node,'Buy groceries');
 assert.ok(row.classList.contains('gone'));
 assert.equal(row.querySelector('button'),null);
 assert.equal(row.querySelector('.voice-item').tagName,'div');
 assert.equal(row.querySelector('.voice-note').textContent,'Moved to Trash');
});

test('the second line names a new task\'s Block or the verb, and an alarm shows its icon', () => {
 const node=voiceCard(capture,{rows,openItem(){}});
 assert.equal(rowOf(node,'Call mom').querySelector('.voice-note').textContent,'Family');
 assert.equal(rowOf(node,'Call mom').querySelector('.voice-alarm').hidden,false);
 assert.equal(rowOf(node,'Call Raj').querySelector('.voice-note').textContent,'Done');
 assert.equal(rowOf(node,'Call Raj').querySelector('.voice-alarm').hidden,true);
});

test('a discarded ramble, or one that changed nothing, says so in one quiet line', () => {
 assert.match(voiceCard({...capture,voice:{...capture.voice,undone:true}},{rows,openItem(){}}).textContent,/Discarded/);
 assert.match(voiceCard(capture,{rows:[],openItem(){}}).textContent,/Nothing changed/);
});
