const ACTIVE=new Set(['draft','review']);
const time=c=>Number.isFinite(Date.parse(c.at??''))?Date.parse(c.at):0;
const activeDraft=(state,id,conversationId)=>{const d=id?state.drafts?.[id]:null;return d&&ACTIVE.has(d.status)&&d.conversationId===conversationId?d:null;};

/** Captures of one conversation, oldest first; equal times keep the order they were saved in. */
function inOrder(state,conversationId){
 return Object.values(state.captures??{}).filter(c=>c.conversationId===conversationId).map((c,i)=>({c,i})).sort((a,b)=>time(a.c)-time(b.c)||a.i-b.i).map(x=>x.c);
}

/** The newest capture the app answered in this conversation, leaving out `except` (the message being read now). */
export function previousCapture(state,conversationId,{except=null}={}){
 return inOrder(state,conversationId).filter(c=>c.messageId!==except&&c.status==='interpreted').at(-1)??null;
}

/** A capture saved before this module existed has only focusDraftId; it was always an explicit pointer. */
export function focusOf(capture){
 if(capture?.focus!==undefined)return capture.focus;
 return capture?.focusDraftId?{draftId:capture.focusDraftId,draftRevision:capture.focusRevision??null,explicit:true,questionId:null,fromMessageId:null}:null;
}

/** The question the person is answering: the newest answered capture's clarification, if it asked one. */
export function openQuestion(state,conversationId,{except=null}={}){
 const p=previousCapture(state,conversationId,{except});
 return p?.clarification?{...p.clarification,messageId:p.messageId}:null;
}

function asked(state,capture){
 const own=activeDraft(state,capture.draftId,capture.conversationId);
 return !!(capture.clarification||own?.question||/\?/.test(capture.reply??''));
}

/**
 * What a new message points at, decided once when its words are saved. An explicit draft (an Edit tap) wins.
 * Otherwise the message inherits from the previous capture when that capture asked something: its open draft
 * with a question, or the draft it was itself pointing at. An open question travels with either.
 */
export function focusFor(state,{conversationId,messageId,focusDraftId=null}){
 const question=openQuestion(state,conversationId,{except:messageId});
 const ask=question?{questionId:question.id,fromMessageId:question.messageId}:{questionId:null,fromMessageId:null};
 if(focusDraftId){
  const d=activeDraft(state,focusDraftId,conversationId);
  return {draftId:focusDraftId,draftRevision:d?.revision??null,explicit:true,...ask,...(d?{}:{stale:true})};
 }
 const p=previousCapture(state,conversationId,{except:messageId});
 if(!p||!asked(state,p))return null;
 const own=activeDraft(state,p.draftId,conversationId);
 const d=(own?.question?own:null)??activeDraft(state,focusOf(p)?.draftId,conversationId);
 if(!d&&!question)return null;
 return {draftId:d?.id??null,draftRevision:d?.revision??null,explicit:false,questionId:question?.id??null,fromMessageId:p.messageId};
}

/** The open question as the model sees it, only while it is still the newest thing asked in the conversation. */
export function questionFor(state,capture){
 const focus=focusOf(capture);
 if(!focus?.questionId)return null;
 const question=openQuestion(state,capture.conversationId,{except:capture.messageId});
 return question?.id===focus.questionId?question:null;
}
