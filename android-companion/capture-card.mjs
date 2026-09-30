import {captureSchedule,captureDuration} from './capture-content.mjs';
import {formattedReply} from '../chat-prototype/reply-format.mjs';

/** Render one current capture. All mutations remain with the existing actions. */
export function captureCard(capture,{document:doc=document,focused=false,history=false,canUndo=false,onAction,onRetry,onEditWords,onResume,onUndo,onOpen,onOpenPlanner,delivery}={}){
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls??'';if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='quiet')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;};
 const icon=(name)=>{const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',name==='check'?'m5 12 4 4L19 6':name==='calendar'?'M5 5h14v15H5zM8 3v4m8-4v4M5 10h14':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2');svg.append(path);return svg;};
 const source=()=>{const d=el('details','cap-details');d.append(el('summary','','Details'),el('p','cap-field-label','Original words'),el('p','cap-original',capture.raw));for(const a of capture.draft?.schedulePreview?.items?.flatMap(i=>i.assumptions??[])??[])d.append(el('p','cap-detail-note',a));return d;};
 const row=el('section','message assistant intent-review cap-response');row.dataset.messageId=capture.messageId;
 const draft=capture.draft;row.dataset.replyKey=JSON.stringify([capture.messageId,capture.reply,draft?.revision,draft?.status,capture.lastError?.message]);
 if(capture.status==='captured'){
  const box=el('section','cap-response-card');box.append(el('h2','cap-card-title','Your thought is kept'),el('p',capture.lastError?'intent-state error':'intent-state',capture.lastError?'Couldn’t prepare a draft. You can retry or edit your words.':'The review is not ready yet.'));
  const actions=el('div','actions intent-actions cap-card-actions');actions.append(button('Retry',()=>onRetry(capture.messageId),'primary'),button('Edit',e=>onEditWords(capture.raw,e)));box.append(actions,source());row.append(box);return row;
 }
 if(!draft){
  const box=el('section','cap-response-card cap-dialogue');box.append(formattedReply(capture.reply||'Thought kept.',doc),source());row.append(box);return row;
 }
 const allTasks=draft.operations.every(op=>op.entity==='task');
 const saved=draft.status==='committed',parked=draft.status==='parked',undone=draft.status==='undone',active=['draft','review'].includes(draft.status);
 const box=el('section','intent-draft cap-response-card');box.dataset.status=draft.status;
 const only=draft.operations.length===1?draft.operations[0]:null,updateLabel=only?.kind==='update'?`Review ${only.entity==='area'?'life area':only.entity} changes`:null;
 const heading=el('div','cap-state');if(saved)heading.append(icon('check'));heading.append(el('span','',saved?(history?'Saved earlier':'Saved to Planner'):parked?'Draft kept':undone?'Save undone':draft.validationNotice?'Check this draft':updateLabel?updateLabel:focused?'Editing draft':draft.question?'Needs an answer':draft.operations.length>1?`${draft.operations.length} ${allTasks?'proposed tasks':'proposals'}`:'Proposed '+({block:'Block',project:'project',goal:'goal',area:'life area'}[draft.operations[0]?.entity]??'task')));box.append(heading);
 if(active&&draft.mode==='plan'&&capture.reply){const lead=el('details','cap-reply-details'),summary=el('summary','');summary.append(el('span','cap-reply-lead',capture.reply),el('span','cap-reply-toggle','Show full reply'));lead.append(summary,formattedReply(capture.reply,doc));box.append(lead);}
 const items=el('div','cap-items');
 for(const op of draft.operations){
  const titleField=op.fields.find(f=>f.name==='title'&&f.op==='set'),title=titleField?.value??op.targetTitle??({task:'Task',block:'Block',project:'Project',goal:'Goal',area:'Life area'}[op.entity]??'Item');
  const item=el('article','intent-operation cap-item');item.dataset.opId=op.opId;
  if(!allTasks&&(draft.operations.length>1||op.entity!=='task'))item.append(el('p','cap-item-kind',({task:'Task',block:'Block',project:'Project',goal:'Goal',area:'Life area'}[op.entity]??'Item')));
  item.append(el('h3','intent-operation-title cap-card-title',title));
  if(!saved&&!undone&&op.kind!=='create'&&!(op.kind==='update'&&only))item.append(el('p','cap-change',({update:`Update ${op.entity==='area'?'life area':op.entity}`,complete:'Mark as done',archive:'Archive this item'}[op.kind]??op.kind)));
  if(active&&titleField?.origin==='suggested')item.append(el('span','cap-suggested','Suggested'));
  const preview=draft.schedulePreview?.items?.find(p=>p.opId===op.opId),schedule=captureSchedule(preview,{timeZone:draft.schedulePreview?.timezone,reference:new Date()});
  if(schedule&&!schedule.review){
   const when=el('div','intent-schedule cap-schedule');
   if(schedule.crossDay){for(const label of [schedule.startLabel,'to '+schedule.endLabel]){const line=el('p','cap-when',label);when.append(line);}}
   else {const date=el('p','cap-date');date.append(icon('calendar'),el('span','',schedule.date));when.append(date);const time=el('p','cap-time');time.append(icon('clock'),el('span','',schedule.time));when.append(time);}
   if(schedule.duration){const line=when.querySelector('.cap-time')??when.lastElementChild;line.append(el('span','cap-duration','· '+schedule.duration));}item.append(when);
   const zone=draft.schedulePreview?.timezone;if(zone){const format=new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeZoneName:'short'});if(format.resolvedOptions().timeZone!==Intl.DateTimeFormat().resolvedOptions().timeZone)item.append(el('p','cap-detail-note',format.formatToParts(new Date(preview.planned??Date.now())).find(p=>p.type==='timeZoneName').value));}
  }
  if(schedule?.review&&!draft.question)item.append(el('p','cap-needs-answer',schedule.review.replace(`For ${title}: `,'')));
  const labels={purpose:'Purpose',notes:'Notes',blockId:'Block',projectId:'Project',goalId:'Goal',areaId:'Life area',year:'Year',must:'Must do',priority:'Position in plan',recurrence:'Repeats',repeatAfterDays:'Days between repeats',alert:'Alert'};
  for(const f of op.fields){
   if(saved||undone)continue;
   if(f.name==='title'||f.name==='time'||f.name==='minutes'&&schedule?.duration)continue;
   if(f.op==='unknown'&&draft.question?.opId===op.opId&&draft.question.field===f.name)continue;
   const label=f.name==='minutes'?'Estimate':labels[f.name]??f.displayLabel??f.name;
   const value=f.op==='unknown'?'Needs your answer':f.op==='clear'?'Remove':f.name==='minutes'?captureDuration(f.value):f.displayValue??(typeof f.value==='boolean'?(f.value?'Yes':'No'):String(f.value));
   if(f.name==='minutes'&&f.op==='set'&&Number.isFinite(f.value)){const estimate=el('p','cap-estimate');estimate.append(icon('clock'),el('span','',value),el('span','cap-field-label','estimate'));if(active&&f.origin==='suggested')estimate.append(el('span','cap-suggested','Suggested'));item.append(estimate);continue;}
   const detail=el('p','cap-field');detail.append(el('span','cap-field-label',label),el('span','',value));if(active&&f.origin==='suggested')detail.append(el('span','cap-suggested','Suggested'));item.append(detail);
  }
  items.append(item);
 }
 box.append(items);
 if(active&&draft.validationNotice)box.append(el('p','cap-needs-answer',draft.validationNotice));
 if(active&&draft.question)box.append(el('p','intent-question cap-question',draft.question.prompt));
 if(active&&draft.review)box.append(el('p','intent-question cap-question',draft.review.question));
 const actions=el('div','actions intent-actions cap-card-actions');actions.dataset.answers=String(!!draft.question);
 const ordered=[...(draft.actions??[])];if(!draft.question)ordered.sort((a,b)=>({dismiss:0,open:1,commit:3}[a.action.kind]??2)-({dismiss:0,open:1,commit:3}[b.action.kind]??2));
 for(const item of ordered){
  const kind=item.action.kind,label=kind==='commit'&&!draft.review?(draft.operations.every(op=>op.kind==='create')?(draft.operations.length>1?'Add all':'Add'):'Save changes'):kind==='open'?'Edit':kind==='dismiss'?'Dismiss':item.label;
  actions.append(button(label,()=>onAction(item.action),kind==='commit'?'primary':kind==='answer'||kind==='open'?'choice':'quiet'));
 }
 if(parked)actions.append(button('Review draft',()=>onResume(draft),'choice'));
 if(saved){
  const receipts=(draft.receipt?.plannerReceipts??[]).filter(r=>r.action);
  for(const receipt of receipts)if(receipt.entry?.alert){const status=delivery?.(receipt.entry.id);box.append(el('p','cap-delivery',status?.label??'Check alert delivery in Planner.'));}
  if(canUndo)actions.append(button('Undo',()=>onUndo(draft),'cap-undo quiet'));
  else if(draft.receipt?.undoId)box.append(el('p','cap-detail-note','Undo is no longer available.'));
  if(receipts.length)actions.append(button('Open in Planner',()=>receipts.length===1?onOpen(receipts[0].action):onOpenPlanner(),'choice'));
 }
 if(actions.childElementCount)box.append(actions);box.append(source());row.append(box);return row;
}
