import test from 'node:test';
import assert from 'node:assert/strict';
import {createSendIdentity,draftToKeep,actionPresentation,cardKind} from './capture-session.mjs';
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
test('draft actions read Keep as draft, Edit, Add in increasing emphasis',()=>{
 const draft={operations:[{kind:'create'},{kind:'create'}],question:null,review:null};
 const roles=['dismiss','open','commit'].map(kind=>actionPresentation({action:{kind}},draft));
 assert.deepEqual(roles.map(r=>r.label),['Keep as draft','Edit','Add 2']);
 assert.equal(actionPresentation({action:{kind:'commit'}},draft,{selected:1}).label,'Add 1');
 assert.equal(actionPresentation({action:{kind:'commit'}},draft,{selected:0}).label,'Add');
 assert.ok(roles[0].order<roles[1].order&&roles[1].order<roles[2].order);
 assert.equal(actionPresentation({action:{kind:'commit'}},{operations:[{kind:'update'}]}).label,'Save changes');
});
test('the latest capture picks one card: kept words, Keep or Undo, receipt, answer',()=>{
 const draft=(status,confirm=null)=>({status,confirm});
 assert.equal(cardKind(null),'empty');
 assert.equal(cardKind({status:'captured'}),'pending');
 assert.equal(cardKind({status:'captured',lastError:{message:'offline'}}),'words-kept');
 assert.equal(cardKind({status:'interpreted',draft:null,reply:'',card:null}),'saved');
 assert.equal(cardKind({status:'interpreted',draft:null,reply:'Free after 3.',card:null}),'answer');
 assert.equal(cardKind({status:'interpreted',draft:null,reply:'',card:{kind:'agenda'}}),'answer');
 assert.equal(cardKind({status:'interpreted',draft:draft('committed','pending')}),'confirm');
 assert.equal(cardKind({status:'interpreted',draft:draft('committed','kept')}),'receipt');
 assert.equal(cardKind({status:'interpreted',draft:draft('committed')}),'receipt');
 assert.equal(cardKind({status:'interpreted',draft:draft('undone')}),'undone');
 assert.equal(cardKind({status:'interpreted',draft:draft('parked')}),'parked');
 assert.equal(cardKind({status:'interpreted',draft:draft('draft')}),'open');
});
