import test from 'node:test';
import assert from 'node:assert/strict';
import {capitalizeTitle} from './title.mjs';
import {Workflow} from './workflow.mjs';
import {editPatch} from './edits.mjs';
for(const [source,expected] of [
 ['call mom','Call mom'],['call iPhone SUPPORT','Call iPhone SUPPORT'],['iPhone backup','iPhone backup'],
 ['"iPhone backup"','"iPhone backup"'],['(eBay refund)','(eBay refund)'],['NASA follow-up','NASA follow-up'],
 ['  pick up Priya  ','Pick up Priya'],['"call mom"','"Call mom"'],
])test(`sentence casing preserves the rest of ${source}`,()=>{assert.equal(capitalizeTitle(source),expected);});
test('legacy local captures, result titles and edits use sentence casing without rewriting raw text',()=>{
 const w=new Workflow();w.send('call iPhone SUPPORT');assert.equal(w.get().title,'Call iPhone SUPPORT');assert.equal(w.get().raw,'call iPhone SUPPORT');
 w.send('/result finish NASA report | useful');assert.equal(w.data.results[0].title,'Finish NASA report');
 const result=editPatch(w.get(),{changes:[{field:'title',op:'set',value:'iPhone setup',evidence:['iPhone setup']}],clarification:null},new Date());
 assert.equal(result.patch.title,'iPhone setup');
});
