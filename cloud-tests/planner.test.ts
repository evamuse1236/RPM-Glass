import { describe, expect, it } from "vitest";
import { setup, phone, linked, request, snapshot, sync, enqueue, command, poll } from "./plannerHelpers";

describe("Planner snapshots and command delivery",()=>{
  it("keeps one current snapshot and four older revisions without reinterpreting legacy events",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    for(let revision=40;revision<=46;revision++)expect((await sync(t,device.token,{snapshot:snapshot(revision),acks:[]})).status).toBe(200);
    expect((await (await sync(t,device.token)).json()).snapshots.map((item:any)=>item.revision)).toEqual([46,45,44,43,42]);
    expect(await (await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).json()).toEqual(snapshot(46));
    expect(await t.run(ctx=>ctx.db.query("plannerSnapshots").collect())).toHaveLength(5);
    expect((await sync(t,device.token,{snapshot:snapshot(45),acks:[]})).status).toBe(409);
    expect((await sync(t,device.token,{snapshot:{...snapshot(46),savedAt:"2026-10-19T08:00:00+05:30"},acks:[]})).status).toBe(409);
    expect((await sync(t,device.token,{snapshot:Object.fromEntries(Object.entries(snapshot(46)).reverse()),acks:[]})).status).toBe(200);
    expect(await t.run(ctx=>ctx.db.query("plannerSnapshots").collect())).toHaveLength(5);
  });
  it("keeps enqueue retries idempotent and rejects UUID reuse with different content or session",async()=>{
    const t=setup(), device=await phone(t), first=await linked(t,device.token), second=await linked(t,device.token);
    const queued=await enqueue(t,first.token), initial=await queued.json();
    expect(queued.status).toBe(202);expect(initial).toEqual({id:command().id,status:"pending",message:"Waiting for phone",newRevision:null,cursor:1});
    const retry=await enqueue(t,first.token,Object.fromEntries(Object.entries(command()).reverse()));
    expect(retry.status).toBe(202);expect(await retry.json()).toEqual(initial);
    expect((await enqueue(t,first.token,{...command(),args:{taskId:4}})).status).toBe(409);
    expect((await enqueue(t,second.token)).status).toBe(409);
    const mixedCase={...command(2),id:"ABCDEF12-1234-4234-8234-123456789abc"};
    expect((await enqueue(t,first.token,mixedCase)).status).toBe(202);
    expect((await enqueue(t,first.token,{...mixedCase,id:mixedCase.id.toLowerCase()})).status).toBe(409);
    expect(await t.run(ctx=>ctx.db.query("webCommands").collect())).toHaveLength(2);
    expect((await (await poll(t,second.token)).json()).commands).toEqual([]);
  });
  it("redelivers pending commands, advances ack cursors, and never rewrites a final status",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    await enqueue(t,web.token);
    for(let attempt=0;attempt<2;attempt++)expect((await (await sync(t,device.token)).json()).commands).toEqual([command()]);
    const ack={id:command().id,status:"applied",message:"Task completed",newRevision:43};
    const final=await sync(t,device.token,{snapshot:snapshot(43),acks:[ack]});
    expect(final.status).toBe(200);expect((await final.json()).commands).toEqual([]);
    const result=await (await poll(t,web.token,1)).json();
    expect(result).toEqual({commands:[{...ack,cursor:2}],cursor:2,hasMore:false});
    const retry=await sync(t,device.token,{snapshot:snapshot(43),acks:[ack]});expect(retry.status).toBe(200);
    expect(await (await poll(t,web.token,2)).json()).toEqual({commands:[],cursor:2,hasMore:false});
    const duplicate=await enqueue(t,web.token);expect(duplicate.status).toBe(200);expect((await duplicate.json()).status).toBe("applied");
    expect((await sync(t,device.token,{snapshot:snapshot(44),acks:[{...ack,status:"rejected"}]})).status).toBe(409);
    expect((await (await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).json()).revision).toBe(43);
    expect((await (await poll(t,web.token)).json()).commands[0].status).toBe("applied");
  });
  it("applies acks atomically when an acknowledgement targets another account",async()=>{
    const t=setup(), first=await phone(t), second=await phone(t,2), web=await linked(t,first.token), other=await linked(t,second.token);
    await enqueue(t,web.token,command(1));await enqueue(t,other.token,command(2));
    const ack=(id:string)=>({id,status:"applied",message:"Saved",newRevision:43});
    const response=await sync(t,first.token,{snapshot:snapshot(43),acks:[ack(command(1).id),ack(command(2).id)]});
    expect(response.status).toBe(409);
    expect((await (await poll(t,web.token)).json()).commands[0].status).toBe("pending");
    expect(await t.run(ctx=>ctx.db.query("plannerSnapshots").collect())).toHaveLength(0);
    expect((await (await sync(t,second.token)).json()).commands).toEqual([command(2)]);
  });
  it("scopes snapshots, commands, acknowledgements, and revocation to their account and executor",async()=>{
    const t=setup(), first=await phone(t), second=await phone(t,2), web=await linked(t,first.token), other=await linked(t,second.token);
    await sync(t,first.token,{snapshot:snapshot(42),acks:[]});await sync(t,second.token,{snapshot:snapshot(7),acks:[]});
    await enqueue(t,web.token);await enqueue(t,other.token);
    expect((await (await request(t,"/v1/web/snapshot",other.token,undefined,"GET")).json()).revision).toBe(7);
    expect((await request(t,"/v1/web/revoke",second.token,{sessionId:web.sessionId})).status).toBe(401);
    const bad=await phone(t,3);
    const account=await t.run(async ctx=>(await ctx.db.get(first.id))!.account!);
    await t.run(ctx=>ctx.db.patch(bad.id,{account}));
    expect((await sync(t,bad.token,{snapshot:snapshot(99),acks:[]})).status).toBe(409);
    expect((await (await request(t,"/v1/web/snapshot",web.token,undefined,"GET")).json()).revision).toBe(42);
  });
  it("lists last-seen times and rejects pending work as soon as a phone revokes its browser",async()=>{
    const t=setup(), device=await phone(t), first=await linked(t,device.token,"Office"), second=await linked(t,device.token,"Home");
    await enqueue(t,first.token);await enqueue(t,second.token,command(2));
    await t.run(async ctx=>{const sessions=await ctx.db.query("webSessions").collect();await ctx.db.patch(sessions[0]._id,{lastSeenAt:1});});
    await poll(t,first.token);
    let sessions=(await (await request(t,"/v1/web/sessions",device.token,undefined,"GET")).json()).sessions;
    expect(sessions.find((item:any)=>item.id===first.sessionId)).toMatchObject({label:"Office",lastSeenAt:expect.any(Number),revoked:false});
    expect(sessions.find((item:any)=>item.id===first.sessionId).lastSeenAt).toBeGreaterThan(1);
    expect((await request(t,"/v1/web/revoke",device.token,{sessionId:first.sessionId})).status).toBe(200);
    expect((await poll(t,first.token)).status).toBe(401);expect((await enqueue(t,first.token,command(3))).status).toBe(401);
    expect((await (await sync(t,device.token)).json()).commands).toEqual([command(2)]);
    const commands=await t.run(ctx=>ctx.db.query("webCommands").collect());
    expect(commands.find(item=>item.commandId===command().id)).toMatchObject({status:"rejected",message:"Browser access was revoked",newRevision:0,cursor:3});
    expect((await sync(t,device.token,{acks:[{id:command().id,status:"applied",message:"Saved",newRevision:1}]})).status).toBe(409);
    sessions=(await (await request(t,"/v1/web/sessions",device.token,undefined,"GET")).json()).sessions;
    expect(sessions.find((item:any)=>item.id===first.sessionId).revoked).toBe(true);
    expect((await request(t,"/v1/web/session",second.token,undefined,"DELETE")).status).toBe(200);
    expect((await (await sync(t,device.token)).json()).commands).toEqual([]);
  });
  it("pages status changes by cursor and returns only the oldest hundred pending commands",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    for(let number=1;number<=101;number++)expect((await enqueue(t,web.token,command(number))).status).toBe(202);
    const first=await (await poll(t,web.token)).json();expect(first.commands).toHaveLength(100);expect(first.cursor).toBe(100);expect(first.hasMore).toBe(true);
    const second=await (await poll(t,web.token,first.cursor)).json();expect(second.commands).toHaveLength(1);expect(second.cursor).toBe(101);expect(second.hasMore).toBe(false);
    const pending=await (await sync(t,device.token)).json();expect(pending.commands).toHaveLength(100);expect(pending.commands[0].id).toBe(command(1).id);expect(pending.commands[99].id).toBe(command(100).id);
    const ack={id:command(1).id,status:"conflict",message:"Task changed on the phone",newRevision:42};
    await sync(t,device.token,{acks:[ack]});
    const changes=await (await poll(t,web.token,101)).json();expect(changes.commands).toEqual([{...ack,cursor:102}]);expect(changes.cursor).toBe(102);
    const next=await (await sync(t,device.token)).json();expect(next.commands).toHaveLength(100);expect(next.commands[0].id).toBe(command(2).id);expect(next.commands[99].id).toBe(command(101).id);
  });
  it("rejects the remaining revoked backlog on sync without delivering it to the phone",async()=>{
    const t=setup(), device=await phone(t), web=await linked(t,device.token);
    for(let number=1;number<=102;number++)await enqueue(t,web.token,command(number));
    expect((await request(t,"/v1/web/session",web.token,undefined,"DELETE")).status).toBe(200);
    expect((await (await sync(t,device.token)).json()).commands).toEqual([]);
    const commands=await t.run(ctx=>ctx.db.query("webCommands").collect());
    expect(commands).toHaveLength(102);expect(commands.every(item=>item.status==="rejected")).toBe(true);
  });
});
