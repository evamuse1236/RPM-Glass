import { describe, expect, it } from "vitest";
import { setup, phone, linked, request, snapshot, seed, enqueue, command, poll } from "./plannerHelpers";
import { push, pull, read, changes, plan, seeded } from "./standaloneHelpers";

describe("Record snapshots and durable server receipts",()=>{
  it("retires v1 snapshot upgrades with an explicit upgrade response and no writes",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token), current=snapshot();
    for(const schemaVersion of [1,2]) {
      const response=await request(t,"/v1/planner/sync",device.token,{snapshot:{...current,schemaVersion},acks:[]});
      expect(response.status).toBe(410);expect(await response.json()).toMatchObject({error:{code:"upgrade_required"}});
    }
    expect((await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).status).toBe(404);
  });
  it("keeps a current record snapshot across revisions without reinterpreting legacy events",async()=>{
    const {t,device,web}=await seeded(), first=await read(t,web.token);
    for(let n=1;n<=6;n++)expect((await enqueue(t,web.token,plan(n,{type:"saveTask",id:3,fields:{notes:`Edit ${n}`}}))).status).toBe(200);
    const next=await read(t,web.token);
    expect(next.revision).toBeGreaterThan(first.revision);
    expect(next.entries.find((r:any)=>r.id===3).notes).toBe("Edit 6");
    expect((await (await pull(t,device.token,first.revision)).json()).rows.some((r:any)=>r.key==="task:3")).toBe(true);
    expect(await t.run(ctx=>ctx.db.query("events").collect())).toEqual([]);
  });
  it("keeps retries idempotent and rejects UUID reuse with different content or session",async()=>{
    const {t,device,web:first}=await seeded(), second=await linked(t,device.token);
    const response=await enqueue(t,first.token), initial=await response.json();
    expect(response.status).toBe(200);expect(initial).toMatchObject({id:command().id,status:"applied",cursor:1});
    const retry=await enqueue(t,first.token,Object.fromEntries(Object.entries(command()).reverse()));
    expect(retry.status).toBe(200);expect(await retry.json()).toEqual(initial);
    expect((await enqueue(t,first.token,{...command(),args:{taskId:4}})).status).toBe(409);
    expect((await enqueue(t,second.token)).status).toBe(409);
    const mixed={...command(2),id:"ABCDEF12-1234-4234-8234-123456789abc"};
    expect((await enqueue(t,first.token,mixed)).status).toBe(200);
    expect((await enqueue(t,first.token,{...mixed,id:mixed.id.toLowerCase()})).status).toBe(409);
    expect(await t.run(ctx=>ctx.db.query("webCommands").collect())).toHaveLength(2);
    expect((await (await poll(t,second.token)).json()).commands).toEqual([]);
  });
  it("returns a durable final receipt without phone delivery or acknowledgements",async()=>{
    const {t,device,web}=await seeded(), applied=await (await enqueue(t,web.token)).json();
    expect(applied.status).toBe("applied");
    for(let n=0;n<2;n++) {
      const pulled=await (await pull(t,device.token)).json();
      expect(pulled.commands).toBeUndefined();expect(pulled.revokedCommandIds).toBeUndefined();
      expect(pulled.rows.find((r:any)=>r.key==="task:3").value.done).toBe(true);
    }
    expect(await (await poll(t,web.token)).json()).toEqual({commands:[applied],cursor:applied.cursor,hasMore:false});
    expect(await (await poll(t,web.token,applied.cursor)).json()).toEqual({commands:[],cursor:applied.cursor,hasMore:false});
    expect(await (await enqueue(t,web.token)).json()).toEqual(applied);
    const oldAck=await request(t,"/v1/planner/sync",device.token,{acks:[{...applied,status:"rejected"}]});
    expect(oldAck.status).toBe(410);expect((await (await poll(t,web.token)).json()).commands).toEqual([applied]);
  });
  it("cannot mutate another account using a task or command receipt",async()=>{
    const {t,device,web}=await seeded(), other=await phone(t,2), session=await linked(t,other.token);
    const applied=await (await enqueue(t,web.token)).json();
    const result=await (await enqueue(t,session.token,{...command(2),type:"undo",args:{commandId:applied.id}})).json();
    expect(result.status).toBe("conflict");
    expect((await read(t,web.token)).entries.find((r:any)=>r.id===3).done).toBe(true);
    expect((await (await pull(t,other.token)).json()).rows).toEqual([]);
    expect((await (await pull(t,device.token)).json()).rows.length).toBeGreaterThan(0);
  });
  it("scopes records, commands and revocation to the account and owner",async()=>{
    const {t,device:first,web}=await seeded(), second=await phone(t,2), other=await linked(t,second.token);
    const different=snapshot();different.entries[2].notes="Other account";
    expect((await seed(t,second.token,different)).status).toBe(200);
    await enqueue(t,web.token);await enqueue(t,other.token,plan(1,{type:"saveTask",id:3,fields:{notes:"Only other"}}));
    expect((await read(t,web.token)).entries.find((r:any)=>r.id===3).notes).not.toBe("Only other");
    expect((await read(t,other.token)).entries.find((r:any)=>r.id===3).notes).toBe("Only other");
    expect((await request(t,"/v1/web/revoke",second.token,{sessionId:web.sessionId})).status).toBe(401);
    const bad=await phone(t,3), account=await t.run(async ctx=>(await ctx.db.get(first.id))!.account!);
    await t.run(ctx=>ctx.db.patch(bad.id,{account}));
    expect((await pull(t,bad.token)).status).toBe(409);
  });
  it("lists last-seen times and immediately revokes future writes while preserving saved receipts",async()=>{
    const {t,device,web:first}=await seeded(), second=await linked(t,device.token,"Home");
    const firstReceipt=await (await enqueue(t,first.token)).json();await enqueue(t,second.token,command(2));
    await t.run(ctx=>ctx.db.patch(first.sessionId as any,{lastSeenAt:1}));await poll(t,first.token);
    let sessions=(await (await request(t,"/v1/web/sessions",device.token,undefined,"GET")).json()).sessions;
    expect(sessions.find((s:any)=>s.id===first.sessionId).lastSeenAt).toBeGreaterThan(1);
    await request(t,"/v1/web/revoke",device.token,{sessionId:first.sessionId});
    expect((await poll(t,first.token)).status).toBe(401);expect((await enqueue(t,first.token,command(3))).status).toBe(401);
    expect(await t.run(ctx=>ctx.db.query("webCommands").withIndex("by_account_id",q=>q.eq("account",first.accountId as any).eq("commandId",command().id)).unique())).toMatchObject({status:firstReceipt.status,message:firstReceipt.message,newRevision:firstReceipt.newRevision,cursor:firstReceipt.cursor,payload:{id:firstReceipt.id}});
    sessions=(await (await request(t,"/v1/web/sessions",device.token,undefined,"GET")).json()).sessions;
    expect(sessions.find((s:any)=>s.id===first.sessionId).revoked).toBe(true);
    expect((await request(t,"/v1/web/session",second.token,undefined,"DELETE")).status).toBe(200);
    expect((await poll(t,second.token)).status).toBe(401);
  });
  it("pages final receipt cursors even for no-op commands",async()=>{
    const {t,device,web}=await seeded();
    for(let n=1;n<=101;n++)expect((await enqueue(t,web.token,plan(n,{type:"saveTask",id:3,fields:{notes:"Same"}}))).status).toBe(200);
    const first=await (await poll(t,web.token)).json();expect(first.commands).toHaveLength(100);expect(first.cursor).toBe(100);expect(first.hasMore).toBe(true);
    const second=await (await poll(t,web.token,first.cursor)).json();expect(second.commands).toHaveLength(1);expect(second.cursor).toBe(101);expect(second.hasMore).toBe(false);
    expect(first.commands.every((r:any)=>r.status==="applied")).toBe(true);
    expect((await (await pull(t,device.token)).json()).commands).toBeUndefined();
  });
  it("a revoked browser leaves applied work saved with no phone backlog to drain",async()=>{
    const {t,device,web}=await seeded();
    for(let n=1;n<=102;n++)await enqueue(t,web.token,plan(n,{type:"saveTask",id:3,fields:{notes:`Saved ${n}`}}));
    await request(t,"/v1/web/session",web.token,undefined,"DELETE");
    const rows=await t.run(ctx=>ctx.db.query("webCommands").collect());
    expect(rows).toHaveLength(102);expect(rows.every(row=>row.status==="applied")).toBe(true);
    const page=await (await pull(t,device.token)).json();expect(page.rows.find((r:any)=>r.key==="task:3").value.notes).toBe("Saved 102");
    expect(page.revokedCommandIds).toBeUndefined();expect((await enqueue(t,web.token,command(103))).status).toBe(401);
  });
  it("captures stay pending for the server worker through browser revocation",async()=>{
    const {t,device,web}=await seeded(), capture={...command(),type:"capture",args:{text:"Keep these words"}};
    const receipt=await (await enqueue(t,web.token,capture)).json();expect(receipt.status).toBe("pending");
    await request(t,"/v1/web/revoke",device.token,{sessionId:web.sessionId});
    expect((await enqueue(t,web.token,command(2))).status).toBe(401);
    expect(await t.run(ctx=>ctx.db.query("captures").first())).toMatchObject({text:capture.args.text,status:"saved"});
    const page=await (await pull(t,device.token)).json();expect(page.commands).toBeUndefined();
    expect(page.rows.find((r:any)=>r.key===`capture:${capture.id}`).value.text).toBe(capture.args.text);
  });
  it("recovers a lost response from the receipt after a phone push",async()=>{
    const {t,device,web}=await seeded(), applied=await (await enqueue(t,web.token)).json();
    await push(t,device.token,[],2);
    expect(await (await enqueue(t,web.token)).json()).toEqual(applied);
    const snapshot=await read(t,web.token);expect(snapshot.entries.find((r:any)=>r.id===3).done).toBe(true);
    expect((await (await poll(t,web.token)).json()).commands).toEqual([applied]);
  });
});

