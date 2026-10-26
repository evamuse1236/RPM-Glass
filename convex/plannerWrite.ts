// @ts-expect-error Shared planner reducer is JavaScript.
import { editPlan, validatePlanner } from "../android-companion/planner-state.mjs";
// @ts-expect-error Shared ID source is JavaScript.
import { withIds } from "../android-companion/new-id.mjs";
// @ts-expect-error Shared task ID ranges are JavaScript.
import { initializeTaskIds, SERVER_TASK_IDS } from "../android-companion/task-ids.mjs";
// @ts-expect-error Shared user-facing error boundary is JavaScript.
import { userMessage } from "../android-companion/user-message.mjs";
import { applyRecord, groupsOf } from "../web/contract/records.mjs";
import { diffRecords, equal, groupValue, loadStore, projectRecords, rowsFor, writeRecords } from "./records";
import type { PlannerCtx } from "./plannerAuth";
import type { Doc, Id } from "./_generated/dataModel";

function operation(command:any) {
  const {type, args: a} = command;
  if (type === 'plan') return a.op;
  if (type === 'complete') return {type: 'saveTask', id: a.taskId, occurrence: a.occurrence, fields: {done: true}};
  if (type === 'uncomplete') return {type: 'reopenTask', id: a.taskId, occurrence: a.occurrence};
  if (type === 'reschedule') return {type: 'saveTask', id: a.taskId, fields: {planned: a.time, plannedDate: a.day}};
  if (type === 'edit') { const {time, ...fields} = a.fields; if ('time' in a.fields) fields.planned = time; return {type: 'saveTask', id: a.taskId, fields}; }
  if (type === 'move-to-block') return {type: 'moveTask', id: a.taskId, blockId: a.blockId};
  if (type === 'archive' || type === 'restore') return {type: type === 'archive' ? 'archiveTask' : 'restoreTask', id: a.taskId, disposition: 'trash'};
  if (type === 'log-water') return {type: 'drinkWater', at: a.at};
  if (type === 'log-meal') return {type: 'saveMeal', meal: {name: a.name, slot: a.slot, at: a.at}};
  return {type: 'undo'};
}

function allocateTasks(store:any,known:Set<number>,taken:Set<number>,proposals:number[],next:number) {
  const replacements=new Map<number,number>();
  for(const entry of store.entries)if(!known.has(entry.id)) {
    const proposed=proposals.shift();
    while(taken.has(next))next++;
    const id=typeof proposed==="number" && Number.isInteger(proposed) && proposed>=1000000000 && proposed<2147483648 && !taken.has(proposed)?proposed:next;
    if(id>=2147483648)throw new Error("The planner has no task IDs left.");
    replacements.set(entry.id,id);entry.id=id;taken.add(id);next=Math.max(next,id+1);
  }
  for(const review of Object.values(store.planner.reviews) as any[])for(const field of ["inboxIds","keptIds"])if(review[field])review[field]=review[field].map((id:number)=>replacements.get(id)??id);
  return next;
}
async function undo(ctx:PlannerCtx,account:Id<"accounts">,command:Doc<"webCommands">,store:any) {
  const target=await ctx.db.query("webCommands").withIndex("by_account_id",q=>q.eq("account",account).eq("commandId",command.payload.args.commandId.toLowerCase())).unique();
  const capture=await ctx.db.query("captures").withIndex("by_account_message",q=>q.eq("account",account).eq("messageId",target?.payload.id??command.payload.args.commandId)).unique();
  const inverse=capture?.inverse??target?.inverse;
  if(target?.status!=="applied" || !inverse)return null;
  const rows=new Map((await rowsFor(ctx,account)).map(row=>[row.key,row]));
  let kept=false;
  for(const entry of inverse) {
    const row=rows.get(entry.key), current=row?.value??null;
    if(row?.rev===entry.rev) {applyRecord(store,entry.key,entry.before);continue;}
    if(current===null || entry.before===null || entry.after===null) {kept=true;continue;}
    let restored=structuredClone(current);
    for(const fields of Object.values(groupsOf(entry.key.split(":")[0]))) {
      if(equal(groupValue(current,fields),groupValue(entry.after,fields))) {
        if(!fields.length)restored=structuredClone(entry.before);
        else for(const field of fields) {
          if(Object.hasOwn(entry.before,field))restored[field]=structuredClone(entry.before[field]);else delete restored[field];
        }
      } else if(!equal(groupValue(current,fields),groupValue(entry.before,fields)))kept=true;
    }
    applyRecord(store,entry.key,restored);
  }
  try {validatePlanner(store);}catch {return null;}
  return kept;
}

export async function applyPlan(ctx:PlannerCtx,account:Id<"accounts">,command:Doc<"webCommands">) {
  const store=await loadStore(ctx,account), before=projectRecords(store), now=new Date();
  let message="Saved.",nextTaskId:number|undefined;
  if(command.payload.type==="undo") {
    const kept=await undo(ctx,account,command,store);
    if(kept===null)return {status:"conflict" as const,message:"This changed since; Undo it on the phone after reviewing."};
    message=kept?"Change undone. Newer changes were kept.":"Change undone.";
  } else {
    try {
      const rows=await rowsFor(ctx,account), owner=(await ctx.db.get(account))!;
      const taken=new Set(rows.filter(row=>row.key.startsWith("task:")).map(row=>Number(row.key.slice(5))));
      const known=new Set<number>(store.entries.map((entry:any)=>entry.id));
      store.sync={taskIdRange:SERVER_TASK_IDS};
      initializeTaskIds(store).nextTaskId=Math.max(store.sync.nextTaskId,owner.nextTaskId??SERVER_TASK_IDS[0]);
      const ids=command.payload.args.ids??[], used=new Set<string>();
      const takenEntities=JSON.stringify([store.planner??null,store.entries.map((entry:any)=>entry.id)]);
      withIds(ids.filter((id:any)=>typeof id==="string"),()=>editPlan(store,operation(command.payload),now), (id:string)=>{
        const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && !takenEntities.includes(id) && !used.has(id);
        if(valid)used.add(id);return valid;
      });
      nextTaskId=allocateTasks(store,known,taken,ids.filter((id:any)=>typeof id==="number"),owner.nextTaskId??1000000000);
      validatePlanner(store);
    } catch(error) {return {status:"rejected" as const,message:userMessage(error)};}
  }
  const inverse=await writeRecords(ctx,account,diffRecords(before,projectRecords(store)),now.toISOString());
  if(nextTaskId!==undefined)await ctx.db.patch(account,{nextTaskId});
  await ctx.db.patch(command._id,{inverse});
  return {status:"applied" as const,message};
}
