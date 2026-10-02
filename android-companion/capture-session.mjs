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

/** Starter choices appear only when Capture is truly empty. */
export const STARTERS=Object.freeze([
 {label:'What’s planned today?',text:'What’s planned today?',icon:'today'},
 {label:'Help me plan a Result',text:'Help me plan a Result',icon:'flag'},
 {label:'Empty my head',text:'I want to capture everything on my mind',icon:'neurology'},
]);
export function startersFor({view,busy,archived,captureCount,recovering}){
 if(view!=='chat'||busy||archived||recovering||captureCount>0)return [];
 return STARTERS;
}

/** Button roles for draft actions, in increasing emphasis. */
export function actionPresentation(item,draft){
 const kind=item.action.kind;
 const allCreate=draft.operations.every(op=>op.kind==='create');
 if(kind==='commit'){
  if(draft.review)return {label:item.label,role:'filled',order:3};
  const label=allCreate?(draft.operations.length>1?`Add all ${draft.operations.length}`:'Add'):'Save changes';
  return {label,role:'filled',order:3,icon:draft.operations.length>1&&allCreate?'done_all':null};
 }
 if(kind==='open')return {label:'Edit',role:'tonal',order:1};
 if(kind==='dismiss')return {label:draft.question?'Not now':'Dismiss',role:'text',order:0};
 if(kind==='refresh-time')return {label:'Refresh times',role:'filled',order:2,icon:'refresh'};
 return {label:item.label,role:'tonal',order:2};
}
