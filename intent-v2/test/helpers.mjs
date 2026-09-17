import {sourceUnits} from '../src/context.mjs';
import {createMemoryBackend,createRepository} from '../src/repository.mjs';
import {IntentHarness} from '../src/harness.mjs';
export const NOW='2026-09-16T04:00:00.000Z';
export const seed=()=>({schema:2,version:0,entries:[],memories:[],history:[],conversations:[{id:'c1',messages:[],archived:false},{id:'c2',messages:[],archived:false}],pending:null,undo:null,planner:{schema:1,projects:[],blocks:[],areas:[],goals:[],events:[],drafts:[],context:{approved:false,vision:'',goals:''},undo:null}});
export const field=(name,value,evidence='Plan the lesson',origin='stated',op='set')=>({name,value,evidence,origin,op});
export const operation=(fields=[field('title','Plan the lesson')],extra={})=>({opId:'task1',sourceId:'s0',kind:'create',entity:'task',targetId:null,fields,...extra});
export const turn=(raw='Plan the lesson',operations=[operation()],extra={})=>({schemaVersion:1,mode:'capture',draftMode:'new',reply:'Let’s make room for the next step.',decisions:sourceUnits(raw).map(u=>({sourceId:u.id,disposition:'action'})),operations,question:null,memoryCandidates:[],...extra});
export function fakeAdapter(){let calls=0;return {get calls(){return calls;},async applyPlan({data,draft,approval}){
 calls++;const before=structuredClone(data.entries);
 for(const op of draft.operations){if(op.entity!=='task')continue;let e=op.kind==='create'?{id:Math.max(0,...data.entries.map(e=>e.id))+1,kind:'plan',title:'',raw:'fixture',minutes:null,done:false,revisions:[],archived:false}:data.entries.find(e=>String(e.id)===op.targetId);if(!e)throw new Error('Missing fixture target');
  for(const f of op.fields)e[f.name]=f.op==='clear'?null:f.value;
  if(op.kind==='create')data.entries.push(e);if(op.kind==='complete')e.done=true;if(op.kind==='archive')e.archived=true;
 }
 const undoId='undo-'+approval.actionId;data.undo={id:undoId,before};return {status:'committed',receipt:{undoId,entryIds:data.entries.map(e=>e.id)}};
 },async undoPlan({data,receipt}){if(data.undo?.id!==receipt.undoId)throw new Error('Newer change');data.entries=data.undo.before;data.undo=null;return {text:'Undone'};}};}
export function setup(model=async()=>turn(),opts={}){const backend=opts.backend??createMemoryBackend(opts.seed??seed()),repository=createRepository(backend),adapter=opts.adapter??fakeAdapter();const harness=new IntentHarness({repository,model,applyPlan:x=>adapter.applyPlan(x),undoPlan:x=>adapter.undoPlan(x),clock:()=>new Date(NOW),maxRepairCalls:0,...opts});return {backend,repository,adapter,harness};}
export const getDraft=async(repository,id)=>(await repository.load()).intentV2.drafts[id];
export const actionFor=(draft,kind='commit',extra={})=>({kind,draftId:draft.id,conversationId:draft.conversationId,revision:draft.revision,...extra});
export async function captured(set,text='Plan the lesson',extra={}){const result=await set.harness.capture({messageId:'m1',conversationId:'c1',text,...extra});return {result,draft:result.draftId?await getDraft(set.repository,result.draftId):null};}
