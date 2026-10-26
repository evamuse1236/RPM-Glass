"use node";
import { makeFunctionReference } from "convex/server";
// @ts-expect-error Shared Capture agent is JavaScript.
import { createCaptureAgent } from "../android-companion/capture-agent.mjs";
// @ts-expect-error Shared intent service is JavaScript.
import { createIntentService } from "../android-companion/intent-service.mjs";
// @ts-expect-error Shared trace sink is JavaScript.
import { createTraceStore } from "../android-companion/capture-trace.mjs";
// @ts-expect-error Shared planner adapter is JavaScript.
import { changePlanner } from "../android-companion/planner-tools.mjs";
// @ts-expect-error Shared editor is JavaScript.
import { editPlan } from "../android-companion/planner-state.mjs";
// @ts-expect-error Shared Undo is JavaScript.
import { undo } from "../chat-prototype/companion-tools.mjs";
// @ts-expect-error Shared explicit timezone scope is JavaScript.
import { withTimeZone } from "../android-companion/zoned-time.mjs";
// @ts-expect-error Shared user-facing error boundary is JavaScript.
import { userMessage } from "../android-companion/user-message.mjs";
// @ts-expect-error Render receipts in the Node timezone scope, before the atomic mutation.
import { receiptLines } from "../android-companion/capture-receipt.mjs";
import type { Id } from "./_generated/dataModel";
const claim=makeFunctionReference<"mutation">("captures:claim"),load=makeFunctionReference<"query">("captures:load"),save=makeFunctionReference<"mutation">("captures:save"),finish=makeFunctionReference<"mutation">("captures:finish");
// withTimeZone replaces Date/Intl globals. Serialize all accounts in this isolate.
let queue:Promise<unknown>=Promise.resolve();
export function executeCapture(ctx:any,captureId:Id<"captures">,model:(input:any,options:any)=>Promise<any>) {
  const work=async()=>{
    const row=await ctx.runMutation(claim,{captureId});if(!row)return {skipped:true};
    const identity={captureId,attempt:row.attempts};
    return withTimeZone(row.timezone,async()=>{
      let expected:any;
      const backend={
        async load(){const loaded=await ctx.runQuery(load,identity);expected=loaded.expected;return loaded.store;},
        async save(version:number,next:any){
          if(version!==expected.version)throw Object.assign(new Error("Version conflict"),{code:"VERSION_CONFLICT"});
          const draft=next.intentV2?.drafts?.[next.intentV2?.captures?.[row.messageId]?.draftId];
          const receipt=draft?.receipt?receiptLines(next,draft,new Date()).map((line:any)=>({text:[line.verb,line.title,line.was&&`${line.was} to ${line.when}`,!line.was&&line.when,line.where,line.alert].filter(Boolean).join(" · ")})):[];
          const result=await ctx.runMutation(save,{...identity,expected,receipt,next:JSON.parse(JSON.stringify(next))});
          if(result.conflict)throw Object.assign(new Error("Version conflict"),{code:"VERSION_CONFLICT"});
        },
      };
      let trace="[]";
      const traces=createTraceStore({storage:{getItem:()=>trace,setItem:(_key:string,value:string)=>{trace=value;}}});
      const service=createIntentService({scoped:true,backend,model,changePlanner,editPlan,undo,timezone:row.timezone,readCalendar:async()=>({status:"unavailable",events:[]})});
      const agent=createCaptureAgent({service,traces});
      try {
        const store=await backend.load();
        if(store.intentV2.captures[row.messageId])await agent.retry(row.messageId);
        else await agent.capture({messageId:row.messageId,conversationId:"server-capture",text:row.text});
        await ctx.runMutation(finish,identity);
      } catch(error) {await ctx.runMutation(finish,{...identity,error:userMessage(error)});}
      return {finished:true};
    });
  };
  const pending=queue.then(work,work);queue=pending.catch(()=>{});return pending;
}
