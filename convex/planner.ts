import { validateCommand, validateSnapshot } from "../web/contract/validate.mjs";
import { v } from "convex/values";
import { internalMutation } from "./functions";
import { canonicalJson } from "./security";
import { fail, phoneAuth, webAuth, consumeQuota, unauthorized, type PlannerCtx } from "./plannerAuth";
import type { Doc, Id } from "./_generated/dataModel";

type Ack = {id:string;status:"applied"|"rejected"|"conflict";message:string;newRevision:number};
function legacyContent({schemaVersion,entries,planner,...snapshot}:any) {
  // Receipt wording was derived from the wall clock in v1; all saved fields must match.
  return {...snapshot,captures:snapshot.captures.map(({receipt,...record}:any)=>record),drafts:snapshot.drafts.map(({receipt,...record}:any)=>record)};
}
const ack = v.object({id:v.string(),status:v.union(v.literal("applied"),v.literal("rejected"),v.literal("conflict")),message:v.string(),newRevision:v.number()});
function receipt(command:Doc<"webCommands">) {
  return {id:command.payload.id,status:command.status,message:command.message,newRevision:command.newRevision,cursor:command.cursor};
}
async function nextCursor(ctx:PlannerCtx,account:Id<"accounts">) {
  const current = await ctx.db.get(account);
  if(!current)throw new Error("Missing planner account");
  const cursor = current.cursor+1;
  await ctx.db.patch(account,{cursor});
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

export const phone = internalMutation({args:{tokenHash:v.string(),op:v.union(v.literal("link-code"),v.literal("sessions"),v.literal("revoke"),v.literal("sync")),codeHash:v.optional(v.string()),sessionId:v.optional(v.string()),snapshot:v.optional(v.any()),snapshotIdentity:v.optional(v.string()),acks:v.optional(v.array(ack))},handler:async(ctx,args)=>{
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
  if(args.snapshot!==undefined)validateSnapshot(args.snapshot);
  return syncPlanner(ctx,device,account,args.snapshot,args.snapshotIdentity,args.acks??[]);
}});

async function syncPlanner(ctx:PlannerCtx,device:Doc<"devices">,account:Id<"accounts">,snapshot:any,identity:string|undefined,acks:Ack[]) {
  const retained = await ctx.db.query("plannerSnapshots").withIndex("by_account_revision",q=>q.eq("account",account)).order("desc").take(5);
  const latest = retained[0];
  // A phone upgrade can enrich the current revision without changing any v1 field.
  const upgrade = snapshot!==undefined && latest?.payload.schemaVersion===1 && snapshot.schemaVersion===2
    && canonicalJson(legacyContent(latest.payload))===canonicalJson(legacyContent(snapshot));
  if(snapshot!==undefined && (latest && (snapshot.revision<latest.revision || snapshot.revision===latest.revision && identity!==latest.identity && !upgrade))) {
    return fail(409,"snapshot_conflict","The published planner revision cannot be replaced");
  }
  const changes:Array<{command:Doc<"webCommands">;ack:Ack}> = [];
  for(const ack of acks) {
    const command = await ctx.db.query("webCommands").withIndex("by_account_id",q=>q.eq("account",account).eq("commandId",ack.id.toLowerCase())).unique();
    if(!command || command.device!==device._id)return fail(409,"command_conflict","The command does not belong to this phone");
    if(command.status!=="pending") {
      if(command.status!==ack.status || command.message!==ack.message || command.newRevision!==ack.newRevision)return fail(409,"command_conflict","A command result cannot be replaced");
      continue;
    }
    const duplicate = changes.find(change=>change.command._id===command._id);
    if(duplicate && JSON.stringify(duplicate.ack)!==JSON.stringify(ack))return fail(409,"command_conflict","Conflicting command results");
    if(!duplicate)changes.push({command,ack});
  }
  if(upgrade)await ctx.db.patch(latest._id,{payload:snapshot,identity:identity!});
  else if(snapshot!==undefined && (!latest || snapshot.revision>latest.revision)) {
    await ctx.db.insert("plannerSnapshots",{account,revision:snapshot.revision,payload:snapshot,identity:identity!});
    if(retained.length===5)await ctx.db.delete(retained[4]._id);
  }
  for(const {command,ack} of changes)await ctx.db.patch(command._id,{status:ack.status,message:ack.message,newRevision:ack.newRevision,cursor:await nextCursor(ctx,account)});
  const pending = await ctx.db.query("webCommands").withIndex("by_device_status",q=>q.eq("device",device._id).eq("status","pending")).take(100);
  const revokedCommandIds:string[] = [];
  for(const command of pending) {
    const session = await ctx.db.get(command.session);
    if(!session || session.revoked)revokedCommandIds.push(command.payload.id);
  }
  await ctx.db.patch(device._id,{lastSyncAt:Date.now()});
  const snapshots = await ctx.db.query("plannerSnapshots").withIndex("by_account_revision",q=>q.eq("account",account)).order("desc").take(5);
  return {commands:pending.map(command=>command.payload),snapshots:snapshots.map(row=>row.payload).filter(payload=>payload.schemaVersion===2),revokedCommandIds};
}

export const browser = internalMutation({args:{tokenHash:v.string(),op:v.union(v.literal("snapshot"),v.literal("enqueue"),v.literal("commands"),v.literal("revoke")),command:v.optional(v.any()),identity:v.optional(v.string()),since:v.optional(v.number())},handler:async(ctx,args)=>{
  const auth = await webAuth(ctx,args.tokenHash);
  if(auth.error)return auth.error;
  const {session} = auth;
  if(args.op==="snapshot") {
    const snapshot = await ctx.db.query("plannerSnapshots").withIndex("by_account_revision",q=>q.eq("account",session.account)).order("desc").first();
    return snapshot?{snapshot:snapshot.payload}:fail(404,"no_snapshot","The phone has not published a planner snapshot yet");
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
  const commandId = await ctx.db.insert("webCommands",{account:session.account,session:session._id,device:session.device,commandId:identityId,payload:args.command,identity:args.identity!,status:"pending",message:"Waiting for phone",newRevision:null,cursor:await nextCursor(ctx,session.account),queuedAt:Date.now()});
  return receipt((await ctx.db.get(commandId))!);
}});
