import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "./_generated/dataModel";

export type PlannerCtx = GenericMutationCtx<DataModel>;
export type Failure = {status:number;error:{code:string;message:string};retryAfter?:number};
export const fail = (status:number,code:string,message:string):Failure => ({status,error:{code,message}});
export const unauthorized = () => fail(401,"unauthorized","Credentials are invalid or expired");

export async function accountFor(ctx:PlannerCtx,device:Doc<"devices">) {
  if(device.account)return device.account;
  const account = await ctx.db.insert("accounts",{device:device._id,cursor:0,commandCursor:0,nextTaskId:1000000000,createdAt:Date.now()});
  await ctx.db.patch(device._id,{account});
  return account;
}

export async function consumeQuota(ctx:PlannerCtx,key:string,limit=120):Promise<Failure|null> {
  const now = Date.now(), window = Math.floor(now/60000);
  const quota = await ctx.db.query("webRateLimits").withIndex("by_key",q=>q.eq("key",key)).unique();
  if(quota?.window===window && quota.count>=limit) {
    return {...fail(429,"rate_limited","Please wait before trying again"),retryAfter:Math.max(1,Math.ceil(((window+1)*60000-now)/1000))};
  }
  if(quota)await ctx.db.patch(quota._id,{window,count:quota.window===window?quota.count+1:1});
  else await ctx.db.insert("webRateLimits",{key,window,count:1});
  return null;
}

export async function phoneAuth(ctx:PlannerCtx,tokenHash:string) {
  const device = await ctx.db.query("devices").withIndex("by_token",q=>q.eq("tokenHash",tokenHash)).unique();
  if(!device || device.revoked)return {error:unauthorized()} as const;
  const quota = await consumeQuota(ctx,`phone:${tokenHash}`);
  if(quota)return {error:quota} as const;
  const account = await accountFor(ctx,device);
  const owner = await ctx.db.get(account);
  if(!owner || owner.device!==device._id)return {error:fail(409,"ownership_conflict","This phone does not own the planner")} as const;
  return {device,account} as const;
}

export async function webAuth(ctx:PlannerCtx,tokenHash:string) {
  const session = await ctx.db.query("webSessions").withIndex("by_token",q=>q.eq("tokenHash",tokenHash)).unique();
  if(!session || session.revoked)return {error:unauthorized()} as const;
  const device = await ctx.db.get(session.device), account = await ctx.db.get(session.account);
  if(!device || device.revoked || device.account!==session.account || account?.device!==device._id)return {error:unauthorized()} as const;
  const quota = await consumeQuota(ctx,`web:${tokenHash}`);
  if(quota)return {error:quota} as const;
  await ctx.db.patch(session._id,{lastSeenAt:Date.now()});
  return {session} as const;
}
