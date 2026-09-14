import { internalMutation } from "./functions";
import { v } from "convex/values";
import { canonicalJson } from "./security";

const event=v.object({eventId:v.string(),sequence:v.number(),collection:v.string(),localId:v.string(),payload:v.any()});
export const pair=internalMutation({args:{codeHash:v.string(),tokenHash:v.string(),installationId:v.string()},handler:async(ctx,args)=>{
  const code=await ctx.db.query("pairingCodes").withIndex("by_hash",q=>q.eq("codeHash",args.codeHash)).unique();
  if(!code||code.usedAt!==undefined||code.expiresAt<=Date.now())return false;
  const existing=await ctx.db.query("devices").withIndex("by_installation",q=>q.eq("installationId",args.installationId)).unique();
  const data={installationId:args.installationId,tokenHash:args.tokenHash,label:code.label,pairedAt:Date.now(),revoked:false};
  if(existing)await ctx.db.patch(existing._id,data);else await ctx.db.insert("devices",data);
  await ctx.db.patch(code._id,{usedAt:Date.now()});return true;
}});
export const ingest=internalMutation({args:{tokenHash:v.string(),events:v.array(event)},handler:async(ctx,args)=>{
  // Check auth inside the SAME transaction as all writes, including revocation races.
  const device=await ctx.db.query("devices").withIndex("by_token",q=>q.eq("tokenHash",args.tokenHash)).unique();
  if(!device||device.revoked)return null;
  if(args.events.length>50)throw new Error("Batch too large");
  const ack:string[]=[];
  for(const e of args.events){
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(e.eventId)||!Number.isSafeInteger(e.sequence)||e.sequence<1||
       !["entries","revisions","projects"].includes(e.collection)||!/^\d{1,16}$/.test(e.localId)||
       !e.payload||typeof e.payload!=="object"||Array.isArray(e.payload)||JSON.stringify(e.payload).length>300000)
      throw new Error("Invalid event");
    const duplicate=await ctx.db.query("events").withIndex("by_device_event",q=>q.eq("device",device._id).eq("eventId",e.eventId)).unique();
    if(duplicate){
      if(duplicate.sequence!==e.sequence||duplicate.collection!==e.collection||duplicate.localId!==e.localId||canonicalJson(duplicate.payload)!==canonicalJson(e.payload))throw new Error("Event identity conflict");
      ack.push(e.eventId);continue;
    }
    await ctx.db.insert("events",{...e,device:device._id,receivedAt:Date.now()});
    const current=await ctx.db.query("records").withIndex("by_device_record",q=>q.eq("device",device._id).eq("collection",e.collection).eq("localId",e.localId)).unique();
    const record={device:device._id,collection:e.collection,localId:e.localId,sequence:e.sequence,payload:e.payload,updatedAt:Date.now()};
    if(!current)await ctx.db.insert("records",record);
    else if(e.sequence>current.sequence)await ctx.db.replace(current._id,record);
    ack.push(e.eventId);
  }
  await ctx.db.patch(device._id,{lastSyncAt:Date.now()});return {ack};
}});
