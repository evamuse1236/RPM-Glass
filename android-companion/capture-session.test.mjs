import test from 'node:test';
import assert from 'node:assert/strict';
import {createSendIdentity,draftToKeep,actionPresentation,cardKind,canUndoChange,latestEdit} from './capture-session.mjs';
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
test('committed creates show a receipt with Undo and no Draft/Edit actions',()=>{
 const draft={status:'committed',operations:[{kind:'create'},{kind:'create'}],question:null,review:null,receipt:{undoId:'instant'}};
 assert.equal(cardKind({status:'interpreted',draft}),'receipt');
 assert.equal(canUndoChange(draft,'instant'),true);
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
test('Undo shows for the newest planner change, and for a change that only set drafts aside',()=>{
 assert.equal(canUndoChange({receipt:{undoId:'u1'}},'u1'),true);
 assert.equal(canUndoChange({receipt:{undoId:'u1'}},'u2'),false);
 assert.equal(canUndoChange({receipt:{undoId:null,parkedDrafts:[{id:'d0',status:'draft'}]}},'u2'),true);
 assert.equal(canUndoChange({receipt:{undoId:null}},null),false);
 assert.equal(canUndoChange({},'u1'),false);
});

test('after a chip edit the footer Undo still shows, and the change row follows the newest edit not undone',()=>{
 const draft={receipt:{undoId:'u1'},edits:[{undoId:'e1',field:'time'},{undoId:'e2',field:'alert',undone:true}]};
 assert.equal(latestEdit(draft).undoId,'e1');
 assert.equal(canUndoChange(draft,'e1'),true,'the edit chained on the capture keeps Undo');
 assert.equal(canUndoChange(draft,'u1'),true,'after that edit is undone the capture Undo is back');
 assert.equal(canUndoChange(draft,'e2'),false,'an undone edit is not the newest change');
 assert.equal(latestEdit({receipt:{}}),null);
});
