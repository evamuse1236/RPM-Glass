import {editTargets} from '../cli/edits.mjs';
import {interpretTime} from '../cli/interpret.mjs';

const clip=(value,size=800)=>typeof value==='string'?value.slice(0,size):value??null;
const entryContext=e=>e?{
  id:e.id,title:clip(e.title,300),kind:e.kind,state:e.state,done:e.done,
  planned:e.planned,day:e.plannedDate,minutes:e.minutes,mood:clip(e.mood,100),energy:clip(e.energy,100),
  purpose:clip(e.purpose,160),alert:e.alertIntent?.type??e.alert?.type??null,
}:null;

/** An explicit allowlist: no CLI files, credentials, full revisions, or other chats. */
export function chatContext(w,messages,question){
  const selected=w.get(w.pending?.id??w.latest);
  const recent=[selected,...w.data.entries.toReversed()].filter(Boolean);
  const seen=new Set();
  const entries=recent.filter(e=>!seen.has(e.id)&&seen.add(e.id)).slice(0,8).map(entryContext);
  return {
    selected:selected?{...entryContext(selected),originalWords:clip(selected.raw,1200),timeEvidence:(selected.interpretation?.timeEvidence??[]).slice(0,4).map(s=>clip(s,240))}:null,
    entries,
    question:question?{kind:w.pending.kind,entryId:question.entryId,text:clip(question.text,500),choices:question.choices.slice(0,8),partialAnswer:clip(w.pending.clockAnswer,200),
      proposedChanges:(w.pending.edit?.changes??[]).map(c=>({field:c.field,op:c.op,value:clip(c.value,200),evidence:c.evidence.slice(0,2).map(s=>clip(s,200))}))}:null,
    recentMessages:messages.slice(-6).map(m=>({role:m.role,text:clip([m.text,m.detail,m.question?.text].filter(Boolean).join('\n'))})),
  };
}

function failureText(metadata){
  if(metadata?.http===429)return 'The AI is busy. Your words are kept here; no plan was created or changed. Try again in a moment.';
  if(metadata?.failure==='timeout')return 'The AI took too long. Your words are kept here; no plan was created or changed. You can try again.';
  return 'I could not use the AI reply. Your words are kept here; no plan was created or changed. You can try again or use a bubble.';
}

/** Every typed chat turn is interpreted with context; bubble actions stay local. */
export async function sendChat(w,raw,context){
  if(raw.startsWith('/')||!w.interpreter)return {reply:await w.sendAsync(raw)};
  const reference=w.now();
  const session={latest:w.latest,pending:structuredClone(w.pending),quick:[...w.quick]};
  let index;
  w.commit(()=>{
    w.data.interactions??=[];index=w.data.interactions.length;
    w.data.interactions.push({at:reference.toISOString(),raw,context:{mode:w.mode,target:w.latest,pending:structuredClone(w.pending)},response:null});
  });
  let result;
  try{result=await w.interpreter(raw,{now:reference,mode:w.mode,context});}
  catch{result={metadata:{status:'failed',failure:'interpreter_error'}};}
  if(result.metadata?.status!=='accepted'){
    const reply=failureText(result.metadata);
    w.commit(()=>Object.assign(w.data.interactions[index],{interpretation:result.metadata,response:reply}));
    return {reply};
  }
  let reply;
  try{
    w.commit(()=>{
      if(result.intent==='capture'&&result.entries?.length){
        w.pending=null;w.modelPending=true;
        try{w.capture(raw);}finally{w.modelPending=false;}
        w.finishCaptureRequest(w.latest,index,result,reference,raw);
        reply='Saved.';
      }else if(result.intent==='edit'&&result.edit){
        let edit=result.edit;
        const matches=editTargets(edit,w.data.entries,w.latest,w.now());
        if(result.continuation&&w.pending?.kind==='edit_value'&&matches.length===1&&matches[0].id===w.pending.id){
          const changes=new Map(w.pending.edit.changes.map(c=>[c.field,c]));
          let clarification=edit.clarification;
          for(const c of edit.changes){
            const next={...c,evidence:[...(changes.get(c.field)?.evidence??[]),...c.evidence]};
            if(c.field==='time'&&c.op==='set'&&c.value&&interpretTime(c.value,w.now()).assumptions.includes('No day specified; using the next occurrence.')){
              if(w.pending.days.length===1)next.value=w.pending.days[0]+' '+c.value;
              else if(w.pending.days.length>1)clarification='Which day should I use?';
            }
            changes.set(c.field,next);
          }
          edit={...edit,changes:[...changes.values()],clarification};
        }else if(result.continuation){
          throw new Error('Invalid continuation target');
        }
        w.pending=null;w.quick=[];
        const response=w.beginEdit(edit,'Natural edit: '+raw);
        reply=w.pending?'No change yet.':response.includes('╭')?'Changed.':response;
      }else if(result.intent==='answer'&&w.pending&&typeof result.answer==='string'){
        const before=JSON.stringify(w.data.entries);
        const response=w.answer(result.answer);
        reply=before!==JSON.stringify(w.data.entries)?'Changed.':w.pending?'':response;
      }else if(result.intent==='cancel_question'){
        w.pending=null;w.quick=[];
        reply='Okay, I left that question. Saved entries are unchanged.';
      }else if(result.intent==='chat'&&result.message){
        reply=result.message;
      }else throw new Error('Invalid conversation action');
      Object.assign(w.data.interactions[index],{interpretation:{...w.data.interactions[index].interpretation,...result.metadata,intent:result.intent,...(result.edit?{request:result.edit}:{}),...(result.answer?{answer:result.answer}:{})},response:reply});
    });
  }catch{
    Object.assign(w,session);w.modelPending=false;
    reply='I could not finish that change. Your words are kept here; nothing changed.';
    w.commit(()=>Object.assign(w.data.interactions[index],{response:reply}));
  }
  return {reply};
}
