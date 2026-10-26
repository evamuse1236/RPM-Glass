import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { setup, phone, request, snapshot, seed } from "./plannerHelpers";

const createWebSession = makeFunctionReference<"action">("admin:createWebSession");

describe("Admin browser key for the one paired phone",()=>{
  it("reads the phone's snapshot without a link code, and the phone can revoke it",async()=>{
    const t=setup(), device=await phone(t);
    await seed(t,device.token);
    const {token,sessionId}=await t.action(createWebSession,{label:"ChatGPT Site"});
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(await t.run(ctx=>ctx.db.query("webSessions").collect()))).not.toContain(token);
    const read=await request(t,"/v1/web/snapshot",token,undefined,"GET");
    expect(read.status).toBe(200);expect((await read.json()).entries).toEqual(snapshot().entries);
    expect((await request(t,"/v1/web/revoke",device.token,{sessionId})).status).toBeLessThan(300);
    expect((await request(t,"/v1/web/snapshot",token,undefined,"GET")).status).toBe(401);
  });
  it("refuses when no phone is paired",async()=>{
    await expect(setup().action(createWebSession,{label:"ChatGPT Site"})).rejects.toThrow(/No paired phone/);
  });
  it("with an old and a new phone, the key reads the phone that synced last",async()=>{
    const t=setup(), old=await phone(t,1), current=await phone(t,2);
    await seed(t,old.token);
    await t.run(async ctx=>ctx.db.patch(old.id,{lastSyncAt:1}));
    await seed(t,current.token);
    const {token}=await t.action(createWebSession,{label:"ChatGPT Site"});
    const owner=await t.run(ctx=>ctx.db.query("webSessions").first());
    expect(owner?.device).toBe(current.id);
    expect((await request(t,"/v1/web/snapshot",token,undefined,"GET")).status).toBe(200);
  });
});
