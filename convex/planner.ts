import { validateCommand } from "../web/contract/validate.mjs";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./functions";
import { applyPlan } from "./plannerWrite";
import { snapshotFromRecords, writeRecords } from "./records";
import { fail, phoneAuth, webAuth, consumeQuota, unauthorized, type PlannerCtx } from "./plannerAuth";
import type { Doc, Id } from "./_generated/dataModel";

function receipt(command:Doc<"webCommands">) {
  return {id:command.payload.id,status:command.status,message:command.message,newRevision:command.newRevision,cursor:command.cursor};
}
async function nextCursor(ctx:PlannerCtx,account:Id<"accounts">) {
  const current = await ctx.db.get(account);
  if(!current)throw new Error("Missing planner account");
  const cursor = (current.commandCursor??current.cursor)+1;
  await ctx.db.patch(account,{commandCursor:cursor});
  return cursor;
}
async function revoke(ctx:PlannerCtx,session:Doc<"webSessions">) {
  await ctx.db.patch(session._id,{revoked:true});
  return {revoked:true};
}

export const exchange = internalMutation({args:{codeHash:v.string(),tokenHash:v.string(),label:v.string()},handler:async(ctx,args)=>{
  const quota = await consumeQuota(ctx,"link-exchange",30);
  if(quota)return quota;
  const code = await ctx.db.query("webLinkCodes").withIndex("by_hash",q=>q.eq("codeHash",args.codeHash)).unique();
  if(!code || code.usedAt!==undefined || code.expiresAt<=Date.now())return unauthorized();
  const device = await ctx.db.get(code.device), account = await ctx.db.get(code.account);
  if(!device || device.revoked || device.account!==code.account || account?.device!==device._id)return unauthorized();
  const now = Date.now();
  const sessionId = await ctx.db.insert("webSessions",{account:code.account,device:code.device,tokenHash:args.tokenHash,label:args.label,createdAt:now,lastSeenAt:now,revoked:false});
  await ctx.db.patch(code._id,{usedAt:now});
  return {sessionId,accountId:code.account,protocol:1};
}});

export const phone = internalMutation({args:{tokenHash:v.string(),op:v.union(v.literal("link-code"),v.literal("sessions"),v.literal("revoke")),codeHash:v.optional(v.string()),sessionId:v.optional(v.string())},handler:async(ctx,args)=>{
  const auth = await phoneAuth(ctx,args.tokenHash);
  if(auth.error)return auth.error;
  const {device,account} = auth;
  if(args.op==="link-code") {
    if(!args.codeHash)return fail(400,"invalid_request","A code is required");
    const collision = await ctx.db.query("webLinkCodes").withIndex("by_hash",q=>q.eq("codeHash",args.codeHash!)).first();
    if(collision)return fail(503,"unavailable","Please try again");
    const old = await ctx.db.query("webLinkCodes").withIndex("by_device",q=>q.eq("device",device._id)).collect();
    for(const code of old)await ctx.db.delete(code._id);
    const expiresAt = Date.now()+10*60*1000;
    await ctx.db.insert("webLinkCodes",{account,device:device._id,codeHash:args.codeHash,expiresAt});
    return {expiresAt};
  }
  if(args.op==="sessions") {
    const sessions = await ctx.db.query("webSessions").withIndex("by_account",q=>q.eq("account",account)).collect();
    return {sessions:sessions.map(session=>({id:session._id,label:session.label,createdAt:session.createdAt,lastSeenAt:session.lastSeenAt,revoked:session.revoked}))};
  }
  if(args.op==="revoke") {
    const id = ctx.db.normalizeId("webSessions",args.sessionId??"");
    const session = id?await ctx.db.get(id):null;
    if(!session || session.account!==account || session.device!==device._id)return unauthorized();
    return revoke(ctx,session);
  }
  return fail(400,"invalid_request","Unknown phone operation");
}});

const VOICE_TOKENS_PER_HOUR = 30;
/** Authenticates a browser for a voice token and spends one of its account's hourly voice tokens. */
export const voice = internalMutation({args:{tokenHash:v.string()},handler:async(ctx,args)=>{
  const auth = await webAuth(ctx,args.tokenHash);
  if(auth.error)return auth.error;
  return await consumeQuota(ctx,`voice:${auth.session.account}`,VOICE_TOKENS_PER_HOUR,3600000) ?? {ok:true};
}});

export const browser = internalMutation({args:{tokenHash:v.string(),op:v.union(v.literal("snapshot"),v.literal("enqueue"),v.literal("commands"),v.literal("revoke")),command:v.optional(v.any()),identity:v.optional(v.string()),since:v.optional(v.number())},handler:async(ctx,args)=>{
  const auth = await webAuth(ctx,args.tokenHash);
  if(auth.error)return auth.error;
  const {session} = auth;
  if(args.op==="snapshot") {
    const account=await ctx.db.get(session.account);
    return account?.seededAt!==undefined?{snapshot:await snapshotFromRecords(ctx,session.account)}:fail(404,"no_snapshot","The phone has not published a planner snapshot yet");
  }
  if(args.op==="revoke")return revoke(ctx,session);
  if(args.op==="commands") {
    const commands = await ctx.db.query("webCommands").withIndex("by_session_cursor",q=>q.eq("session",session._id).gt("cursor",args.since??0)).take(101);
    const page = commands.slice(0,100);
    return {commands:page.map(receipt),cursor:page.at(-1)?.cursor??args.since??0,hasMore:commands.length>100};
  }
  validateCommand(args.command);
  const identityId = args.command.id.toLowerCase();
  const existing = await ctx.db.query("webCommands").withIndex("by_account_id",q=>q.eq("account",session.account).eq("commandId",identityId)).unique();
  if(existing) {
    if(existing.session!==session._id || existing.identity!==args.identity)return fail(409,"command_conflict","This command ID was already used for a different action");
    return receipt(existing);
  }
  const commandId = await ctx.db.insert("webCommands",{account:session.account,session:session._id,device:session.device,commandId:identityId,payload:args.command,identity:args.identity!,status:"pending",message:"Words saved. Waiting for Capture.",newRevision:null,cursor:await nextCursor(ctx,session.account),queuedAt:Date.now()});
  const command=(await ctx.db.get(commandId))!;
  if(command.payload.type==="capture") {
    // A voice capture is a journal of the words; its changes arrive as their own plan command, so the text model never runs.
    const now=new Date().toISOString(), voice=command.payload.args.source==="voice", status=voice?"captured":"saved";
    const captureId=await ctx.db.insert("captures",{account:session.account,messageId:command.payload.id,text:command.payload.args.text,timezone:command.payload.timezone??"Asia/Kolkata",status,attempts:0});
    await writeRecords(ctx,session.account,[{key:`capture:${command.payload.id}`,value:{id:command.payload.id,text:command.payload.args.text,status,createdAt:now,receipt:[]}}],now);
    if(voice)await ctx.db.patch(commandId,{status:"applied",message:"Words saved.",newRevision:(await ctx.db.get(session.account))!.cursor});
    else await ctx.scheduler.runAfter(0,makeFunctionReference<"action">("captureRun:run"),{captureId});
  } else {
    const result=await applyPlan(ctx,session.account,command);
    await ctx.db.patch(commandId,{...result,newRevision:(await ctx.db.get(session.account))!.cursor});
  }
  return receipt((await ctx.db.get(commandId))!);
}});
