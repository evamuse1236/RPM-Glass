import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { seeded, read, plan } from "./standaloneHelpers";
import { command, enqueue, poll } from "./plannerHelpers";
import { interpret } from "../convex/captureModel";
vi.mock("../convex/captureModel",()=>({interpret:vi.fn()}));
const run=makeFunctionReference<"action">("captureRun:run");
const claim=makeFunctionReference<"mutation">("captures:claim");
const recover=makeFunctionReference<"mutation">("captures:recover");
const load=makeFunctionReference<"query">("captures:load");
const save=makeFunctionReference<"mutation">("captures:save");
const text="call the bank tomorrow at 5pm";
function turn(){return {schemaVersion:1,mode:"capture",draftMode:"new",reply:"",decisions:[{sourceId:"s0",disposition:"action",note:null}],operations:[{opId:"bank",sourceId:"s0",kind:"create",entity:"task",targetId:null,fields:[{name:"title",op:"set",value:"Call the bank",origin:"stated",evidence:"call the bank"},{name:"time",op:"set",value:"tomorrow at 5pm",origin:"stated",evidence:"tomorrow at 5pm"}]}],question:null,clarification:null,memoryCandidates:[],card:null};}
async function start(n=1,words=text){const s=await seeded();const c={...command(n),type:"capture",args:{text:words}};expect((await enqueue(s.t,s.web.token,c)).status).toBe(202);const row=(await s.t.run(ctx=>ctx.db.query("captures").first()))!;return {...s,c,row};}
const rows=(s:any)=>s.t.run((ctx:any)=>ctx.db.query("captures").collect());
beforeAll(()=>vi.useFakeTimers());
afterAll(()=>vi.useRealTimers());
beforeEach(()=>{vi.setSystemTime(new Date("2026-10-28T04:30:00Z"));vi.mocked(interpret).mockReset();vi.mocked(interpret).mockResolvedValue(turn());});
afterEach(()=>{vi.clearAllTimers();vi.unstubAllEnvs();});
describe("durable server Capture",()=>{
 it("saves exact words and summary before the fake model and deduplicates commands",async()=>{
  const s=await start();vi.mocked(interpret).mockImplementation(async()=>{expect((await rows(s))[0]).toMatchObject({text,status:"saved",attempts:1});expect((await read(s.t,s.web.token)).captures.at(-1)).toMatchObject({text,status:"saved"});return turn();});
  await enqueue(s.t,s.web.token,s.c);expect(await rows(s)).toHaveLength(1);
  await s.t.action(run,{captureId:s.row._id});expect(interpret).toHaveBeenCalledTimes(1);
  expect((await rows(s))[0]).toMatchObject({status:"applied",taskIds:[1000000000]});
  expect((await (await enqueue(s.t,s.web.token,s.c)).json()).status).toBe("applied");
 });
 it("creates one task at 5pm India and persists receipt, state items, and inverse",async()=>{
  const s=await start();await s.t.action(run,{captureId:s.row._id});const snapshot=await read(s.t,s.web.token);
  expect(snapshot.entries.filter((e:any)=>e.title==="Call the bank")).toMatchObject([{id:1000000000,planned:"2026-10-29T11:30:00.000Z"}]);
  expect(snapshot.captures.at(-1)).toMatchObject({text,status:"applied",receipt:[{text:expect.stringContaining("Call the bank")}]});
  expect((await rows(s))[0].inverse.some((i:any)=>i.key==="task:1000000000")).toBe(true);
  const state=await s.t.run(ctx=>ctx.db.query("captureState").collect());expect(new Set(state.map(r=>r.kind))).toEqual(new Set(["capture","draft","transaction"]));
 });
 it("recovers a worker crash after the atomic committed save without a duplicate or model rerun",async()=>{
  const s=await start();const original=s.t.mutation.bind(s.t);let crashed=false;
  const ctx={runQuery:s.t.query.bind(s.t),runMutation:async(ref:any,args:any)=>{const result=await original(ref,args);if(!crashed&&args.next&&Object.values(args.next.intentV2?.drafts??{}).some((d:any)=>d.status==="committed")){crashed=true;throw new Error("reply lost after save");}return result;}};
  const {executeCapture}=await import("../convex/captureWorker");await executeCapture(ctx,s.row._id,interpret);
  await s.t.action(run,{captureId:s.row._id});expect(crashed).toBe(true);expect(interpret).toHaveBeenCalledTimes(1);
  expect((await read(s.t,s.web.token)).entries.filter((e:any)=>e.title==="Call the bank")).toHaveLength(1);expect((await rows(s))[0].status).toBe("applied");
 });
 it("keeps words on model failure and finishes the browser command with the retry message",async()=>{
  const s=await start();vi.mocked(interpret).mockRejectedValue(Object.assign(new Error("service failed"),{code:"TRANSPORT_ERROR"}));await s.t.action(run,{captureId:s.row._id});
  expect((await rows(s))[0]).toMatchObject({text,status:"words-kept",message:expect.any(String)});
  expect((await (await poll(s.t,s.web.token)).json()).commands.at(-1)).toMatchObject({status:"rejected",message:"Your words were kept. Send again to retry."});
 });
 it("keeps a question and sends the next words to the same conversation",async()=>{
  const s=await start();const q={...turn(),draftMode:"none",operations:[],decisions:[{sourceId:"s0",disposition:"question",note:null}],clarification:{prompt:"Which task?",action:"other",choices:[{label:"First task",targets:[{entity:"task",id:"3"}]},{label:"Second task",targets:[{entity:"task",id:"4"}]}]}};
  vi.mocked(interpret).mockResolvedValue(q);await s.t.action(run,{captureId:s.row._id});expect((await rows(s))[0]).toMatchObject({status:"needs-answer",question:"Which task?"});
  expect((await (await poll(s.t,s.web.token)).json()).commands.at(-1)).toMatchObject({status:"applied",message:"Which task?"});
  const second={...command(2),type:"capture",args:{text:"Actually leave them both as they are"}};await enqueue(s.t,s.web.token,second);
  vi.mocked(interpret).mockResolvedValue({...turn(),draftMode:"none",operations:[],decisions:[{sourceId:"s0",disposition:"reflection",note:null}],reply:"Words kept."});
  const next=(await rows(s))[1];await s.t.action(run,{captureId:next._id});
  const state=await s.t.run(ctx=>ctx.db.query("captureState").collect());const captures=state.filter(r=>r.kind==="capture");expect(captures).toHaveLength(2);expect(captures[0].value.conversationId).toBe(captures[1].value.conversationId);
 });
 it("Undo keeps a later edit of a different field group",async()=>{
  const s=await start(1,"Rename Draft my section of the critical review to Call the bank"),original=s.seed.entries.find(e=>e.id===3)!.title;
  const edit={...turn(),operations:[{...turn().operations[0],kind:"update",targetId:"3",fields:[{name:"title",op:"set",value:"Call the bank",origin:"stated",evidence:"Call the bank"}]}]};
  vi.mocked(interpret).mockResolvedValue(edit);await s.t.action(run,{captureId:s.row._id});
  expect((await read(s.t,s.web.token)).entries.find((e:any)=>e.id===3).title).toBe("Call the bank");
  await enqueue(s.t,s.web.token,plan(2,{type:"saveTask",id:3,fields:{notes:"Later website note"}}));
  const undone=await (await enqueue(s.t,s.web.token,{...command(3),type:"undo",args:{commandId:s.c.id}})).json();
  expect(undone).toMatchObject({status:"applied",message:"Change undone. Newer changes were kept."});
  expect((await read(s.t,s.web.token)).entries.find((e:any)=>e.id===3)).toMatchObject({title:original,notes:"Later website note"});
 });
 it("fences two simultaneous runs and serializes captures for an account",async()=>{
  const s=await start();const claims=await Promise.all([s.t.mutation(claim,{captureId:s.row._id}),s.t.mutation(claim,{captureId:s.row._id})]);expect(claims.filter(Boolean)).toHaveLength(1);expect((await rows(s))[0].attempts).toBe(1);
  await enqueue(s.t,s.web.token,{...command(2),type:"capture",args:{text}});const second=(await rows(s))[1];expect(await s.t.mutation(claim,{captureId:second._id})).toBeNull();
 });
 it("rejects stale Capture state and planner CAS without partial writes",async()=>{
  const s=await start();const claimed=await s.t.mutation(claim,{captureId:s.row._id});const loaded=await s.t.query(load,{captureId:s.row._id,attempt:claimed.attempts});
  await enqueue(s.t,s.web.token,plan(2,{type:"saveTask",id:3,fields:{notes:"Concurrent edit"}}));
  expect(await s.t.mutation(save,{captureId:s.row._id,attempt:claimed.attempts,expected:loaded.expected,next:loaded.store,receipt:[]})).toEqual({conflict:true});expect((await read(s.t,s.web.token)).entries.find((e:any)=>e.id===3).notes).toBe("Concurrent edit");
 });
 it("recovers expired claims, stops after three attempts, and keeps terminal rows terminal",async()=>{
  const s=await start();for(let i=0;i<3;i++){expect(await s.t.mutation(claim,{captureId:s.row._id})).not.toBeNull();vi.setSystemTime(Date.now()+300001);}
  await s.t.mutation(recover,{});expect((await rows(s))[0]).toMatchObject({attempts:3,status:"words-kept"});expect(await s.t.mutation(claim,{captureId:s.row._id})).toBeNull();
 });
 it("accepts args.timezone and rejects invalid IANA names before saving",async()=>{
  const s=await seeded();expect((await enqueue(s.t,s.web.token,{...command(),type:"capture",args:{text,timezone:"America/New_York"}})).status).toBe(202);
  expect((await enqueue(s.t,s.web.token,{...command(2),type:"capture",args:{text,timezone:"Mars/Olympus"}})).status).toBe(400);
 });
 it("two worker invocations make only one model call and one task",async()=>{
  const s=await start();await Promise.all([s.t.action(run,{captureId:s.row._id}),s.t.action(run,{captureId:s.row._id})]);
  expect(interpret).toHaveBeenCalledTimes(1);expect((await rows(s))[0].attempts).toBe(1);
  expect((await read(s.t,s.web.token)).entries.filter((e:any)=>e.title==="Call the bank")).toHaveLength(1);
 });
 it("resumes an interpreted draft after the worker dies before applying it",async()=>{
  const s=await start();const {executeCapture}=await import("../convex/captureWorker");const original=s.t.mutation.bind(s.t);let stopped=false;
  await expect(executeCapture({runQuery:s.t.query.bind(s.t),runMutation:async(ref:any,args:any)=>{
   if(stopped)throw new Error("worker stopped");const result=await original(ref,args);
   if(args.next?.intentV2?.captures?.[s.c.id]?.status==="interpreted"&&!Object.values(args.next.intentV2.drafts).some((d:any)=>d.status==="committed")){stopped=true;throw new Error("worker stopped");}return result;
  }},s.row._id,interpret)).rejects.toThrow("worker stopped");
  expect((await rows(s))[0].status).toBe("saved");vi.setSystemTime(Date.now()+300001);
  await s.t.action(run,{captureId:s.row._id});expect(interpret).toHaveBeenCalledTimes(1);expect((await rows(s))[0]).toMatchObject({attempts:2,status:"applied"});
  expect((await read(s.t,s.web.token)).entries.filter((e:any)=>e.title==="Call the bank")).toHaveLength(1);
 });
 it("CAS checks per-item versions and fences a stale lease",async()=>{
  const s=await start(),lease=await s.t.mutation(claim,{captureId:s.row._id});
  await s.t.run(ctx=>ctx.db.insert("captureState",{account:s.row.account,kind:"transaction",id:"one",version:1,value:{}}));
  const loaded=await s.t.query(load,{captureId:s.row._id,attempt:lease.attempts});
  await s.t.run(async ctx=>{const item=(await ctx.db.query("captureState").first())!;await ctx.db.patch(item._id,{version:2});});
  expect(await s.t.mutation(save,{captureId:s.row._id,attempt:lease.attempts,expected:loaded.expected,next:loaded.store,receipt:[]})).toEqual({conflict:true});
  vi.setSystemTime(Date.now()+300001);const next=await s.t.mutation(claim,{captureId:s.row._id});expect(next.attempts).toBe(2);
  expect(await s.t.mutation(save,{captureId:s.row._id,attempt:lease.attempts,expected:loaded.expected,next:loaded.store,receipt:[]})).toEqual({conflict:true});
 });
 it("a concurrent website edit between Capture saves survives",async()=>{
  const s=await start();const {executeCapture}=await import("../convex/captureWorker");const original=s.t.mutation.bind(s.t);let edited=false;
  await executeCapture({runQuery:s.t.query.bind(s.t),runMutation:async(ref:any,args:any)=>{const result=await original(ref,args);
   if(!edited&&args.next?.intentV2?.captures?.[s.c.id]?.status==="interpreted"){edited=true;await enqueue(s.t,s.web.token,plan(2,{type:"saveTask",id:3,fields:{notes:"Concurrent website note"}}));}return result;
  }},s.row._id,interpret);
  expect(edited).toBe(true);expect((await rows(s))[0].status).toBe("applied");expect((await read(s.t,s.web.token)).entries.find((e:any)=>e.id===3).notes).toBe("Concurrent website note");
 });
 it.each(["missing-key","timeout"])("%s keeps words through the real Anthropic boundary",async failure=>{
  const s=await start();const actual=await vi.importActual<typeof import("../convex/captureModel")>("../convex/captureModel");
  if(failure==="missing-key")vi.stubEnv("ANTHROPIC_API_KEY","");
  vi.mocked(interpret).mockImplementation((input,options)=>actual.interpret(input,failure==="timeout"?{...options,deadline:0}:options));
  await s.t.action(run,{captureId:s.row._id});expect(interpret).toHaveBeenCalled();expect((await rows(s))[0]).toMatchObject({text,status:"words-kept"});
 });
 it("returns phone and server capture summaries newest last, capped at 50",async()=>{
  const s=await start();await s.t.run(async ctx=>{for(let i=0;i<55;i++)await ctx.db.insert("plannerRecords",{account:s.row.account,key:`capture:phone-${i}`,rev:1000+i,value:{id:`phone-${i}`,text:`phone ${i}`,status:"interpreted",createdAt:new Date(Date.parse("2026-10-27T00:00:00Z")+i*1000).toISOString(),receipt:[]},stamps:{}});});
  await s.t.action(run,{captureId:s.row._id});const snapshot=await read(s.t,s.web.token);expect(snapshot.captures).toHaveLength(50);expect(snapshot.captures.at(-1)).toMatchObject({text,status:"applied"});expect(snapshot.captures[0].text).toBe("phone 6");
 });
 it("formats the durable receipt in India even when mutations run in UTC",async()=>{
  const s=await start();const {executeCapture}=await import("../convex/captureWorker");
  // @ts-expect-error The shared timezone scope is JavaScript.
  const {withTimeZone}=await import("../android-companion/zoned-time.mjs");
  await executeCapture({runQuery:s.t.query.bind(s.t),runMutation:(ref:any,args:any)=>withTimeZone("UTC",()=>s.t.mutation(ref,args))},s.row._id,interpret);
  expect((await rows(s))[0].receipt[0].text).toMatch(/5:00\s*PM/);
 });
});
