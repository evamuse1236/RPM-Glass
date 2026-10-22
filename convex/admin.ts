import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery } from "./functions";
import { v } from "convex/values";
import { randomSecret, sha256 } from "./security";
import type { Doc } from "./_generated/dataModel";

// These are INTERNAL functions: only deployment administrators can invoke them
// through the Convex CLI/dashboard. They are not public mobile endpoints.
export const createPairingCode=internalAction({args:{label:v.string()},handler:async(ctx,args):Promise<{code:string;expiresAt:number}>=>{
  if(!args.label.trim()||args.label.length>80)throw new Error("Use a short device label");
  const code=randomSecret(16); const expiresAt=Date.now()+30*60*1000;
  await ctx.runMutation(makeFunctionReference<"mutation">("admin:savePairingCode"),{codeHash:await sha256(code),label:args.label.trim(),expiresAt});
  return {code,expiresAt};
}});
export const savePairingCode=internalMutation({args:{codeHash:v.string(),label:v.string(),expiresAt:v.number()},handler:async(ctx,args)=>{await ctx.db.insert("pairingCodes",args);}});
export const revokeDevice=internalMutation({args:{installationId:v.string()},handler:async(ctx,args)=>{
  const device=await ctx.db.query("devices").withIndex("by_installation",q=>q.eq("installationId",args.installationId)).unique();
  if(!device)throw new Error("Device not found");await ctx.db.patch(device._id,{revoked:true});return {revoked:true};
}});
export const listDevices=internalQuery({args:{},handler:async(ctx)=>{
  return (await ctx.db.query("devices").collect()).map(({_id,installationId,label,pairedAt,lastSyncAt,revoked})=>({_id,installationId,label,pairedAt,lastSyncAt,revoked}));
}});
export const createWebSession=internalAction({args:{label:v.string()},handler:async(ctx,args):Promise<{token:string;sessionId:string}>=>{
  if(!args.label.trim()||args.label.length>80)throw new Error("Use a short browser label");
  const token=randomSecret();
  const sessionId=await ctx.runMutation(makeFunctionReference<"mutation">("admin:saveWebSession"),{tokenHash:await sha256(token),label:args.label.trim()});
  return {token,sessionId};
}});
export const saveWebSession=internalMutation({args:{tokenHash:v.string(),label:v.string()},handler:async(ctx,args)=>{
  let latest:{account:Doc<"accounts">;syncedAt:number}|null=null;
  for(const account of await ctx.db.query("accounts").collect()){
    const device=await ctx.db.get(account.device);
    if(device&&!device.revoked&&device.account===account._id&&(device.lastSyncAt??0)>=(latest?.syncedAt??-1))latest={account,syncedAt:device.lastSyncAt??0};
  }
  if(!latest)throw new Error("No paired phone has synced yet");
  const now=Date.now();
  return await ctx.db.insert("webSessions",{account:latest.account._id,device:latest.account.device,tokenHash:args.tokenHash,label:args.label,createdAt:now,lastSeenAt:now,revoked:false});
}});
