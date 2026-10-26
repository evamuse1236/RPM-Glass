import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery } from "./functions";
import { diffRecords, equal, loadStore, projectRecords, writeRecords } from "./records";
import { outcome, setOutcome, stateItems, RETRY_MESSAGE } from "./captureState";
// @ts-expect-error Shared reducer is JavaScript.
import { validatePlanner } from "../android-companion/planner-state.mjs";
// @ts-expect-error Shared allocator is JavaScript.
import { initializeTaskIds, SERVER_TASK_IDS } from "../android-companion/task-ids.mjs";
import type { PlannerCtx } from "./plannerAuth";
import type { Doc } from "./_generated/dataModel";
const action=makeFunctionReference<"action">("captureRun:run");
const identity={captureId:v.id("captures"),attempt:v.number()};
const active=(row:Doc<"captures">|null,attempt:number)=>row&&row.attempts===attempt&&(row.claimedUntil??0)>Date.now();
export const claim=internalMutation({args:{captureId:v.id("captures")},handler:async(ctx,{captureId})=>{
  const row=await ctx.db.get(captureId);
  if(!row||row.status!=="saved"||row.attempts>=3||(row.claimedUntil??0)>Date.now())return null;
  const accountRows=await ctx.db.query("captures").withIndex("by_account_message",q=>q.eq("account",row.account)).collect();
  if(accountRows.some(other=>other._id!==row._id&&(other.claimedUntil??0)>Date.now()))return null;
  const patch={attempts:row.attempts+1,claimedUntil:Date.now()+300000};await ctx.db.patch(captureId,patch);return {...row,...patch};
}});
export const load=internalQuery({args:identity,handler:async(ctx,{captureId,attempt})=>{
  const row=await ctx.db.get(captureId);if(!active(row,attempt))throw new Error("Capture claim expired");
  const owner=(await ctx.db.get(row!.account))!, items=await stateItems(ctx,row!.account), store:any=await loadStore(ctx,row!.account);
  store.schema=2;store.version=(owner.captureVersion??0);store.memories=[];store.history=[];store.pending=null;store.undo=null;
  store.conversations=[{id:"server-capture",title:"New conversation",messages:[],archived:false}];
  // Public phone summaries never enter the server's private conversation state.
  store.intentV2={schema:1,captures:{},drafts:{},transactions:{},approvedMemories:[],sortPreviews:{}};
  for(const item of items)store.intentV2[`${item.kind}s`][item.id]=item.value;
  store.sync={taskIdRange:SERVER_TASK_IDS};initializeTaskIds(store).nextTaskId=Math.max(store.sync.nextTaskId,owner.nextTaskId??SERVER_TASK_IDS[0]);
  return {store,expected:{cursor:owner.cursor,version:store.version,items:items.map(item=>({kind:item.kind,id:item.id,version:item.version}))}};
}});
async function saveItems(ctx:PlannerCtx,row:Doc<"captures">,next:any,items:Doc<"captureState">[]) {
  for(const kind of ["capture","draft","transaction"] as const)for(const [id,value] of Object.entries(next.intentV2?.[`${kind}s`]??{})) {
    const old=items.find(item=>item.kind===kind&&item.id===id);if(old&&equal(old.value,value))continue;
    if(old)await ctx.db.patch(old._id,{value,version:old.version+1});
    else await ctx.db.insert("captureState",{account:row.account,kind,id,version:1,value});
  }
}
export const save=internalMutation({args:{...identity,expected:v.any(),next:v.any(),receipt:v.array(v.object({text:v.string()}))},handler:async(ctx,{captureId,attempt,expected,next,receipt})=>{
  const row=await ctx.db.get(captureId);if(!active(row,attempt))return {conflict:true};
  const owner=(await ctx.db.get(row!.account))!, items=await stateItems(ctx,row!.account);
  if(owner.cursor!==expected.cursor||(owner.captureVersion??0)!==expected.version||!equal(items.map(item=>({kind:item.kind,id:item.id,version:item.version})),expected.items))return {conflict:true};
  validatePlanner(next);
  const before=projectRecords(await loadStore(ctx,row!.account)),after=projectRecords(next);
  // Capture summaries are outcomes, never the harness's internal "interpreted" status.
  const changes=diffRecords(before,after).filter(change=>!change.key.startsWith("capture:"));
  const written=await writeRecords(ctx,row!.account,changes,new Date().toISOString());
  const inverse=[...(row!.inverse??[])];
  for(const entry of written){const prior=inverse.find(item=>item.key===entry.key);if(prior){prior.after=entry.after;prior.rev=entry.rev;}else inverse.push(entry);}
  await ctx.db.patch(captureId,{inverse});
  await saveItems(ctx,row!,next,items);
  await ctx.db.patch(row!.account,{captureVersion:(owner.captureVersion??0)+1,nextTaskId:Math.max(owner.nextTaskId??SERVER_TASK_IDS[0],next.sync?.nextTaskId??SERVER_TASK_IDS[0])});
  await setOutcome(ctx,{...row!,inverse},outcome(next,row!,false,receipt));
  return {saved:true};
}});
export const finish=internalMutation({args:{...identity,error:v.optional(v.string())},handler:async(ctx,{captureId,attempt,error})=>{
  const row=await ctx.db.get(captureId);if(!row||row.attempts!==attempt||!["saved","applied","needs-answer","words-kept"].includes(row.status))return;
  if(!active(row,attempt))return;
  await ctx.db.patch(captureId,{claimedUntil:undefined});
  if(row.status!=="saved")return;
  const items=await stateItems(ctx,row.account),store:any=await loadStore(ctx,row.account);store.intentV2={captures:{},drafts:{}};
  for(const item of items)if(item.kind!=="transaction")store.intentV2[`${item.kind}s`][item.id]=item.value;
  const result=outcome(store,row,true);if(error&&result.status==="words-kept")result.message=error;
  await setOutcome(ctx,row,result);
}});
export const recover=internalMutation({args:{},handler:async(ctx)=>{
  const rows=await ctx.db.query("captures").withIndex("by_status",q=>q.eq("status","saved")).collect();
  for(const row of rows)if((row.claimedUntil??0)<=Date.now()) {
    if(row.attempts>=3)await setOutcome(ctx,row,{status:"words-kept",message:RETRY_MESSAGE,receipt:[],taskIds:[],question:null,draftId:null});
    else await ctx.scheduler.runAfter(0,action,{captureId:row._id});
  }
}});
