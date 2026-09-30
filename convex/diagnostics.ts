import { v } from "convex/values";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { internalAction, internalMutation, internalQuery } from "./functions";
import { canonicalJson, randomSecret, sha256 } from "./security";
import { redact } from "./diagnosticRedaction";

export const RETENTION_MS=14*24*60*60*1000;
export const createPairingCode=internalAction({args:{label:v.string()},handler:async(ctx,{label}):Promise<{code:string;expiresAt:number}>=>{
  if(!label.trim()||label.length>80)throw new Error("Use a short device label");
  const code=randomSecret(16),expiresAt=Date.now()+30*60*1000;
  await ctx.runMutation(makeFunctionReference<"mutation">("diagnostics:saveCode"),{codeHash:await sha256(code),label:label.trim(),expiresAt});
  return {code,expiresAt};
}});
export const saveCode=internalMutation({args:{codeHash:v.string(),label:v.string(),expiresAt:v.number()},handler:async(ctx,args)=>{await ctx.db.insert("diagnosticPairingCodes",args);}});
export const pair=internalMutation({args:{codeHash:v.string(),tokenHash:v.string(),installationId:v.string()},handler:async(ctx,args)=>{
  const code=await ctx.db.query("diagnosticPairingCodes").withIndex("by_hash",q=>q.eq("codeHash",args.codeHash)).unique();
  if(!code||code.usedAt||code.expiresAt<Date.now())return false;
  const old=await ctx.db.query("diagnosticDevices").withIndex("by_installation",q=>q.eq("installationId",args.installationId)).unique();
  const values={installationId:args.installationId,tokenHash:args.tokenHash,label:code.label,pairedAt:Date.now(),revoked:false};
  if(old)await ctx.db.patch(old._id,values);else await ctx.db.insert("diagnosticDevices",values);
  await ctx.db.patch(code._id,{usedAt:Date.now()});return true;
}});
function short(value:unknown,max:number,empty=false):string {if(typeof value!=="string"||value.length>max||(!empty&&!value))throw new Error("Invalid diagnostic field");return value;}
export const ingest=internalMutation({args:{tokenHash:v.string(),events:v.array(v.any())},handler:async(ctx,{tokenHash,events})=>{
  // Existing paired phones may upload diagnostics with their existing credential.
  // This endpoint never reads or queues planner records.
  const device=await ctx.db.query("diagnosticDevices").withIndex("by_token",q=>q.eq("tokenHash",tokenHash)).unique()
    ??await ctx.db.query("devices").withIndex("by_token",q=>q.eq("tokenHash",tokenHash)).unique();
  if(!device||device.revoked)return null;
  if(!events.length||events.length>20)throw new Error("Invalid batch size");
  const ack:string[]=[];
  for(const input of events){
    if(!input||typeof input!=="object"||new TextEncoder().encode(JSON.stringify(input)).length>64000)throw new Error("Invalid event size");
    const eventId=short(input.eventId,80);if(!/^[a-zA-Z0-9-]{16,80}$/.test(eventId))throw new Error("Invalid event ID");
    if(!Number.isSafeInteger(input.occurredAt)||input.occurredAt<0||input.occurredAt>Date.now()+24*60*60*1000)throw new Error("Invalid timestamp");
    if(!["log","debug","info","warn","error"].includes(input.level))throw new Error("Invalid level");
    const event={device:device._id,installationId:device.installationId,eventId,sessionId:short(input.sessionId,100),operationId:short(input.operationId??"",160,true),operation:short(input.operation??"",100,true),kind:short(input.kind,40),level:input.level as string,outcome:short(input.outcome??"",40,true),appVersion:short(input.appVersion,100),occurredAt:input.occurredAt as number,payload:redact(input.payload??{})};
    const existing=await ctx.db.query("diagnostics").withIndex("by_device_event",q=>q.eq("device",device._id).eq("eventId",eventId)).unique();
    if(existing){const {_id,_creationTime,receivedAt,...previous}=existing;if(canonicalJson(previous)!==canonicalJson(event))throw new Error("Event identity conflict");}
    else await ctx.db.insert("diagnostics",{...event,receivedAt:Date.now()});
    ack.push(eventId);
  }
  return {ack};
}});
// Internal functions are accessible only with deployment administrator credentials.
export const inspect=internalQuery({args:{paginationOpts:paginationOptsValidator,since:v.optional(v.number()),sessionId:v.optional(v.string()),operationId:v.optional(v.string()),installationId:v.optional(v.string()),level:v.optional(v.string()),appVersion:v.optional(v.string()),outcome:v.optional(v.string())},handler:async(ctx,args)=>{
  const since=Math.max(Date.now()-RETENTION_MS,args.since??0);
  let query=args.operationId?ctx.db.query("diagnostics").withIndex("by_operation",q=>q.eq("operationId",args.operationId!).gte("receivedAt",since))
    :args.sessionId?ctx.db.query("diagnostics").withIndex("by_session",q=>q.eq("sessionId",args.sessionId!).gte("receivedAt",since))
    :ctx.db.query("diagnostics").withIndex("by_received",q=>q.gte("receivedAt",since));
  if(args.installationId)query=query.filter(q=>q.eq(q.field("installationId"),args.installationId));
  if(args.level)query=query.filter(q=>q.eq(q.field("level"),args.level));
  if(args.appVersion)query=query.filter(q=>q.eq(q.field("appVersion"),args.appVersion));
  if(args.outcome)query=query.filter(q=>q.eq(q.field("outcome"),args.outcome));
  return query.order("desc").paginate({...args.paginationOpts,numItems:Math.min(100,Math.max(1,args.paginationOpts.numItems)),maximumRowsRead:1000});
}});
export const listDevices=internalQuery({args:{},handler:async(ctx)=>{
  const devices=await ctx.db.query("diagnosticDevices").collect();
  return devices.map(({installationId,label,pairedAt,revoked})=>({installationId,label,pairedAt,revoked}));
}});
export const revoke=internalMutation({args:{installationId:v.string()},handler:async(ctx,{installationId})=>{
  const device=await ctx.db.query("diagnosticDevices").withIndex("by_installation",q=>q.eq("installationId",installationId)).unique();
  if(!device)throw new Error("Diagnostic device not found. Legacy credentials use admin:revokeDevice.");
  await ctx.db.patch(device._id,{revoked:true});return {revoked:true};
}});
export const prune=internalMutation({args:{},handler:async(ctx)=>{
  const cutoff=Date.now()-RETENTION_MS,rows=await ctx.db.query("diagnostics").withIndex("by_received",q=>q.lt("receivedAt",cutoff)).take(256);
  for(const row of rows)await ctx.db.delete(row._id);
  if(rows.length===256)await ctx.scheduler.runAfter(0,makeFunctionReference<"mutation">("diagnostics:prune"),{});
  // Pairing codes are temporary credentials; expire their records as well.
  const codes=await ctx.db.query("diagnosticPairingCodes").filter(q=>q.lt(q.field("expiresAt"),Date.now())).take(256);
  for(const code of codes)await ctx.db.delete(code._id);
  return {removed:rows.length};
}});
