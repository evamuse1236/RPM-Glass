import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pull, push } from "./standaloneHelpers";
import { sha256 } from "../convex/security";
import { setup, phone, linked, request, poll } from "./plannerHelpers";
beforeEach(()=>vi.spyOn(Date,"now").mockReturnValue(1792391400000));
afterEach(()=>vi.restoreAllMocks());

describe("Planner transport quotas",()=>{
  it("limits authenticated tokens independently and returns safe retry information",async()=>{
    const t=setup(), device=await phone(t), first=await linked(t,device.token), second=await linked(t,device.token);
    const hash=await sha256(first.token);
    await poll(t,first.token);
    await t.run(async ctx=>{const rate=await ctx.db.query("webRateLimits").withIndex("by_key",q=>q.eq("key",`web:${hash}`)).unique();await ctx.db.patch(rate!._id,{count:120});});
    const limited=await poll(t,first.token);
    expect(limited.status).toBe(429);expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({error:{code:"rate_limited",message:expect.any(String)}});
    expect((await poll(t,second.token)).status).toBe(200);
    expect((await pull(t,device.token)).status).toBe(200);
    await t.run(async ctx=>{const rate=await ctx.db.query("webRateLimits").withIndex("by_key",q=>q.eq("key",`web:${hash}`)).unique();await ctx.db.patch(rate!._id,{window:Math.floor(Date.now()/60000)-1});});
    expect((await poll(t,first.token)).status).toBe(200);
  });
  it("limits planner sync, code minting, and session operations by the same phone token",async()=>{
    const t=setup(), device=await phone(t), other=await phone(t,2);
    await pull(t,device.token);
    const hash=await sha256(device.token);
    await t.run(async ctx=>{const rate=await ctx.db.query("webRateLimits").withIndex("by_key",q=>q.eq("key",`phone:${hash}`)).unique();await ctx.db.patch(rate!._id,{count:120});});
    expect((await pull(t,device.token)).status).toBe(429);
    expect((await push(t,device.token)).status).toBe(429);
    expect((await request(t,"/v1/web/link-code",device.token,{})).status).toBe(429);
    expect((await request(t,"/v1/web/sessions",device.token,undefined,"GET")).status).toBe(429);
    expect((await pull(t,other.token)).status).toBe(200);
    expect(await t.run(ctx=>ctx.db.query("webLinkCodes").collect())).toHaveLength(0);
  });
  it("bounds all unauthenticated code guesses globally and does not consume a code when throttled",async()=>{
    const t=setup(), device=await phone(t);
    const {code}=await (await request(t,"/v1/web/link-code",device.token,{})).json();
    for(let attempt=0;attempt<30;attempt++)expect((await request(t,"/v1/web/link",undefined,{code:"ABCDEFG2"})).status).toBe(401);
    const limited=await request(t,"/v1/web/link",undefined,{code});expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect((await t.run(ctx=>ctx.db.query("webLinkCodes").first()))?.usedAt).toBeUndefined();
    await t.run(async ctx=>{const rate=await ctx.db.query("webRateLimits").withIndex("by_key",q=>q.eq("key","link-exchange")).unique();await ctx.db.patch(rate!._id,{window:Math.floor(Date.now()/60000)-1});});
    expect((await request(t,"/v1/web/link",undefined,{code})).status).toBe(200);
  });
});
