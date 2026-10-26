import { equal, writeRecords } from "./records";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import type { PlannerCtx } from "./plannerAuth";
import type { Doc } from "./_generated/dataModel";
export const RETRY_MESSAGE="Your words were kept. Send again to retry.";
export const stateItems=(ctx:Pick<GenericQueryCtx<DataModel>,"db">, account:Doc<"captures">["account"])=>ctx.db.query("captureState").withIndex("by_account",q=>q.eq("account",account)).collect();
export function outcome(store:any,row:Doc<"captures">, finished=false, receipt:{text:string}[]=[]) {
  const capture=store.intentV2?.captures?.[row.messageId],draft=store.intentV2?.drafts?.[capture?.draftId];
  const question=capture?.clarification?.prompt??draft?.question?.prompt??draft?.review?.question??null;
  const taskIds=draft?.receipt?.entryIds??[];
  if(draft?.status==="committed")return {status:"applied",receipt,taskIds,message:receipt.map((r:any)=>r.text).join("\n")||"Saved.",question:null,draftId:draft.id};
  if(question)return {status:"needs-answer",receipt,taskIds,message:question,question,draftId:draft?.id??null};
  if(capture?.lastError||finished)return {status:"words-kept",receipt,taskIds,message:capture?.lastError?.message??capture?.reply??RETRY_MESSAGE,question:null,draftId:draft?.id??null};
  return {status:"saved",receipt,taskIds,message:"Words saved. Waiting for Capture.",question:null,draftId:draft?.id??null};
}
export async function setOutcome(ctx:PlannerCtx,row:Doc<"captures">,result:ReturnType<typeof outcome>) {
  const now=new Date().toISOString(), summary=await ctx.db.query("plannerRecords").withIndex("by_account_key",q=>q.eq("account",row.account).eq("key",`capture:${row.messageId}`)).unique();
  const final=result.status!=="saved";
  await writeRecords(ctx,row.account,[{key:`capture:${row.messageId}`,value:{id:row.messageId,text:row.text,status:result.status,createdAt:summary?.value?.createdAt??new Date(row._creationTime).toISOString(),receipt:result.receipt,question:result.question}}],now);
  await ctx.db.patch(row._id,{...result,draftId:result.draftId??undefined});
  if(!final)return;
  const command=await ctx.db.query("webCommands").withIndex("by_account_id",q=>q.eq("account",row.account).eq("commandId",row.messageId.toLowerCase())).unique();
  if(command) {
    const owner=(await ctx.db.get(row.account))!, cursor=(owner.commandCursor??0)+1;
    const status=result.status==="words-kept"?"rejected" as const:"applied" as const,message=result.status==="words-kept"?RETRY_MESSAGE:result.message;
    // A lost acknowledgement or post-commit annotation must not emit a new receipt.
    if(command.status===status && command.message===message && equal(command.inverse??[],row.inverse??[]))return;
    await ctx.db.patch(row.account,{commandCursor:cursor});
    await ctx.db.patch(command._id,{status,message,newRevision:owner.cursor,cursor,inverse:row.inverse??[]});
  }
}
