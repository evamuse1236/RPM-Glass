// Pure state operations shared by the desktop server and the Android bundle.
import {randomUUID} from 'node:crypto';
export const freshStore=()=>({schema:2,version:0,entries:[],memories:[],history:[],conversations:[{id:randomUUID(),title:'New conversation',messages:[],archived:false}],pending:null,undo:null,imported:null});
export function recordSnapshot(data){return structuredClone({entries:data.entries,memories:data.memories,history:data.history,conversations:data.conversations.map(c=>({id:c.id,archived:c.archived})),pending:data.pending,...(data.planner?{planner:{...data.planner,undo:null}}:{})});}
export function restoreSnapshot(data,s){
  data.entries=s.entries;data.memories=s.memories;data.pending=s.pending;
  if(s.planner)data.planner=structuredClone(s.planner);else delete data.planner;
  for(const h of data.history){const old=s.history.find(x=>x.id===h.id);if(old)h.archived=old.archived;}
  for(const c of data.conversations){const old=s.conversations.find(x=>x.id===c.id);if(old)c.archived=old.archived;}
}
