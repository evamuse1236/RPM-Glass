import { afterEach, describe, expect, it, vi } from "vitest";
import { setup, phone, linked, enqueue, poll, snapshot, seed } from "./plannerHelpers";
import { seeded, changes, push, pull, read, plan, command, request } from "./standaloneHelpers";

afterEach(()=>vi.useRealTimers());
describe("Standalone record safety",()=>{
  it("allocates unused server IDs for old browser commands, collisions and batches",async()=>{
    const {t,web}=await seeded();
    const ops=[plan(1,{type:"saveTask",fields:{title:"Fallback"}},[3]),
      plan(2,{type:"saveTask",fields:{title:"Collision"}},[1000000000]),
      plan(3,{type:"batch",ops:[{type:"saveTask",fields:{title:"Batch one"}},{type:"saveTask",fields:{title:"Batch two"}}]},[1000000010,1000000011])];
    for(const op of ops)expect((await (await enqueue(t,web.token,op)).json()).status).toBe("applied");
    const snap=await read(t,web.token);
    expect(snap.entries.filter((r:any)=>r.id>=1000000000).map((r:any)=>r.id)).toEqual([1000000000,1000000001,1000000010,1000000011]);
    expect((await t.run(ctx=>ctx.db.query("accounts").first()))?.nextTaskId).toBe(1000000012);
  });
  it("preserves supplied entity UUIDs, without accepting a duplicate UUID in the same batch",async()=>{
    const {t,web}=await seeded(), id="a0000000-1234-4234-8234-000000000001";
    const op=plan(1,{type:"batch",ops:[{type:"saveEntity",collection:"blocks",fields:{title:"First"}},{type:"saveEntity",collection:"blocks",fields:{title:"Second"}}]},[id,id,id,id]);
    expect((await (await enqueue(t,web.token,op)).json()).status).toBe("applied");
    const blocks=(await read(t,web.token)).planner.blocks.filter((b:any)=>["First","Second"].includes(b.title));
    expect(blocks.find((b:any)=>b.title==="First").id).toBe(id);
    expect(blocks.find((b:any)=>b.title==="Second").id).not.toBe(id);
  });
  it("rejects a bad planner batch without committing an earlier operation",async()=>{
    const {t,web}=await seeded(), before=await read(t,web.token);
    const result=await (await enqueue(t,web.token,plan(1,{type:"batch",ops:[{type:"saveTask",id:3,fields:{notes:"Must roll back"}},{type:"moveTask",id:3,blockId:"missing"}]}))).json();
    expect(result.status).toBe("rejected");expect(result.message).toEqual(expect.any(String));
    expect(await read(t,web.token)).toEqual(before);
    expect(await (await poll(t,web.token)).json()).toMatchObject({commands:[result]});
  });
  it("conflicts on Undo if removing a Block would orphan a later phone task",async()=>{
    const {t,device,web}=await seeded(), id="a0000000-1234-4234-8234-000000000002";
    const created=plan(1,{type:"saveEntity",collection:"blocks",fields:{title:"New block"}},[id]);
    await enqueue(t,web.token,created);
    const row=(await (await pull(t,device.token)).json()).rows.find((r:any)=>r.key==="task:3");
    await push(t,device.token,[{key:row.key,baseRev:row.rev,base:row.value,value:{...row.value,blockId:id},stamps:{order:new Date().toISOString()}}],2);
    const undone=await (await enqueue(t,web.token,{...command(2),type:"undo",args:{commandId:created.id}})).json();
    expect(undone).toMatchObject({status:"conflict",message:"This changed since; Undo it on the phone after reviewing."});
    const snap=await read(t,web.token);expect(snap.entries.find((r:any)=>r.id===3).blockId).toBe(id);expect(snap.planner.blocks.some((b:any)=>b.id===id)).toBe(true);
  });
  it("keeps a newer phone title and preserves the website loser",async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-28T00:00:00.000Z"));
    const {t,device,web,receipt}=await seeded(), base=receipt.results.find((r:any)=>r.key==="task:3");
    await enqueue(t,web.token,plan(1,{type:"saveTask",id:3,fields:{title:"Website version"}}));
    vi.setSystemTime(new Date("2026-10-28T00:01:00.000Z"));
    const result=await push(t,device.token,[{key:base.key,baseRev:base.rev,base:base.value,value:{...base.value,title:"Phone version"},stamps:{title:"2026-10-28T00:01:00.000Z"}}],2);
    expect(result.status).toBe(200);
    const snap=await read(t,web.token), task=snap.entries.find((r:any)=>r.id===3);
    expect(task.title).toBe("Phone version");expect(task.notes).toContain("Website version");
    expect(snap.conflicts[0]).toMatchObject({lostFrom:"server",lost:{title:"Website version"}});
  });
  it("returns exactly the original nonempty part receipt after later edits and finalization",async()=>{
    const {t,device,web}=await seeded(), row=(await (await pull(t,device.token)).json()).rows.find((r:any)=>r.key==="task:3");
    const change={key:row.key,baseRev:row.rev,base:row.value,value:{...row.value,notes:"One effect"},stamps:{notes:new Date().toISOString()}};
    const first=await (await push(t,device.token,[change],2,0,false)).json();
    await enqueue(t,web.token,plan(1,{type:"saveTask",id:3,fields:{notes:"Later website edit"}}));
    await push(t,device.token,[],2,1,true);
    expect(await (await push(t,device.token,[change],2,0,false)).json()).toEqual(first);
    expect((await read(t,web.token)).entries.find((r:any)=>r.id===3).notes).toBe("Later website edit");
    expect((await push(t,device.token,[],2,2,true)).status).toBe(409);
    expect((await push(t,device.token,[],3,1,true)).status).toBe(409);
  });
  it("hides an incomplete seed and seeds only on its final part",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token), all=changes(snapshot());
    expect((await push(t,device.token,all,1,0,false)).status).toBe(200);
    expect((await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).status).toBe(404);
    expect((await (await pull(t,device.token)).json()).seededAt).toBeNull();
    expect((await push(t,device.token,[],1,1,true)).status).toBe(200);
    expect((await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).status).toBe(200);
    expect((await t.run(ctx=>ctx.db.query("accounts").first()))?.seededAt).toEqual(expect.any(Number));
  });
  it("keeps multipart receipts below Convex's document limit and replays each part",async()=>{
    const {t,device,seed}=await seeded(), template=seed.entries[0];
    const part=(offset:number)=>Array.from({length:120},(_,n)=>({key:`task:${1000+offset+n}`,baseRev:null,base:null,value:{...template,id:1000+offset+n,notes:"x".repeat(5000)},stamps:{notes:new Date().toISOString()}}));
    const firstChanges=part(0), secondChanges=part(120);
    const first=await (await push(t,device.token,firstChanges,2,0,false)).json();
    const second=await (await push(t,device.token,secondChanges,2,1,true)).json();
    expect(first.results).toHaveLength(120);expect(second.results).toHaveLength(120);
    const stored=await t.run(ctx=>ctx.db.query("phoneSync").first());
    expect(new TextEncoder().encode(JSON.stringify(stored)).length).toBeLessThan(1000000);
    expect(await (await push(t,device.token,firstChanges,2,0,false)).json()).toEqual(first);
    expect(await (await push(t,device.token,secondChanges,2,1,true)).json()).toEqual(second);
    const pages=await t.run(ctx=>ctx.db.query("phoneReceiptPages").collect());
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every(page=>new TextEncoder().encode(JSON.stringify(page)).length<1000000)).toBe(true);
    await push(t,device.token,[],3);
    expect(await t.run(ctx=>ctx.db.query("phoneReceiptPages").collect())).toEqual([]);
    expect((await push(t,device.token,firstChanges,2,0,false)).status).toBe(409);
  });
  it("keeps malformed parts atomic and enforces push and pull bounds",async()=>{
    const {t,device}=await seeded(), before=await (await pull(t,device.token)).json(), valid=changes(snapshot())[0];
    const invalids=[{...valid,key:"conflict:forged"},{...valid,value:{...valid.value,token:"secret"}},{...valid,stamps:{title:"not a date"}},{...valid,baseRev:-1},{...valid,stamps:{title:"2026-02-31T00:00:00.000Z"}},{...valid,key:"waterSettings:wrong",value:null,base:null}];
    for(const change of invalids)expect((await push(t,device.token,[change],2)).status).toBe(400);
    expect((await push(t,device.token,[valid,valid],2)).status).toBe(400);
    expect((await push(t,device.token,Array(201).fill(valid),2)).status).toBe(400);
    expect((await pull(t,device.token,0,501)).status).toBe(400);
    expect((await pull(t,device.token,-1)).status).toBe(400);
    expect((await request(t,"/v1/planner/push",device.token,{seq:2,part:0,final:true,changes:[],padding:"x".repeat(800000)})).status).toBe(413);
    expect(await (await pull(t,device.token)).json()).toEqual(before);
  });
  it("quarantines a dangling phone link while keeping unrelated valid phone work",async()=>{
    const {t,device,web}=await seeded(), rows=(await (await pull(t,device.token)).json()).rows;
    const invalid=rows.find((r:any)=>r.key==="task:3"), valid=rows.find((r:any)=>r.key==="task:4");
    const change=(row:any,fields:any)=>({key:row.key,baseRev:row.rev,base:row.value,value:{...row.value,...fields},stamps:{order:new Date().toISOString(),notes:new Date().toISOString()}});
    const result=await push(t,device.token,[change(invalid,{blockId:"never-existed"}),change(valid,{notes:"Keep this"})],2);
    expect(result.status).toBe(200);
    const snap=await read(t,web.token);
    expect(snap.entries.find((r:any)=>r.id===3).blockId).toBe(invalid.value.blockId);
    expect(snap.entries.find((r:any)=>r.id===4).notes).toBe("Keep this");
    expect(snap.conflicts).toEqual([expect.objectContaining({key:"task:3",group:"record",lostFrom:"phone"})]);
  });
});
