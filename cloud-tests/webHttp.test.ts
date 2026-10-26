import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { pull, push, changes } from "./standaloneHelpers";
import { sha256 } from "../convex/security";
import { setup, phone, linked, request, snapshot, seed, enqueue, command, poll } from "./plannerHelpers";

afterEach(()=>vi.unstubAllEnvs());
describe("Web planner HTTP security",()=>{
  it("lazily assigns an account without changing legacy device, events, or records",async()=>{
    const t=setup(), device=await phone(t);
    await t.run(async ctx=>{
      await ctx.db.insert("events",{device:device.id,eventId:"old-event",sequence:1,collection:"entries",localId:"1",payload:{title:"legacy"},receivedAt:1});
      await ctx.db.insert("records",{device:device.id,sequence:1,collection:"entries",localId:"1",payload:{title:"legacy"},updatedAt:1});
    });
    const before=await t.run(ctx=>ctx.db.get(device.id));
    expect((await pull(t,device.token)).status).toBe(200);
    const after=await t.run(ctx=>ctx.db.get(device.id));
    expect(after).toMatchObject({...before,account:expect.any(String)});
    expect(await t.run(ctx=>ctx.db.query("accounts").collect())).toHaveLength(1);
    expect(await t.run(ctx=>ctx.db.query("events").collect())).toHaveLength(1);
    expect(await t.run(ctx=>ctx.db.query("records").collect())).toHaveLength(1);
    const session=await linked(t,device.token);
    expect((await request(t,"/v1/web/snapshot",session.token,undefined,"GET")).status).toBe(404);
  });
  it("preserves device ID and account when the same installation pairs again",async()=>{
    const t=setup(), installationId="12345678-1234-1234-1234-123456789abc";
    const pair=async()=>{
      const {code}=await t.action(makeFunctionReference<"action">("admin:createPairingCode"),{label:"Phone"});
      return (await (await request(t,"/v1/pair",undefined,{code,installationId})).json()).token as string;
    };
    const first=await pair();await seed(t,first);
    const before=await t.run(ctx=>ctx.db.query("devices").first());
    const second=await pair();
    expect(second).not.toBe(first);
    const after=await t.run(ctx=>ctx.db.query("devices").first());
    expect(after?._id).toBe(before?._id);expect(after?.account).toBe(before?.account);
    expect((await pull(t,first)).status).toBe(401);expect((await pull(t,second)).status).toBe(200);
    expect(await t.run(ctx=>ctx.db.query("plannerRecords").collect())).toHaveLength(changes(snapshot()).length);
  });
  it("mints eight-character one-use codes and stores only hashes",async()=>{
    const t=setup(), device=await phone(t);
    const {code,expiresAt}=await (await request(t,"/v1/web/link-code",device.token,{})).json();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(expiresAt-Date.now()).toBeGreaterThan(590000);expect(expiresAt-Date.now()).toBeLessThanOrEqual(600000);
    const session=await (await request(t,"/v1/web/link",undefined,{code,label:"Browser"})).json();
    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    expect((await request(t,"/v1/web/link",undefined,{code})).status).toBe(401);
    const stored=await t.run(ctx=>ctx.db.query("webSessions").collect());
    expect(stored[0].tokenHash).toBe(await sha256(session.token));
    expect(JSON.stringify(stored)).not.toContain(session.token);
    expect(JSON.stringify(await t.run(ctx=>ctx.db.query("webLinkCodes").collect()))).not.toContain(code);
  });
  it("invalidates previous unused codes and rejects expired codes or revoked phones",async()=>{
    const t=setup(), device=await phone(t);
    const first=await (await request(t,"/v1/web/link-code",device.token,{})).json();
    const second=await (await request(t,"/v1/web/link-code",device.token,{})).json();
    expect((await request(t,"/v1/web/link",undefined,{code:first.code})).status).toBe(401);
    await t.run(async ctx=>{const code=await ctx.db.query("webLinkCodes").first();await ctx.db.patch(code!._id,{expiresAt:Date.now()-1});});
    expect((await request(t,"/v1/web/link",undefined,{code:second.code})).status).toBe(401);
    const third=await (await request(t,"/v1/web/link-code",device.token,{})).json();
    await t.run(ctx=>ctx.db.patch(device.id,{revoked:true}));
    expect((await request(t,"/v1/web/link",undefined,{code:third.code})).status).toBe(401);
  });
  it("authenticates conditional snapshot reads before returning 304",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    const empty=await request(t,"/v1/web/snapshot",web.token,undefined,"GET");
    expect(empty.status).toBe(404);expect(await empty.json()).toEqual({error:{code:"no_snapshot",message:expect.any(String)}});
    await seed(t,device.token);
    const current=await request(t,"/v1/web/snapshot",web.token,undefined,"GET");
    const published=await current.json();
    expect(current.headers.get("ETag")).toBe(`"rpm-${published.revision}"`);expect(published.entries).toEqual(snapshot().entries);
    const conditional={"If-None-Match":current.headers.get("ETag")!};
    const unchanged=await request(t,"/v1/web/snapshot",web.token,undefined,"GET",conditional);
    expect(unchanged.status).toBe(304);expect(await unchanged.text()).toBe("");
    await request(t,"/v1/web/session",web.token,undefined,"DELETE");
    expect((await request(t,"/v1/web/snapshot",web.token,undefined,"GET",conditional)).status).toBe(401);
    expect((await request(t,"/v1/web/snapshot","a".repeat(64),undefined,"GET",conditional)).status).toBe(401);
  });
  it("allows configured production and explicit localhost origins with correct preflight",async()=>{
    vi.stubEnv("RPM_WEB_ORIGIN","https://planner.example.com");
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    for(const origin of ["https://planner.example.com","http://localhost:5173","http://127.0.0.1:8080"]) {
      const response=await request(t,"/v1/web/snapshot",web.token,undefined,"GET",{Origin:origin});
      expect(response.status).toBe(404);expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Vary")).toBe("Origin");expect(response.headers.get("Cache-Control")).toBe("no-store");
      const preflight=await request(t,"/v1/web/commands",undefined,undefined,"OPTIONS",{Origin:origin});
      expect(preflight.status).toBe(204);expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("If-None-Match");
      expect(preflight.headers.get("Access-Control-Expose-Headers")).toContain("ETag");
      expect(preflight.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    }
    for(const origin of ["https://evil.example","http://localhost","http://localhost:99999","https://localhost:5173","null"]) {
      for(const method of ["GET","OPTIONS"]) {
        const response=await request(t,"/v1/web/snapshot",web.token,undefined,method,{Origin:origin});
        expect(response.status).toBe(403);expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
        expect(await response.json()).toMatchObject({error:{code:"origin_forbidden",message:expect.any(String)}});
      }
    }
  });
  it("returns structured errors for bad JSON, schema, cursor, credentials, and oversized bodies",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    const badJson=await t.fetch("/v1/web/commands",{method:"POST",headers:{Authorization:`Bearer ${web.token}`},body:"{"});
    expect(badJson.status).toBe(400);expect(await badJson.json()).toMatchObject({error:{code:"invalid_request"}});
    const badSchema=await enqueue(t,web.token,{...command(),privateKey:"secret"});expect(badSchema.status).toBe(400);
    expect((await enqueue(t,web.token,{...command(),args:{taskId:3,unknown:true}})).status).toBe(400);
    const leaked=changes(snapshot());leaked[0].value.token="leak";
    expect((await push(t,device.token,leaked)).status).toBe(400);
    expect((await request(t,"/v1/planner/push",device.token,{seq:1,part:0,final:true,changes:[],acks:[]})).status).toBe(400);
    for(const value of ["-1","1.5","9007199254740992","NaN"])
      expect((await request(t,`/v1/web/commands?since=${value}`,web.token,undefined,"GET")).status).toBe(400);
    expect((await request(t,"/v1/web/snapshot",device.token,undefined,"GET")).status).toBe(401);
    expect((await pull(t,web.token)).status).toBe(401);
    expect((await request(t,"/v1/web/snapshot",undefined,undefined,"GET")).status).toBe(401);
    const tooBig=await enqueue(t,web.token,{...command(),args:{text:"x".repeat(1000000)}});
    expect(tooBig.status).toBe(413);expect(await tooBig.json()).toMatchObject({error:{code:"body_too_large"}});
    expect((await poll(t,web.token)).status).toBe(200);
    expect(await t.run(ctx=>ctx.db.query("webCommands").collect())).toHaveLength(0);
  });
  it("returns a safe service error without revealing internal failures or tokens",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    await t.run(async ctx=>{
      const session=(await ctx.db.query("webSessions").first())!;
      const {_id,_creationTime,...copy}=session;
      await ctx.db.insert("webSessions",copy);
    });
    const response=await poll(t,web.token);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:{code:"unavailable",message:"Planner service is temporarily unavailable"}});
  });
});
