import { convexTest } from "convex-test";
import { expect } from "vitest";
import schema from "../convex/schema";
import { sha256 } from "../convex/security";
import fixture from "../web/fixtures/snapshot.json";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
export const setup = () => convexTest(schema,modules);
export type Test = ReturnType<typeof setup>;
export function snapshot(revision=42) {return {...structuredClone(fixture),revision};}
export function command(number=1) {return {id:`12345678-1234-4234-8234-${String(number).padStart(12,"0")}`,type:"complete",args:{taskId:3},baseRevision:42,createdAt:"2026-10-19T07:00:00+05:30"};}
export async function request(t:Test,path:string,token?:string,value?:unknown,method="POST",headers:Record<string,string>={}) {
  return t.fetch(path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},...(value===undefined?{}:{body:JSON.stringify(value)})});
}
export async function phone(t:Test,number=1) {
  const token = number.toString(16).padStart(64,"0");
  const id = await t.run(async ctx=>ctx.db.insert("devices",{installationId:`installation-${number}`,tokenHash:await sha256(token),label:`Phone ${number}`,pairedAt:Date.now(),revoked:false}));
  return {token,id};
}
export async function linked(t:Test,phoneToken:string,label="Laptop") {
  const response = await request(t,"/v1/web/link-code",phoneToken,{});
  expect(response.status).toBe(200);
  const {code} = await response.json();
  const exchanged = await request(t,"/v1/web/link",undefined,{code,label});
  expect(exchanged.status).toBe(200);
  return await exchanged.json() as {token:string;sessionId:string;accountId:string;protocol:number};
}
export async function sync(t:Test,token:string,value:unknown={acks:[]}) {return request(t,"/v1/planner/sync",token,value);}
export async function enqueue(t:Test,token:string,value:unknown=command()) {return request(t,"/v1/web/commands",token,value);}
export async function poll(t:Test,token:string,since=0) {return request(t,`/v1/web/commands?since=${since}`,token,undefined,"GET");}
