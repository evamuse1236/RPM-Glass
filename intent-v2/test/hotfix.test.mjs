import test from 'node:test';import assert from 'node:assert/strict';
import {draftActions} from '../src/suggestions.mjs';
test('all three substantive answer options remain available',()=>{const draft={id:'d',conversationId:'c',revision:1,status:'draft',question:{opId:'o',field:'time',options:[{label:'Morning',value:'8am'},{label:'Afternoon',value:'2pm'},{label:'Evening',value:'8pm'}]}};assert.deepEqual(draftActions(draft).map(x=>x.label),['Morning','Afternoon','Evening']);});
