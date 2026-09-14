import test from 'node:test';import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {phoneProposal,checkSchedule,repeatSuggestion} from './planner-chat.mjs';
const now=new Date(2026,8,12,8),raw='Read at 10am';
const args=()=>({operations:[{type:'create',collection:'entries',id:null,fields:{title:'Read',kind:'plan',time:'10am'},evidence:[raw]}],continuation:false,question:null,choices:[]});
const calendar=()=>({status:'ready',start:+new Date(2026,8,9),end:+new Date(2026,9,4),events:[{id:'meeting',title:'Meeting',start:+new Date(2026,8,12,10),end:+new Date(2026,8,12,11)}]});
test('chat holds complete transaction for conflict, rechecks, then accepts exact confirmation',async()=>{
 const d=freshStore(),meta={raw,now,conversationId:d.conversations[0].id};let reads=0;const read=async()=>{reads++;return calendar();};
 const result=await phoneProposal(d,args(),meta,read);assert.equal(d.entries.length,0);assert.ok(result.text.includes('Meeting'));assert.ok(d.pending.scheduleReview);
 await phoneProposal(d,{...args(),continuation:true},{...meta,raw:'Save anyway'},read);assert.equal(d.entries.length,1);assert.equal(d.pending,null);assert.equal(reads,2);
});
test('new conflict after confirmation requires another review and never partly saves',async()=>{
 const d=freshStore(),meta={raw,now,conversationId:d.conversations[0].id};await phoneProposal(d,args(),meta,async()=>calendar());
 await phoneProposal(d,{...args(),continuation:true},{...meta,raw:'Save anyway'},async()=>{const c=calendar();c.events[0].end+=3600000;return c;});assert.equal(d.entries.length,0);assert.ok(d.pending);
});
test('stale selected calendar is a warning; disconnected capture continues locally',async()=>{
 const d=freshStore(),meta={raw,now,conversationId:d.conversations[0].id};await phoneProposal(d,args(),meta,async()=>({status:'stale',events:[]}));assert.ok(d.pending);assert.equal(d.entries.length,0);
 const b=freshStore();await phoneProposal(b,args(),{...meta,conversationId:b.conversations[0].id},async()=>({status:'not_selected',events:[]}));assert.equal(b.entries.length,1);
});
test('read-only scheduling tool exposes bounded conflicts without any data mutation',async()=>{
 const d=freshStore(),before=structuredClone(d),r=await checkSchedule(d,{start:new Date(2026,8,12,10).toISOString(),minutes:30,excludeId:null},async()=>calendar());assert.equal(r.conflicts[0].title,'Meeting');assert.equal(r.alternatives.length,3);assert.deepEqual(d,before);
});
test('recurring suggestion is brief and does not silently alter repeated captures',()=>{
 const d=freshStore();d.entries=[1,2,3].map(id=>({id,title:'Read',kind:'plan'}));assert.equal(repeatSuggestion(d).label,'Recurring?');assert.equal(d.entries[2].recurrence,undefined);
});
test('chat completion preserves recurring series and undo snapshot',async()=>{
 const d=freshStore();await phoneProposal(d,{...args(),operations:args().operations.map(o=>({...o,fields:{...o.fields,recurrence:'daily'}}))},{raw,now,conversationId:d.conversations[0].id},async()=>({status:'not_selected',events:[]}));
 await phoneProposal(d,{operations:[{type:'update',collection:'entries',id:1,fields:{status:'done'},evidence:['Done']}],continuation:false,question:null,choices:[]},{raw:'Done',now:new Date(2026,8,12,11),conversationId:d.conversations[0].id},async()=>({status:'not_selected',events:[]}));
 assert.equal(d.entries[0].done,false);assert.equal(d.entries[0].completedOccurrences.length,1);assert.equal(d.undo.before.entries[0].completedOccurrences?.length??0,0);
});
test('explicitly clearing recurrence also disables after-completion repeats',async()=>{
 const d=freshStore();await phoneProposal(d,args(),{raw,now,conversationId:d.conversations[0].id},async()=>({status:'not_selected',events:[]}));
 d.entries[0].repeatAfterDays=3;
 await phoneProposal(d,{operations:[{type:'update',collection:'entries',id:1,fields:{recurrence:null},evidence:['Stop repeating']}],continuation:false,question:null,choices:[]},{raw:'Stop repeating',now,conversationId:d.conversations[0].id},async()=>({status:'not_selected',events:[]}));
 assert.equal(d.entries[0].recurrence,null);assert.equal(d.entries[0].repeatAfterDays,null);
});
