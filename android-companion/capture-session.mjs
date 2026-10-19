// Pure Capture session rules, kept apart from the DOM so they can be tested.

/**
 * One stable message ID per exact text and focused draft. A retry after a
 * transport failure reuses the ID, so the phone never stores the same thought
 * twice; changing the words or the focused draft starts a new message.
 */
export function createSendIdentity(newId=()=>crypto.randomUUID()){
 let pending=null;
 return {
  forText(text,focusDraftId=null){
   if(!pending||pending.text!==text||pending.focusDraftId!==focusDraftId){
    pending={text,messageId:newId(),focusDraftId};
   }
   return {...pending};
  },
  get pending(){return pending?{...pending}:null;},
  settle(){pending=null;},
 };
}

/** The text worth keeping as an unsent draft while a send is still in flight. */
export function draftToKeep(composerText,{busy=false,pendingText=null}={}){
 if(busy&&pendingText&&!composerText)return pendingText;
 return composerText;
}

/**
 * Which card the latest capture shows above the bar. Pure, so the order of the checks is tested:
 * words that never reached the model, an open question, a change waiting for Keep, a receipt, an answer.
 */
export function cardKind(capture){
 if(!capture)return 'empty';
 const draft=capture.draft;
 if(capture.status==='captured')return capture.lastError?'words-kept':'pending';
 if(capture.clarification?.open)return 'question';
 if(!draft)return capture.card?'answer':capture.reply?'answer':'saved';
 if(draft.status==='committed')return draft.confirm==='pending'?'confirm':'receipt';
 if(draft.status==='undone')return 'undone';
 if(draft.status==='parked')return 'parked';
 return 'open';
}

/**
 * Whether a change can still be undone from its card: a planner change while it is the newest Undo, or a change
 * that only set drafts aside (no planner record), which Undo can always bring back.
 */
export function canUndoChange(draft,undoId){
 const receipt=draft?.receipt;
 if(!receipt)return false;
 return receipt.undoId?receipt.undoId===undoId:!!receipt.parkedDrafts?.length;
}

/** Button roles for draft actions, in increasing emphasis. */
export function actionPresentation(item,draft,{selected=draft.operations.length}={}){
 const kind=item.action.kind;
 const allCreate=draft.operations.every(op=>op.kind==='create');
 if(kind==='commit'){
  if(draft.review)return {label:item.label,role:'filled',order:3};
  // The count follows the ticked proposals: "Add 2", "Add 1", or a plain "Add" for one proposal or none.
  const label=allCreate?(draft.operations.length>1&&selected>0?`Add ${selected}`:'Add'):'Save changes';
  return {label,role:'filled',order:3};
 }
 if(kind==='open')return {label:'Edit',role:'tonal',order:1};
 // Dismiss only parks the draft; the words and proposals stay in History.
 if(kind==='dismiss')return {label:'Keep as draft',role:'text',order:0};
 if(kind==='refresh-time')return {label:'Refresh times',role:'filled',order:2,icon:'refresh'};
 return {label:item.label,role:'tonal',order:2};
}
