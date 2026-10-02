import test from 'node:test';
import assert from 'node:assert/strict';
import {createSendIdentity,draftToKeep,startersFor,actionPresentation} from './capture-session.mjs';
test('a retried send keeps the exact words and its message ID',()=>{
 let n=0;const ids=createSendIdentity(()=>'id-'+(++n));
 const raw='  Print the worksheets, twenty minutes.  ';
 const first=ids.forText(raw,'draft-1');
 assert.equal(first.text,raw);assert.equal(first.focusDraftId,'draft-1');
 assert.equal(ids.forText(raw,'draft-1').messageId,first.messageId);
 const refocused=ids.forText(raw,'draft-2');
 assert.notEqual(refocused.messageId,first.messageId);assert.equal(refocused.focusDraftId,'draft-2');
 assert.notEqual(ids.forText(raw+'!','draft-2').messageId,refocused.messageId);
 ids.settle();assert.equal(ids.pending,null);
 assert.notEqual(ids.forText(raw,'draft-1').messageId,first.messageId);
});
test('words awaiting a send result stay recoverable as the draft',()=>{
 assert.equal(draftToKeep('',{busy:true,pendingText:'call the library'}),'call the library');
 assert.equal(draftToKeep('new words',{busy:true,pendingText:'call the library'}),'new words');
 assert.equal(draftToKeep('',{busy:false,pendingText:'call the library'}),'');
});
test('starters appear only when Capture is truly empty',()=>{
 const empty={view:'chat',busy:false,archived:false,captureCount:0,recovering:false};
 assert.equal(startersFor(empty).length,3);
 for(const change of [{busy:true},{captureCount:1},{recovering:true},{view:'history'},{archived:true}])assert.deepEqual(startersFor({...empty,...change}),[]);
});
test('draft actions read Dismiss, Edit, Add in increasing emphasis',()=>{
 const draft={operations:[{kind:'create'},{kind:'create'}],question:null,review:null};
 const roles=['dismiss','open','commit'].map(kind=>actionPresentation({action:{kind}},draft));
 assert.deepEqual(roles.map(r=>r.label),['Dismiss','Edit','Add all 2']);
 assert.ok(roles[0].order<roles[1].order&&roles[1].order<roles[2].order);
 assert.equal(actionPresentation({action:{kind:'commit'}},{operations:[{kind:'update'}]}).label,'Save changes');
});
