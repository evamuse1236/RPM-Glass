import { v } from "convex/values";
import { internalMutation } from "./functions";
import { fail, phoneAuth } from "./plannerAuth";
import { groupsOf, repairLinks, storeFromRecords } from "../web/contract/records.mjs";
import { mergeChange, type Change, type Conflict } from "../web/contract/merge.mjs";
// @ts-expect-error Shared planner validator is JavaScript.
import { validatePlanner } from "../android-companion/planner-state.mjs";
import { diffRecords, equal, groupValue, projectRecords, rowsFor, writeConflicts, writeRecords, type Write } from "./records";
import { readReceipt, saveReceipt, forgetReceipts } from "./phoneReceipts";
import { validateRecord } from "../web/contract/validate.mjs";
import { validatePush, validatePull } from "./plannerProtocol";

export const changeValidator=v.object({key:v.string(),baseRev:v.union(v.number(),v.null()),base:v.any(),value:v.any(),stamps:v.record(v.string(),v.string())});
function repaired(values:Map<string,any>) {
  const store=storeFromRecords([...values].filter(([,value])=>value!==null));
  repairLinks(store,(key:string)=>values.has(key) && values.get(key)===null);
  for(const [key,value] of projectRecords(store))validateRecord(key,value);
  validatePlanner(store);
  const projected=projectRecords(store);
  for(const [key,value] of values)if(value===null)projected.set(key,null);
  return projected;
}
export const push=internalMutation({args:{tokenHash:v.string(),seq:v.number(),part:v.number(),final:v.boolean(),changes:v.array(changeValidator)},handler:async(ctx,args)=>{
  const auth=await phoneAuth(ctx,args.tokenHash);if(auth.error)return auth.error;
  try {validatePush({seq:args.seq,part:args.part,final:args.final,changes:args.changes});}catch{return fail(400,"invalid_request","The request does not match the planner contract");}
  const {account,device}=auth, now=new Date().toISOString();
  const sync=await ctx.db.query("phoneSync").withIndex("by_account_device",q=>q.eq("account",account).eq("device",device._id)).unique();
  const existing=sync?.receipts.find(receipt=>receipt.seq===args.seq && receipt.part===args.part);
  if(existing)return readReceipt(ctx,existing);
  if(sync && (args.seq<sync.lastSeq || args.seq===sync.lastSeq && (sync.final || args.part!==sync.receipts.length)) || (!sync || args.seq>sync.lastSeq) && (args.part!==0 || sync && !sync.final))return fail(409,"seq_conflict","Resend the current push sequence and part");
  const rows=(await rowsFor(ctx,account)).filter(row=>!row.key.startsWith("conflict:")), byKey=new Map(rows.map(row=>[row.key,row]));
  const before=new Map(rows.map(row=>[row.key,row.value])), candidate=new Map(before), merged=new Map<string,Write>();
  let conflicts:Conflict[]=[];
  for(const change of args.changes as Change[]) {
    const result=mergeChange(byKey.get(change.key),change,now);
    candidate.set(change.key,result.value);merged.set(change.key,{key:change.key,value:result.value,stamps:result.stamps});
    conflicts.push(...result.conflicts);
  }
  let after:Map<string,any>;
  try {after=repaired(candidate);}catch {
    let valid=new Map(before);
    conflicts=[];
    const order=["area","goal","project","block","routine"];
    const rank=(key:string)=>{const kind=key.split(":")[0];return kind==="run"?7:order.includes(kind)?order.indexOf(kind):6;};
    for(const change of [...args.changes].sort((a,b)=>rank(a.key)-rank(b.key))) {
      const result=mergeChange(byKey.get(change.key),change,now), next=new Map(valid);next.set(change.key,result.value);
      try {valid=repaired(next);conflicts.push(...result.conflicts);}catch {
        merged.delete(change.key);
        conflicts.push({key:change.key,group:"record",kept:before.get(change.key)??null,lost:change.value,lostFrom:"phone",at:now});
      }
    }
    after=valid;
  }
  const writes=new Map(diffRecords(before,after).map(change=>[change.key,change as Write]));
  for(const [key,value] of merged)if(after.has(key)) {
    const repairedValue=after.get(key);
    const stamps={...value.stamps};
    for(const [group,fields] of Object.entries(groupsOf(key.split(":")[0])))if(!equal(groupValue(repairedValue,fields),groupValue(value.value,fields)))stamps[group]=now;
    writes.set(key,{...value,value:repairedValue,stamps});
  }
  await writeRecords(ctx,account,[...writes.values()],now);
  await writeConflicts(ctx,account,conflicts,now);
  const results=[];
  for(const change of args.changes) {
    const row=await ctx.db.query("plannerRecords").withIndex("by_account_key",q=>q.eq("account",account).eq("key",change.key)).unique();
    results.push({key:change.key,rev:row?.rev??0,value:row?.value??null});
  }
  const receipt={seq:args.seq,part:args.part,results};
  const stored=await saveReceipt(ctx,account,receipt);
  if(sync && sync.lastSeq!==args.seq)await forgetReceipts(ctx,sync.receipts);
  const data={account,device:device._id,lastSeq:args.seq,receipts:[...(sync?.lastSeq===args.seq?sync.receipts:[]),stored],final:args.final};
  if(sync)await ctx.db.patch(sync._id,data);else await ctx.db.insert("phoneSync",data);
  if(args.final && (await ctx.db.get(account))!.seededAt===undefined)await ctx.db.patch(account,{seededAt:Date.now()});
  await ctx.db.patch(device._id,{lastSyncAt:Date.now()});
  return receipt;
}});

export const pull=internalMutation({args:{tokenHash:v.string(),after:v.number(),limit:v.number()},handler:async(ctx,args)=>{
  const auth=await phoneAuth(ctx,args.tokenHash);if(auth.error)return auth.error;
  try {validatePull({after:args.after,limit:args.limit});}catch{return fail(400,"invalid_request","Use a valid record cursor and page size");}
  const query=ctx.db.query("plannerRecords").withIndex("by_account_rev",q=>q.eq("account",auth.account).gt("rev",args.after));
  const rows=[];let bytes=0,hasMore=false;
  for await(const row of query) {
    const value={key:row.key,rev:row.rev,value:row.value}, size=new TextEncoder().encode(JSON.stringify(value)).length;
    if(rows.length===args.limit || bytes+size>4000000){hasMore=true;break;}
    rows.push(value);bytes+=size;
  }
  return {rows,cursor:rows.at(-1)?.rev??args.after,hasMore,seededAt:(await ctx.db.get(auth.account))!.seededAt??null};
}});
