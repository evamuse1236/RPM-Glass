import { describe, expect, it } from "vitest";
// @ts-expect-error Shared snapshot projection is JavaScript.
import { buildSnapshot } from "../android-companion/web-sync-snapshot.mjs";
import { validateSnapshot } from "../web/contract/validate.mjs";
import { enqueue } from "./plannerHelpers";
import { seeded, push, pull, read, plan, command, phoneEdit, request } from "./standaloneHelpers";

describe("Standalone planner writes",()=>{
  it("builds the seed snapshot from records without storing snapshots",async()=>{
    const {t,device,web,seed}=await seeded(), page=await (await pull(t,device.token)).json();
    const snap=await read(t,web.token);
    expect(snap).toEqual({...buildSnapshot({...seed,version:page.cursor,syncSavedAt:snap.savedAt,sync:{remoteActivity:Object.fromEntries(seed.entries.map(e=>[e.id,e.reviewActivityDays??[]]))}}),conflicts:[]});
    expect(validateSnapshot(snap)).toEqual(snap);
    expect(page.seededAt).toEqual(expect.any(Number));
  });
  it("adds, edits and completes without a phone round trip and replays one receipt",async()=>{
    const {t,web}=await seeded();
    const add=plan(1,{type:"saveTask",fields:{title:"Browser alone"}},[1000000007]);
    const posted=await enqueue(t,web.token,add);expect(posted.status).toBe(200);
    const first=await posted.json();expect(first.status).toBe("applied");
    expect(await (await enqueue(t,web.token,add)).json()).toEqual(first);
    let snap=await read(t,web.token);expect(snap.entries.find((e:any)=>e.title==="Browser alone").id).toBe(1000000007);
    expect((await (await enqueue(t,web.token,{...command(2),type:"edit",args:{taskId:1000000007,fields:{title:"Edited alone"}}})).json()).status).toBe("applied");
    expect((await (await enqueue(t,web.token,{...command(3),args:{taskId:1000000007}})).json()).status).toBe("applied");
    snap=await read(t,web.token);expect(snap.entries.find((e:any)=>e.id===1000000007)).toMatchObject({title:"Edited alone",done:true});
    expect(first.newRevision).toBeLessThan(snap.revision);
  });
  it.each([false,true])("Undo preserves later phone groups (same group: %s)",async same=>{
    const {t,device,web,seed}=await seeded(), task=seed.entries[0];
    const edit=plan(1,{type:"saveTask",id:task.id,fields:{title:"Website title"}});
    expect((await (await enqueue(t,web.token,edit)).json()).status).toBe("applied");
    expect((await phoneEdit(t,device.token,`task:${task.id}`,same?{title:"Phone title"}:{notes:"Phone notes"})).status).toBe(200);
    const undo={...command(2),type:"undo",args:{commandId:edit.id}};
    const receipt=await (await enqueue(t,web.token,undo)).json();expect(receipt.status).toBe("applied");
    if(same)expect(receipt.message).toMatch(/newer.*kept|kept.*newer/i);
    const row=(await read(t,web.token)).entries.find((e:any)=>e.id===task.id);
    expect(row.title).toBe(same?"Phone title":task.title);
    if(!same)expect(row.notes).toBe("Phone notes");
  });
  it("merges newer phone values, stores the loser and a notes line",async()=>{
    const {t,device,web,seed,receipt}=await seeded(), task=seed.entries[0], key=`task:${task.id}`;
    const base=receipt.results.find((r:any)=>r.key===key);
    await enqueue(t,web.token,plan(1,{type:"saveTask",id:task.id,fields:{title:"Website title"}}));
    const response=await push(t,device.token,[{key,baseRev:base.rev,base:base.value,value:{...base.value,title:"Older phone title"},stamps:{title:"2026-10-20T00:00:00.000Z"}}],2);
    expect(response.status).toBe(200);
    const snap=await read(t,web.token), row=snap.entries.find((r:any)=>r.id===task.id);
    expect(row.title).toBe("Website title");expect(row.notes).toContain("Older phone title");
    expect(snap.conflicts).toEqual([expect.objectContaining({key,group:"title",lostFrom:"phone",lost:{title:"Older phone title"}})]);
  });
  it("repairs a task into Inbox after its Block was deleted",async()=>{
    const {t,device,web,seed,receipt}=await seeded(), block=seed.planner.blocks[0], task=seed.entries[0];
    const base=receipt.results.find((r:any)=>r.key===`task:${task.id}`);
    await enqueue(t,web.token,plan(1,{type:"removeEntity",collection:"blocks",id:block.id}));
    const result=await push(t,device.token,[{key:base.key,baseRev:base.rev,base:base.value,value:{...base.value,blockId:block.id},stamps:{order:new Date().toISOString()}}],2);
    expect(result.status).toBe(200);expect((await result.json()).results[0].value.blockId).toBeNull();
    expect((await read(t,web.token)).entries.find((r:any)=>r.id===task.id).blockId).toBeNull();
  });
  it("keeps per-part receipts and pages records without gaps",async()=>{
    const {t,device}=await seeded();
    const first=await push(t,device.token,[],2,0,false), receipt=await first.json();
    expect(first.status).toBe(200);
    expect(await (await push(t,device.token,[],2,0,false)).json()).toEqual(receipt);
    const last=await (await push(t,device.token,[],2,1,true)).json();expect(last).toMatchObject({seq:2,part:1});
    expect(await (await push(t,device.token,[],2,0,false)).json()).toEqual(receipt);
    let after=0, rows:any[]=[];
    for(;;){const page=await (await pull(t,device.token,after,3)).json();rows.push(...page.rows);expect(page.rows.length).toBeLessThanOrEqual(3);if(!page.hasMore)break;expect(page.cursor).toBeGreaterThan(after);after=page.cursor;}
    expect(new Set(rows.map(r=>r.key)).size).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(3);
    expect((await push(t,device.token,[],1)).status).toBe(409);
  });
  it("keeps exact Capture words pending and blocks revoked browsers",async()=>{
    const {t,device,web}=await seeded(), capture={...command(),type:"capture",args:{text:"  My exact words\nplease  "},timezone:"Asia/Kolkata"};
    const response=await enqueue(t,web.token,capture);expect(response.status).toBe(202);expect((await response.json()).status).toBe("pending");
    expect(await t.run(ctx=>ctx.db.query("captures").first())).toMatchObject({text:capture.args.text,status:"saved",timezone:"Asia/Kolkata"});
    expect((await read(t,web.token)).captures[0]).toMatchObject({text:capture.args.text});
    await request(t,"/v1/web/revoke",device.token,{sessionId:web.sessionId});
    expect((await enqueue(t,web.token,plan(2,{type:"saveTask",fields:{title:"Blocked"}}))).status).toBe(401);
    expect((await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).status).toBe(401);
  });
});
