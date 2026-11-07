import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';


export const TZ='Asia/Kolkata',NOW=new Date('2026-10-27T12:00:00Z');
let serial=0;
export const call=(name,args={})=>({id:`c${++serial}`,name,args});
export const tools=(...functionCalls)=>({toolCall:{functionCalls}});
export const said=text=>({serverContent:{outputTranscription:{text},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm',data:'AA=='}}]}}});
export const heard=text=>({serverContent:{inputTranscription:{text}}});
export const turnDone={serverContent:{turnComplete:true}};

export function day(){
 const data=freshStore();
 const gym=editPlan(data,{type:'saveTask',fields:{title:'Gym evening',planned:'2026-10-27T13:00:00.000Z'}},NOW);
 const raj=editPlan(data,{type:'saveTask',fields:{title:'Call Raj'}},NOW);
 const milk=editPlan(data,{type:'saveTask',fields:{title:'Buy groceries'}},NOW);
 const fit=editPlan(data,{type:'saveEntity',collection:'blocks',fields:{title:'Get fit',purpose:'Energy'}},NOW);
 editPlan(data,{type:'saveEntity',collection:'projects',fields:{title:'Health'}},NOW);
 return {data,ids:{gym,raj,milk,fit}};
}
export const reply=(ramble,m)=>ramble.receive(m)[0]?.toolResponse.functionResponses.map(r=>r.response.result);
export const words={messageId:'m-1',timeZone:TZ,now:NOW};
