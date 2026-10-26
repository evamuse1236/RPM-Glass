import { describe, expect, it } from "vitest";
import { canonicalJson, sha256 } from "../convex/security";
import { setup, phone, linked, enqueue, command, poll } from "./plannerHelpers";
import { pull, push, read, plan, seeded } from "./standaloneHelpers";

describe("Standalone migration and tombstones",()=>{
  it("preserves the legacy receipt cursor and payload identity when allocating new receipts",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token), old=command();
    const original={status:"applied" as const,message:"Saved on the phone",newRevision:43,cursor:80};
    await t.run(async ctx=>{
      await ctx.db.patch(web.accountId as any,{cursor:80,commandCursor:undefined});
      await ctx.db.insert("webCommands",{account:web.accountId as any,device:device.id,session:web.sessionId as any,commandId:old.id,payload:old,identity:await sha256(canonicalJson(old)),...original,queuedAt:1});
    });
    expect(await (await enqueue(t,web.token,old)).json()).toEqual({id:old.id,...original});
    const created=await (await enqueue(t,web.token,plan(2,{type:"saveTask",fields:{title:"After migration"}}))).json();
    expect(created).toMatchObject({status:"applied",cursor:81});
    expect((await (await poll(t,web.token,80)).json()).commands).toEqual([created]);
    expect((await t.run(ctx=>ctx.db.query("accounts").first()))?.cursor).toBe(created.newRevision);
  });
  it("retains a deletion when the phone edited without observing it",async()=>{
    const {t,device,web}=await seeded(), before=(await (await pull(t,device.token)).json()).rows.find((r:any)=>r.key==="task:3");
    const deletion={key:before.key,baseRev:before.rev,base:before.value,value:null,stamps:{archive:new Date().toISOString()}};
    expect((await push(t,device.token,[deletion],2)).status).toBe(200);
    const row=(await (await pull(t,device.token)).json()).rows.find((r:any)=>r.key===before.key);
    expect(row.value).toBeNull();
    const edit={...deletion,value:{...before.value,title:"Offline edit"},stamps:{title:new Date().toISOString()}};
    expect((await push(t,device.token,[edit],3)).status).toBe(200);
    let snap=await read(t,web.token);
    expect(snap.entries.some((r:any)=>r.id===3)).toBe(false);
    expect(snap.conflicts).toEqual([expect.objectContaining({key:before.key,kept:null,lost:expect.objectContaining({title:"Offline edit"})})]);
    const restored=await push(t,device.token,[{...edit,baseRev:row.rev,base:null}],4);
    expect(restored.status).toBe(200);snap=await read(t,web.token);expect(snap.entries.find((r:any)=>r.id===3).title).toBe("Offline edit");
  });
  it("lets a phone delete win over a later website edit and retains the edited value",async()=>{
    const {t,device,web,receipt}=await seeded(), base=receipt.results.find((r:any)=>r.key==="task:3");
    await enqueue(t,web.token,plan(1,{type:"saveTask",id:3,fields:{notes:"Website work"}}));
    await push(t,device.token,[{key:base.key,baseRev:base.rev,base:base.value,value:null,stamps:{archive:new Date().toISOString()}}],2);
    const snap=await read(t,web.token);
    expect(snap.entries.some((r:any)=>r.id===3)).toBe(false);
    expect(snap.conflicts).toEqual([expect.objectContaining({key:base.key,lostFrom:"server",lost:expect.objectContaining({notes:"Website work"})})]);
  });
});