describe("Store-shaped planner v2 boundary",()=>{
  it("applies plan ops and rejects model ops or deep record leaks",async()=>{
    const {t,device,web,seed}=await seeded();
    const edit=plan(1,{type:"saveTask",id:3,fields:{notes:"Browser",recurrence:"days",repeatDays:[1,3],planned:"2026-10-29T08:00:00.000Z"}});
    expect((await (await enqueue(t,web.token,edit)).json()).status).toBe("applied");
    for(const type of ["aiDraft","acceptDraft","dismissDraft","undo"]) {
      expect((await enqueue(t,web.token,plan(2,{type}))).status).toBe(400);
      expect((await enqueue(t,web.token,plan(2,{type:"batch",ops:[{type}]}))).status).toBe(400);
    }
    const unsafe=changes(seed), run=unsafe.find((r:any)=>r.key.startsWith("run:"))!;
    run.value.marks[Object.keys(run.value.marks)[0]].token="private";
    expect((await push(t,device.token,unsafe,2)).status).toBe(400);
    const unknown=changes(seed);unknown.find((r:any)=>r.key.startsWith("task:"))!.value.alertIntent.unknown=true;
    expect((await push(t,device.token,unknown,2)).status).toBe(400);
    expect((await read(t,web.token)).entries.find((r:any)=>r.id===3).notes).toBe("Browser");
    expect((await read(t,web.token)).planner.body.runs[0].marks).toEqual(seed.planner.body.runs[0].marks);
  });
});
