import { expect } from "vitest";
import { projectRecords, groupsOf } from "../web/contract/records.mjs";
import { setup, phone, linked, request, snapshot, command, type Test } from "./plannerHelpers";
export { request, command };
export const push = (t:Test, token:string, changes:any[]=[], seq=1, part=0, final=true) => request(t,"/v1/planner/push",token,{seq,part,final,changes});
export const pull = (t:Test, token:string, after=0, limit=500) => request(t,"/v1/planner/pull",token,{after,limit});
export const read = async(t:Test, token:string) => (await request(t,"/v1/web/snapshot",token,undefined,"GET")).json();
export const plan = (n:number, op:any, ids:any[]=[]) => ({...command(n),type:"plan",args:{op,ids}});
export function changes(store:any) {
  return [...projectRecords({...store,sync:{remoteActivity:Object.fromEntries(store.entries.map((entry:any)=>[entry.id,entry.reviewActivityDays??[]]))}})].map(([key,value]:any)=>({key,value,base:null,baseRev:null,stamps:Object.fromEntries(Object.keys(groupsOf(key.split(":")[0])).map(group=>[group,"2026-10-19T00:00:00.000Z"]))}));
}
export async function seeded() {
  const t=setup(), device=await phone(t), web=await linked(t,device.token), seed=snapshot();
  const response=await push(t,device.token,changes(seed));
  expect(response.status).toBe(200);
  const receipt=await response.json();
  return {t,device,web,seed,receipt};
}
export async function phoneEdit(t:Test, token:string, key:string, fields:any, seq=2) {
  const page=await (await pull(t,token)).json(), row=page.rows.find((r:any)=>r.key===key);
  return push(t,token,[{key,baseRev:row.rev,base:row.value,value:{...row.value,...fields},stamps:Object.fromEntries(Object.keys(groupsOf(key.split(":")[0])).map(group=>[group,new Date().toISOString()]))}],seq);
}
