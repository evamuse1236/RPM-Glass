import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {mergeVoiceRows,rowNote,voiceTable} from './capture-voice-table.mjs';

installFakeDom();
document.documentElement.dataset.reduceMotion='true';
const win={requestAnimationFrame:fn=>setTimeout(fn,0)};
const titleOf=row=>row.querySelector('.voice-title').textContent;

test('the same item changed by two requests is one row, in its first place, with the newer values and verb', () => {
 const rows=mergeVoiceRows([
  {request:1,rows:[{verb:'Added',entity:'task',id:7,title:'Call mom',when:'Today, 8:00 PM',where:'Family'},{verb:'Added',entity:'task',id:8,title:'Pay rent'}]},
  {request:2,rows:[{verb:'Changed',entity:'task',id:7,title:null,when:'Tomorrow, 9:00 AM'}]},
 ]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].key,'task:7');
 assert.equal(rows[0].title,'Call mom','a null field keeps the older value');
 assert.equal(rows[0].when,'Tomorrow, 9:00 AM','a newer field wins');
 assert.equal(rows[0].verb,'Changed');
 assert.deepEqual(rows[0].requests,[1,2]);
 assert.equal(rowNote(rows[0]),'Family','a task the call added still names its Block');
});

test('rows with no id never merge', () => {
 const rows=mergeVoiceRows([{request:1,rows:[{verb:'Added',entity:'task',id:null,title:'A'},{verb:'Added',entity:'task',id:null,title:'B'}]}]);
 assert.deepEqual(rows.map(r=>r.title),['A','B']);
});

test('an update changes the row in place: the same row node, with the new value', () => {
 const table=voiceTable({win});
 table.setRows(mergeVoiceRows([{request:1,rows:[{verb:'Added',entity:'task',id:7,title:'Call mom',when:'Today, 8:00 PM'}]}]));
 const before=table.node.querySelector('.voice-row'),item=before.querySelector('.voice-item');
 table.setRows(mergeVoiceRows([
  {request:1,rows:[{verb:'Added',entity:'task',id:7,title:'Call mom',when:'Today, 8:00 PM'}]},
  {request:2,rows:[{verb:'Changed',entity:'task',id:7,when:'Tomorrow, 9:00 AM'},{verb:'Added',entity:'task',id:9,title:'Pay rent'}]},
 ]));
 const after=table.node.querySelectorAll('.voice-row');
 assert.equal(after.length,2);
 assert.equal(after[0],before,'the row node is kept');
 assert.equal(after[0].querySelector('.voice-item'),item,'its button is kept');
 assert.equal(after[0].querySelector('.voice-when .cell').textContent,'Tomorrow, 9:00 AM');
 assert.equal(after[0].dataset.requests,'1 2');
 assert.deepEqual([...after].map(titleOf),['Call mom','Pay rent']);
});

test('a row moved to the Trash turns into plain text in place, and a tap on a live row opens it', () => {
 const opened=[];
 const table=voiceTable({win,openItem:t=>opened.push(t)});
 const add={request:1,rows:[{verb:'Added',entity:'task',id:7,title:'Call mom'}]};
 table.setRows(mergeVoiceRows([add]));
 const row=table.node.querySelector('.voice-row');
 row.querySelector('button').click();
 assert.deepEqual(opened,[{collection:'tasks',id:7}]);
 table.setRows(mergeVoiceRows([add,{request:2,rows:[{verb:'Moved to Trash',entity:'task',id:7,title:'Call mom'}]}]));
 assert.equal(table.node.querySelector('.voice-row'),row);
 assert.ok(row.classList.contains('gone'));
 assert.equal(row.querySelector('button'),null,'a Trash row is not a button');
 assert.equal(row.querySelector('.voice-note').textContent,'Moved to Trash');
});

test('a row whose request was undone leaves the table', async () => {
 const table=voiceTable({win});
 const a={request:1,rows:[{verb:'Added',entity:'task',id:7,title:'Call mom'}]},b={request:2,rows:[{verb:'Added',entity:'task',id:8,title:'Pay rent'}]};
 table.setRows(mergeVoiceRows([a,b]));
 table.setRows(mergeVoiceRows([a]));
 assert.equal(table.size(),1);
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual([...table.node.querySelectorAll('.voice-row')].map(titleOf),['Call mom']);
});

test('a new entity on the same key keeps the row and shows the new kind', async () => {
 const table=voiceTable({win});
 table.setRows([{key:'k',requests:[1],verb:'Added',entity:'task',id:'x',title:'Garden'}]);
 const row=table.node.querySelector('.voice-row');
 table.setRows([{key:'k',requests:[1],verb:'New Project',entity:'project',id:'x',title:'Garden'}]);
 await new Promise(r=>setTimeout(r,0));
 assert.equal(table.node.querySelector('.voice-row'),row);
 assert.equal(row.querySelector('.voice-glyph').textContent,'folder');
});
