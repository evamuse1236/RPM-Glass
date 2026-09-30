// Synthetic presentation fixtures. Never call a provider or use personal records.
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {planner,editPlan} from '../android-companion/planner-state.mjs';
import {changePlanner} from '../android-companion/planner-tools.mjs';
import {createIntentService} from '../android-companion/intent-service.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {sourceUnits} from '../intent-v2/src/context.mjs';
export async function captureFixture(kind='range',{now=new Date(),history=true}={}){
 const data=freshStore();planner(data).uxVersion=1;const conversationId=data.conversations[0].id;
 if(history)data.conversations[0].messages=Array.from({length:45},(_,i)=>({role:i%2?'assistant':'user',text:i%2?'An earlier response.':'An earlier thought.',at:new Date(+now-100000-i).toISOString()}));
 let answer,clock=new Date(+now-5000);const backend=createMemoryBackend(data);
 const service=createIntentService({backend,model:async()=>{if(answer instanceof Error)throw answer;return answer;},changePlanner,undo,editPlan,clock:()=>clock,timezone:'Asia/Kolkata',readCalendar:async()=>({status:'not_selected',events:[]})});
 if(history){const raw='An earlier thought.';answer=turn(raw,[],{mode:'reflect',draftMode:'none',reply:'I have kept that thought.',decisions:sourceUnits(raw).map(s=>({sourceId:s.id,disposition:'reflection'}))});await service.capture({messageId:'earlier',conversationId,text:raw});}
 if(kind==='task-update'){const d=await backend.load(),version=d.version;editPlan(d,{type:'saveTask',fields:{title:'Set an example task'}});await backend.save(version,JSON.parse(JSON.stringify(d)));}
 if(kind==='empty')return {data:await backend.load(),conversationId};
 if(kind==='wrong-follow-up'){
  const d=await backend.load();editPlan(d,{type:'saveTask',fields:{title:'Finish one assessment'}});
  d.intentV2.captures.idea={messageId:'idea',conversationId,raw:'I want a Wispr bot to help find freelance work.',reply:'What would it help with?',at:new Date(+now-3000).toISOString(),status:'interpreted'};
  const raw='The task I just mentioned to you before',id='draft-current';
  d.intentV2.captures.current={messageId:'current',conversationId,raw,at:now.toISOString(),status:'interpreted',draftId:id};
  d.intentV2.drafts[id]={id,conversationId,revision:1,status:'draft',created:now.toISOString(),sourceMessageIds:['current'],operations:[operation([{...field('title','Finish one assessment',raw),sourceMessageId:'current'}],{entity:'project'})],guards:{},question:null};
  return {data:d,conversationId,raw};
 }
 clock=now;let raw='Finish one assessment tomorrow from 2 pm to 3 pm';
 let ops=[operation([field('title','Finish one assessment','Finish one assessment'),field('time','tomorrow from 2 pm to 3 pm','tomorrow from 2 pm to 3 pm')])];
 let extra={};
 if(kind==='ambiguous'){raw='Read tomorrow from 2 to 3';ops=[operation([field('title','Read','Read'),field('time',null,'tomorrow from 2 to 3','stated','unknown')])];extra.question={opId:'task1',field:'time',prompt:'Did you mean 2 to 3 am or 2 to 3 pm?',options:[{label:'2–3 am',value:'tomorrow from 2 am to 3 am'},{label:'2–3 pm',value:'tomorrow from 2 pm to 3 pm'}]};}
 if(kind==='date-only'){raw='Buy notebooks tomorrow';ops=[operation([field('title','Buy notebooks','Buy notebooks'),field('time','tomorrow','tomorrow')])];}
 if(kind==='task-update'){raw='Set an example task for 5 minutes';const d=await backend.load();ops=[operation([field('minutes',5,'5 minutes')],{kind:'update',targetId:String(d.entries[0].id)})];}
 if(kind==='unscheduled'){raw='Buy notebooks';ops=[operation([field('title',raw,raw)])];}
 if(kind==='long-title'){const title='Review the workshop materials and collect the questions that need a follow-up discussion with the teaching team';raw=title+' tomorrow from 2 pm to 3 pm';ops=[operation([field('title',title,title),field('time','tomorrow from 2 pm to 3 pm','tomorrow from 2 pm to 3 pm')])];}
 if(kind==='multi'){const lines=['Read chapter tomorrow at 9 am','Call the library tomorrow at 11 am','Print worksheets tomorrow at 2 pm'];raw=lines.join('\n');ops=lines.map((line,i)=>{const [title,time]=line.split(' tomorrow ');return operation([field('title',title,title),field('time','tomorrow '+time,'tomorrow '+time)],{opId:'task'+i,sourceId:'s'+i});});}
 if(kind==='reflection'||kind==='long-reply'){raw='I feel scattered today and want a little space to think.';ops=[];extra={mode:'reflect',draftMode:'none',decisions:sourceUnits(raw).map(s=>({sourceId:s.id,disposition:'reflection'})),reply:kind==='reflection'?'You can leave this as a thought. What would give you a little breathing room today?':'You can leave this as a thought. There is no need to turn everything into a task.\n\nStart by noticing what is taking the most space in your mind. It might be an unfinished conversation, a piece of work, or simply feeling tired. Naming it does not mean you have to solve it now.\n\nIf you want one small next step, take a quiet minute, get a glass of water, and choose the thing you want to return to later. You can also stop here.\n\nWhat would give you a little breathing room today?'};}
 answer=kind==='error'?new Error('Service unavailable'):turn(raw,ops,extra);
 await service.capture({messageId:'current',conversationId,text:raw});
 if(kind==='saved'||kind==='parked'){const d=Object.values((await backend.load()).intentV2.drafts).at(-1);await service.act({kind:kind==='saved'?'commit':'dismiss',draftId:d.id,conversationId,revision:d.revision},{actionId:'fixture-'+kind});}
 return {data:await backend.load(),conversationId,raw};
}
