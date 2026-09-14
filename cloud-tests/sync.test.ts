import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe,it,expect } from "vitest";
import schema from "../convex/schema";
import { sha256 } from "../convex/security";
const modules=import.meta.glob("../convex/**/*.{ts,js}");
const admin=makeFunctionReference<"action">("admin:createPairingCode");
const installation="12345678-1234-1234-1234-123456789abc";
async function paired(t:ReturnType<typeof convexTest>){
  const result=await t.action(admin,{label:"Test phone"});
  const res=await t.fetch("/v1/pair",{method:"POST",body:JSON.stringify({code:result.code,installationId:installation})});
  expect(res.status).toBe(200);return (await res.json()).token as string;
}
function event(n:number,title="Run"){return {eventId:`event-${String(n).padStart(20,"0")}`,sequence:n,collection:"entries",localId:"1",payload:{_id:1,title,raw:"Go for a run",minutes:30,duration_source:"default_estimate"}};}
async function upload(t:ReturnType<typeof convexTest>,token:string,events:unknown[]){return t.fetch("/v1/sync",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({events})});}
describe("RPM authenticated sync",()=>{
  it("does not accept unauthenticated uploads",async()=>{const t=convexTest(schema,modules);expect((await t.fetch("/v1/sync",{method:"POST",body:'{"events":[]}'})).status).toBe(401);expect((await t.run(ctx=>ctx.db.query("events").collect())).length).toBe(0);});
  it("pairs once, never stores the raw code or token",async()=>{
    const t=convexTest(schema,modules);const code=await t.action(admin,{label:"S24 FE"});const request={method:"POST",body:JSON.stringify({code:code.code,installationId:installation})};
    const first=await t.fetch("/v1/pair",request);expect(first.status).toBe(200);const {token}=await first.json();expect((await t.fetch("/v1/pair",request)).status).toBe(401);
    const devices=await t.run(ctx=>ctx.db.query("devices").collect());expect(devices[0].tokenHash).toBe(await sha256(token));expect(JSON.stringify(devices)).not.toContain(token);
  });
  it("acknowledges committed records and keeps retries idempotent",async()=>{
    const t=convexTest(schema,modules);const token=await paired(t);const e=event(1);
    expect(await (await upload(t,token,[e])).json()).toEqual({ack:[e.eventId]});expect((await upload(t,token,[{...e,payload:Object.fromEntries(Object.entries(e.payload).reverse())}])).status).toBe(200);
    expect((await t.run(ctx=>ctx.db.query("events").collect())).length).toBe(1);expect((await t.run(ctx=>ctx.db.query("records").collect())).length).toBe(1);
  });
  it("keeps the newest snapshot when an older event arrives late",async()=>{
    const t=convexTest(schema,modules);const token=await paired(t);await upload(t,token,[event(2,"20 minute run")]);await upload(t,token,[event(1,"30 minute run")]);
    const records=await t.run(ctx=>ctx.db.query("records").collect());expect(records[0].payload.title).toBe("20 minute run");expect((await t.run(ctx=>ctx.db.query("events").collect())).length).toBe(2);
  });
  it("rejects an identity collision without overwriting existing data",async()=>{
    const t=convexTest(schema,modules);const token=await paired(t);await upload(t,token,[event(1)]);expect((await upload(t,token,[event(1,"Different content")])).status).toBe(400);
    expect((await t.run(ctx=>ctx.db.query("records").collect()))[0].payload.title).toBe("Run");
  });
  it("rejects malformed batches atomically",async()=>{
    const t=convexTest(schema,modules);const token=await paired(t);expect((await upload(t,token,[event(1),{...event(2),collection:"devices"}])).status).toBe(400);
    expect((await t.run(ctx=>ctx.db.query("events").collect())).length).toBe(0);
  });
  it("revokes device access and preserves existing records",async()=>{
    const t=convexTest(schema,modules);const token=await paired(t);await upload(t,token,[event(1)]);
    await t.mutation(makeFunctionReference<"mutation">("admin:revokeDevice"),{installationId:installation});expect((await upload(t,token,[event(2)])).status).toBe(401);expect((await t.run(ctx=>ctx.db.query("records").collect())).length).toBe(1);
  });
  it("scopes records to the authenticated installation",async()=>{
    const t=convexTest(schema,modules);const token=await paired(t);await upload(t,token,[event(1,"Phone one")]);
    const code=await t.action(admin,{label:"Phone two"});const res=await t.fetch("/v1/pair",{method:"POST",body:JSON.stringify({code:code.code,installationId:"87654321-4321-4321-4321-cba987654321"})});
    const second=(await res.json()).token;await upload(t,second,[event(1,"Phone two")]);const records=await t.run(ctx=>ctx.db.query("records").collect());expect(records).toHaveLength(2);expect(records[0].device).not.toBe(records[1].device);
  });
});
