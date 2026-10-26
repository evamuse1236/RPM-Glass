import { groupsOf, projectRecords, storeFromRecords } from "../web/contract/records.mjs";
// @ts-expect-error Shared reducer projection has no TypeScript declaration.
import { buildSnapshot } from "../android-companion/web-sync-snapshot.mjs";
import { canonicalJson } from "./security";
import type { PlannerCtx } from "./plannerAuth";
import type { Id } from "./_generated/dataModel";
import type { Conflict } from "../web/contract/merge.mjs";

export const equal = (a:any,b:any):boolean => canonicalJson(a)===canonicalJson(b);
export const groupValue = (value:any,fields:string[]) => fields.length?Object.fromEntries(fields.filter(field=>value?.[field]!==undefined).map(field=>[field,value[field]])):value;
export const rowsFor = async(ctx:PlannerCtx,account:Id<"accounts">) => (await ctx.db.query("plannerRecords").withIndex("by_account_key",q=>q.eq("account",account)).collect()).sort((a,b)=>a._creationTime-b._creationTime);
export async function loadStore(ctx:PlannerCtx,account:Id<"accounts">) {
  const store=storeFromRecords((await rowsFor(ctx,account)).filter(row=>!row.key.startsWith("conflict:") && row.value!==null).map(row=>[row.key,row.value]));
  for(const run of store.planner.body?.runs??[]) {
    const steps=store.planner.body.routines.find((routine:any)=>routine.id===run.routineId)?.steps??[];
    const ids=[...steps.map((step:any)=>step.id),...Object.keys(run.marks)];
    run.marks=Object.fromEntries([...new Set(ids)].filter(id=>Object.hasOwn(run.marks,id)).map(id=>[id,run.marks[id]]));
  }
  return store;
}
export function diffRecords(before:Map<string,any>,after:Map<string,any>) {
  return [...new Set([...before.keys(),...after.keys()])].filter(key=>!equal(before.get(key)??null,after.get(key)??null))
    .map(key=>({key,value:after.get(key)??null}));
}
export type Write = {key:string;value:any;stamps?:Record<string,string>};
export async function writeRecords(ctx:PlannerCtx,account:Id<"accounts">,changes:Write[],stampsAt:string) {
  const owner=(await ctx.db.get(account))!, written=[];
  let cursor=owner.cursor;
  for(const change of changes) {
    const old=await ctx.db.query("plannerRecords").withIndex("by_account_key",q=>q.eq("account",account).eq("key",change.key)).unique();
    if(old && equal(old.value,change.value) && (!change.stamps || equal(old.stamps,change.stamps)))continue;
    const stamps={...old?.stamps};
    if(change.stamps)Object.assign(stamps,change.stamps);
    else if(!change.key.startsWith("conflict:"))for(const [group,fields] of Object.entries(groupsOf(change.key.split(":")[0]))) {
      if(!old || !equal(groupValue(old.value,fields),groupValue(change.value,fields)))stamps[group]=stampsAt;
    }
    const row={account,key:change.key,rev:++cursor,value:change.value,stamps};
    if(old)await ctx.db.patch(old._id,row);else await ctx.db.insert("plannerRecords",row);
    written.push({key:row.key,rev:row.rev,before:old?.value??null,after:row.value});
  }
  if(cursor!==owner.cursor)await ctx.db.patch(account,{cursor});
  return written;
}
export async function writeConflicts(ctx:PlannerCtx,account:Id<"accounts">,conflicts:Conflict[],at:string) {
  return writeRecords(ctx,account,conflicts.map(value=>({key:`conflict:${crypto.randomUUID()}`,value})),at);
}
export async function snapshotFromRecords(ctx:PlannerCtx,account:Id<"accounts">) {
  const owner=(await ctx.db.get(account))!, rows=await rowsFor(ctx,account);
  const store=await loadStore(ctx,account);
  const savedAt=Math.max(owner.seededAt??owner.createdAt,...rows.flatMap(row=>Object.values(row.stamps).map(Date.parse)));
  return {...buildSnapshot({...store,version:owner.cursor,syncSavedAt:new Date(savedAt).toISOString()}),
    conflicts:rows.filter(row=>row.key.startsWith("conflict:") && row.value!==null).map(row=>({id:row.key,...row.value}))};
}
export { projectRecords };
