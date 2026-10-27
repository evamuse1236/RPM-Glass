import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seeded, read, request } from "./standaloneHelpers";
import { enqueue, poll } from "./plannerHelpers";
import { command } from "./standaloneHelpers";

const route = "/v1/web/voice-token";
const minted = () => vi.fn(async(_url:string,init:any)=>new Response(JSON.stringify({name:"auth_tokens/one-use",setup:JSON.parse(init.body).bidiGenerateContentSetup}),{status:200}));
const voiceCapture = (n:number,text="Buy milk tomorrow",extra:Record<string,unknown>={}) => ({...command(n),type:"capture",args:{text,source:"voice",...extra}});

beforeEach(()=>{vi.stubEnv("GEMINI_API_KEY","test-gemini-key");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe("POST /v1/web/voice-token",()=>{
  it("mints with the server's own setup for the browser's time zone and never returns the key",async()=>{
    const s=await seeded(), fetch=minted();vi.stubGlobal("fetch",fetch);
    const response=await request(s.t,route,s.web.token,{timeZone:"Asia/Kolkata"});
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body=await response.text();
    expect(JSON.parse(body)).toEqual({token:"auth_tokens/one-use",expiresAt:expect.any(String),url:expect.stringMatching(/^wss:\/\/generativelanguage\.googleapis\.com\//)});
    expect(body).not.toContain("test-gemini-key");
    const [url,init]=fetch.mock.calls[0] as any[], sent=JSON.parse(init.body);
    expect(url).toContain("/v1alpha/auth_tokens");
    expect(init.headers["x-goog-api-key"]).toBe("test-gemini-key");
    expect(sent.uses).toBe(1);
    expect(sent.bidiGenerateContentSetup.model).toMatch(/^models\//);
    expect(sent.bidiGenerateContentSetup.systemInstruction.parts[0].text).toContain("Asia/Kolkata");
  });
  it("refuses a setup from the browser, a bad time zone, and a missing or wrong browser key",async()=>{
    const s=await seeded();vi.stubGlobal("fetch",minted());
    expect((await request(s.t,route,s.web.token,{timeZone:"Asia/Kolkata",setup:{model:"models/other"}})).status).toBe(400);
    for(const timeZone of ["Mars/Olympus","../etc","", 5])expect((await request(s.t,route,s.web.token,{timeZone})).status).toBe(400);
    expect((await request(s.t,route,undefined,{timeZone:"Asia/Kolkata"})).status).toBe(401);
    expect((await request(s.t,route,"f".repeat(64),{timeZone:"Asia/Kolkata"})).status).toBe(401);
  });
  it("answers voice_unavailable when the server has no key",async()=>{
    const s=await seeded(), fetch=minted();vi.stubGlobal("fetch",fetch);vi.stubEnv("GEMINI_API_KEY","");
    const response=await request(s.t,route,s.web.token,{timeZone:"Asia/Kolkata"});
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("voice_unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("gives each account 30 tokens an hour",async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-28T04:00:00Z"));
    try {
      const s=await seeded();vi.stubGlobal("fetch",minted());
      for(let n=0;n<30;n++) {
        if(n%20===19)vi.setSystemTime(new Date(Date.now()+61000));
        expect((await request(s.t,route,s.web.token,{timeZone:"UTC"})).status).toBe(200);
      }
      const refused=await request(s.t,route,s.web.token,{timeZone:"UTC"});
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(60);
      vi.setSystemTime(new Date("2026-10-28T05:00:01Z"));
      expect((await request(s.t,route,s.web.token,{timeZone:"UTC"})).status).toBe(200);
    } finally {vi.useRealTimers();}
  });
  it("reports a failed mint without the upstream answer",async()=>{
    const s=await seeded();vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({error:{message:"API key test-gemini-key not valid"}}),{status:400})));
    const response=await request(s.t,route,s.web.token,{timeZone:"UTC"});
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("test-gemini-key");
  });
});

describe("voice capture is a journal of the words",()=>{
  it("saves the exact words, applies at once and schedules no text model",async()=>{
    const s=await seeded(), words="Tomorrow call mom at 8 in the evening. Buy milk.";
    const c=voiceCapture(1,words,{planCommandId:command(2).id});
    const response=await enqueue(s.t,s.web.token,c);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({status:"applied",message:"Words saved."});
    expect(await s.t.run(ctx=>ctx.db.query("captures").collect())).toMatchObject([{text:words,status:"captured",attempts:0}]);
    expect(await s.t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
    expect((await read(s.t,s.web.token)).captures.at(-1)).toMatchObject({id:c.id,text:words,status:"captured"});
    expect((await (await poll(s.t,s.web.token)).json()).commands.at(-1)).toMatchObject({id:c.id,status:"applied"});
  });
  it("a text capture still schedules the text model",async()=>{
    const s=await seeded();
    expect((await enqueue(s.t,s.web.token,{...command(1),type:"capture",args:{text:"Buy milk"}})).status).toBe(202);
    const jobs=await s.t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.map(j=>j.name)).toEqual(["captureRun:run"]);
    expect(await s.t.run(ctx=>ctx.db.query("captures").collect())).toMatchObject([{status:"saved"}]);
  });
  it("a retry with the same command id saves the words once, and a changed retry is a conflict",async()=>{
    const s=await seeded(), c=voiceCapture(1);
    const first=await (await enqueue(s.t,s.web.token,c)).json();
    expect(await (await enqueue(s.t,s.web.token,c)).json()).toEqual(first);
    expect((await enqueue(s.t,s.web.token,voiceCapture(1,"Buy bread"))).status).toBe(409);
    expect(await s.t.run(ctx=>ctx.db.query("captures").collect())).toHaveLength(1);
    expect(await s.t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });
  it("the contract refuses another source or a bad plan command id",async()=>{
    const s=await seeded();
    expect((await enqueue(s.t,s.web.token,{...command(1),type:"capture",args:{text:"x",source:"typed"}})).status).toBe(400);
    expect((await enqueue(s.t,s.web.token,voiceCapture(2,"x",{planCommandId:"not-an-id"}))).status).toBe(400);
  });
});
