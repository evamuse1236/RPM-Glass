import test from 'node:test';import assert from 'node:assert/strict';import {specs,replaceExactly} from '../patches/hotfix-spec.mjs';
import {draftActions} from '../src/suggestions.mjs';
test('hotfix transformations match each verified snippet fixture exactly once',()=>{for(const s of specs){const fixture=s.edits.map(([before])=>before).join('\n');const result=replaceExactly(fixture,s.edits);for(const [,after] of s.edits)assert.ok(result.includes(after));}});
test('hotfix refuses a missing anchor rather than overwriting new source',()=>{assert.throws(()=>replaceExactly('different source',specs[0].edits),/refusing/);});
test('hotfix refuses duplicated anchors',()=>{const edit=specs[0].edits[0];assert.throws(()=>replaceExactly(edit[0]+edit[0],[edit]),/exactly one/);});
test('all three substantive answer options remain available',()=>{const draft={id:'d',conversationId:'c',revision:1,status:'draft',question:{opId:'o',field:'time',options:[{label:'Morning',value:'8am'},{label:'Afternoon',value:'2pm'},{label:'Evening',value:'8pm'}]}};assert.deepEqual(draftActions(draft).map(x=>x.label),['Morning','Afternoon','Evening']);});
