import {shortHash} from './hash.mjs';
import {guardsFor} from './context.mjs';

export const proposalId=(draftId,opId)=>`proposal-${shortHash(`${draftId}\n${opId}`)}`;
export function proposalEntities(draft){
 return (draft?.operations??[]).map(op=>({entity:'proposal',id:proposalId(draft.id,op.opId),draftId:draft.id,opId:op.opId,title:op.fields.find(f=>f.name==='title'&&f.op==='set')?.value??op.entity}));
}
export const proposalFor=(draft,id)=>draft?.operations.find(op=>proposalId(draft.id,op.opId)===id)??null;

/** Removing a proposal edits the draft only. Its separate receipt never commits the proposals that remain. */
export function stageProposalRemoval(state,{data,capture,activeDraft,parsed,now,refreshSchedule}){
 const previous=state.drafts[activeDraft?.id];
 if(!previous||!['draft','review'].includes(previous.status)||previous.revision!==capture.focusRevision)throw new Error('The draft changed while its proposals were being read. Nothing was removed.');
 const before=structuredClone(previous),removed=previous.operations.filter(o=>parsed.discarded.includes(o.opId));
 if(removed.length!==parsed.discarded.length)throw new Error('A proposal is no longer in this draft. Nothing was removed.');
 const draftId=`draft-${capture.messageId}`,revision=previous.revision+1,kept=parsed.operations;
 const newGuards=guardsFor(data,kept),guards=Object.fromEntries(Object.entries(newGuards).map(([key,value])=>[key,previous.guards[key]??value]));
 const sourceMessageIds=[...new Set([...previous.sourceMessageIds,capture.messageId])];
 const timeChanged=kept.some(op=>op.fields.some(f=>f.name==='time'&&f.sourceMessageId===capture.messageId));
 const timeAnchorAt=timeChanged?capture.at:previous.timeAnchorAt??previous.created;
 const raw=sourceMessageIds.map(id=>state.captures[id]?.raw??'').join('\n');
 const schedulePreview=refreshSchedule?.({data,draft:{operations:kept,conversationId:capture.conversationId,raw},anchor:new Date(timeAnchorAt)})??previous.schedulePreview;
 state.drafts[previous.id]={...previous,revision,updated:now,status:kept.length?'draft':'parked',
  operations:kept.length?kept:previous.operations,guards:kept.length?guards:previous.guards,sourceMessageIds,timeAnchorAt,
  question:parsed.question??(kept.some(o=>o.opId===previous.question?.opId)?previous.question:null),review:null,
  schedulePreview:schedulePreview?{...schedulePreview,items:(schedulePreview.items??[]).filter(i=>kept.some(o=>o.opId===i.opId))}:null};
 const removedProposals=removed.map(op=>({draftId:previous.id,opId:op.opId,entity:op.entity,title:op.fields.find(f=>f.name==='title'&&f.op==='set')?.value??op.entity}));
 const reply=kept.length?'Removed from the draft. The other proposals are still drafts.':'Set the draft aside. Undo brings its proposals back.';
 state.drafts[draftId]={id:draftId,conversationId:capture.conversationId,revision:1,status:'committed',mode:'capture',created:now,updated:now,
  sourceMessageIds:[capture.messageId],operations:[],guards:{},question:null,review:null,reply,
  receipt:{undoId:null,entryIds:[],changes:[],plannerReceipts:[],savedAt:now,removedProposals,draftEdits:[{id:previous.id,before,revision}]},
  applied:{at:now,auto:true,needsConfirm:true,warning:null,before:{}},confirm:'pending'};
 return draftId;
}
