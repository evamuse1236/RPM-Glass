import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { setup, phone, request, snapshot, sync } from "./plannerHelpers";

const createWebSession = makeFunctionReference<"action">("admin:createWebSession");

describe("Admin browser key for the one paired phone",()=>{
  it("reads the phone's snapshot without a link code, and the phone can revoke it",async()=>{
    const t=setup(), device=await phone(t);
    await sync(t,device.token,{snapshot:snapshot(),acks:[]});
    const {token,sessionId}=await t.action(createWebSession,{label:"ChatGPT Site"});
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(await t.run(ctx=>ctx.db.query("webSessions").collect()))).not.toContain(token);
    const read=await request(t,"/v1/web/snapshot",token,undefined,"GET");
    expect(read.status).toBe(200);expect((await read.json()).revision).toBe(42);
    expect((await request(t,"/v1/web/revoke",device.token,{sessionId})).status).toBeLessThan(300);
    expect((await request(t,"/v1/web/snapshot",token,undefined,"GET")).status).toBe(401);
  });
  it("refuses when no phone is paired",async()=>{
    await expect(setup().action(createWebSession,{label:"ChatGPT Site"})).rejects.toThrow(/No paired phone/);
  });
  it("with an old and a new phone, the key reads the phone that synced last",async()=>{
    const t=setup(), old=await phone(t,1), current=await phone(t,2);
    await sync(t,old.token,{snapshot:snapshot(7),acks:[]});
    await t.run(async ctx=>ctx.db.patch(old.id,{lastSyncAt:1}));
    await sync(t,current.token,{snapshot:snapshot(42),acks:[]});
    const {token}=await t.action(createWebSession,{label:"ChatGPT Site"});
    expect((await (await request(t,"/v1/web/snapshot",token,undefined,"GET")).json()).revision).toBe(42);
  });
});
