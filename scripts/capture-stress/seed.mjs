export const NOW='2026-10-19T04:30:00.000Z';
export const TIMEZONE='Asia/Kolkata';

export function seedFixture({seedStore,editPlan,intentState,saved}){
 const {data}=seedStore(new Date(NOW));
 data.entries=[];
 data.conversations=[{id:'stress',title:'New conversation',messages:[],archived:false}];
 data.history=[];data.pending=null;data.undo=null;delete data.intentV2;
 const tasks=saved?saved.map(t=>[t.id,t.title,t.planned??null,t.minutes??null,t]):[
  [101,'Call Raj','2026-10-19T16:00:00+05:30',20],
  [102,'Gym morning','2026-10-20T07:00:00+05:30',45],
  [103,'Gym evening','2026-10-20T19:00:00+05:30',45],
  [104,'Submit workbook','2026-10-19T17:00:00+05:30',30],
  [105,'Buy groceries','2026-10-20T18:00:00+05:30',30],
  [106,'Call Amma','2026-10-19T20:00:00+05:30',20],
 ];
 for(const [id,title,planned,minutes,extra] of tasks){
  const created=editPlan(data,{type:'saveTask',fields:{title,...(planned?{planned:new Date(planned).toISOString()}:{}),...(extra?.plannedDate?{plannedDate:extra.plannedDate}:{}),...(minutes?{minutes}:{}),...(id===104||extra?.alert?{alert:extra?.alert??'alarm'}:{})}},new Date(NOW));
  data.entries.find(e=>e.id===created).id=id;
 }
 const state=intentState(data);
 state.captures['seed-dinner']={messageId:'seed-dinner',conversationId:'stress',raw:'Cook dinner and buy dinner ingredients',at:NOW,timezone:TIMEZONE,status:'interpreted',draftId:'draft-dinner'};
 const field=value=>({name:'title',op:'set',value,origin:'stated',evidence:value,sourceMessageId:'seed-dinner'});
 state.drafts['draft-dinner']={id:'draft-dinner',conversationId:'stress',revision:1,status:'draft',mode:'capture',created:NOW,updated:NOW,
  sourceMessageIds:['seed-dinner'],operations:[['dinner1','Cook dinner'],['dinner2','Buy dinner ingredients']].map(([opId,title])=>({opId,sourceId:'s0',kind:'create',entity:'task',targetId:null,fields:[field(title)],sourceMessageIds:['seed-dinner']})),
  guards:{},question:null,review:null,reply:'',schedulePreview:null,timeAnchorAt:NOW};
 data.planner.drafts??=[];
 data.planner.drafts.push({id:'seed-weekend',title:'A calm weekend',status:'draft',created:NOW});
 data.version=0;data.planner.undo=null;data.undo=null;
 const events=[{id:'cal-dentist',title:'Dentist appointment',start:Date.parse('2026-10-20T11:00:00+05:30'),end:Date.parse('2026-10-20T11:30:00+05:30')}];
 return {data,events};
}
