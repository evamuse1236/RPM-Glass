import { httpActionGeneric, makeFunctionReference, type HttpRouter } from "convex/server";
import { validateCommand } from "../web/contract/validate.mjs";
import { canonicalJson, randomSecret, sha256 } from "./security";
import { validatePush, validatePull } from "./plannerProtocol";
declare const process:{env:Record<string,string|undefined>};

class RequestFailure extends Error {
  constructor(readonly status:number,readonly code:string,message:string){super(message);}
}
function invalid(message="The request does not match the planner contract"):never {
  throw new RequestFailure(400,"invalid_request",message);
}
function object(value:unknown,allowed:string[]):Record<string,any> {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(key=>!allowed.includes(key)))invalid();
  return value as Record<string,any>;
}
async function body(request:Request) {
  const declared = request.headers.get("Content-Length");
  if(declared && Number(declared)>1000000)throw new RequestFailure(413,"body_too_large","Request body exceeds 1 MB");
  const reader = request.body?.getReader();
  if(!reader)invalid("A JSON request body is required");
  const chunks:Uint8Array[] = [];
  let length = 0;
  for(;;) {
    const chunk = await reader.read();
    if(chunk.done)break;
    length+=chunk.value.byteLength;
    if(length>1000000) {
      await reader.cancel();
      throw new RequestFailure(413,"body_too_large","Request body exceeds 1 MB");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{invalid("Use a valid JSON request body");}
}
function originAllowed(origin:string) {
  if(origin===process.env.RPM_WEB_ORIGIN)return true;
  if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))return false;
  try{return new URL(origin).origin===origin;}catch{return false;}
}
function headers(request:Request) {
  const headers = new Headers({"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin","Access-Control-Expose-Headers":"ETag, Retry-After"});
  const origin = request.headers.get("Origin");
  if(origin && originAllowed(origin))headers.set("Access-Control-Allow-Origin",origin);
  return headers;
}
function response(request:Request,value:unknown,status=200,extra?:Record<string,string>) {
  const result = headers(request);
  for(const [name,value] of Object.entries(extra??{}))result.set(name,value);
  return new Response(status===204 || status===304?null:JSON.stringify(value),{status,headers:result});
}
function token(request:Request) {
  const authorization = request.headers.get("Authorization")??"";
  if(!/^Bearer [a-f0-9]{64}$/.test(authorization))throw new RequestFailure(401,"unauthorized","Credentials are invalid or expired");
  return sha256(authorization.slice(7));
}
function checked(validate:(value:unknown)=>unknown,value:unknown) {
  try{return validate(value);}catch{invalid();}
}
function linkCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(8))].map(value=>alphabet[value%alphabet.length]).join("");
}
export function registerPlannerRoutes(http:HttpRouter) {
  const routes = [
    ["/v1/web/link","POST","link"], ["/v1/web/link-code","POST","link-code"],
    ["/v1/web/snapshot","GET","snapshot"], ["/v1/web/commands","GET","commands"],
    ["/v1/web/commands","POST","enqueue"], ["/v1/web/session","DELETE","self-revoke"],
    ["/v1/web/sessions","GET","sessions"], ["/v1/web/revoke","POST","revoke"],
    ["/v1/planner/sync","POST","sync"],
    ["/v1/planner/push","POST","push"], ["/v1/planner/pull","POST","pull"],
  ] as const;
  for(const path of new Set(routes.map(route=>route[0])))http.route({path,method:"OPTIONS",handler:httpActionGeneric(async(_ctx,request)=>{
    const origin = request.headers.get("Origin");
    if(origin && !originAllowed(origin))return response(request,{error:{code:"origin_forbidden",message:"This browser origin is not allowed"}},403);
    return response(request,null,204,{"Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type, If-None-Match"});
  })});
  for(const [path,method,op] of routes)http.route({path,method,handler:httpActionGeneric(async(ctx,request)=>{
    try {
      const origin = request.headers.get("Origin");
      if(origin && !originAllowed(origin))throw new RequestFailure(403,"origin_forbidden","This browser origin is not allowed");
      if(op==="sync")return response(request,{error:{code:"upgrade_required",message:"Update the phone app to sync this planner"}},410);
      let result:any, rawToken:string|undefined, code:string|undefined;
      if(op==="link") {
        const value = object(await body(request),["code","label"]);
        if(typeof value.code!=="string" || value.code.length>100 || value.label!==undefined && (typeof value.label!=="string" || !value.label.trim() || value.label.length>80))invalid();
        rawToken = randomSecret();
        result = await ctx.runMutation(makeFunctionReference<"mutation">("planner:exchange"),{codeHash:await sha256(value.code),tokenHash:await sha256(rawToken),label:value.label?.trim()??"Web browser"});
      } else {
        const tokenHash = await token(request);
        if(op==="push" || op==="pull") {
          const raw=await body(request);
          if(op==="push" && new TextEncoder().encode(JSON.stringify(raw)).length>800000)throw new RequestFailure(413,"body_too_large","Push part exceeds 800 KB");
          const value=checked(op==="push"?validatePush:validatePull,raw);
          result=await ctx.runMutation(makeFunctionReference<"mutation">(`phoneSync:${op}`),{tokenHash,...value as Record<string,any>});
        } else if(["link-code","sessions","revoke"].includes(op)) {
          const args:Record<string,any> = {op,tokenHash};
          if(op==="link-code") {
            object(await body(request),[]);
            code = linkCode();args.codeHash = await sha256(code);
          }
          if(op==="revoke") {
            const value = object(await body(request),["sessionId"]);
            if(typeof value.sessionId!=="string" || value.sessionId.length>160)invalid();
            args.sessionId = value.sessionId;
          }
          result = await ctx.runMutation(makeFunctionReference<"mutation">("planner:phone"),args);
        } else {
          const args:Record<string,any> = {op:op==="self-revoke"?"revoke":op,tokenHash};
          if(op==="enqueue") {
            args.command = checked(validateCommand,await body(request));
            args.identity = await sha256(canonicalJson(args.command));
          }
          if(op==="commands") {
            const since = new URL(request.url).searchParams.get("since")??"0";
            if(!/^\d+$/.test(since) || !Number.isSafeInteger(Number(since)))invalid("Use a nonnegative command cursor");
            args.since = Number(since);
          }
          result = await ctx.runMutation(makeFunctionReference<"mutation">("planner:browser"),args);
        }
      }
      if(result.error)return response(request,{error:result.error},result.status,result.retryAfter?{"Retry-After":String(result.retryAfter)}:undefined);
      if(op==="link")result = {...result,token:rawToken};
      if(op==="link-code")result = {...result,code};
      if(op==="snapshot") {
        const etag = `"rpm-${result.snapshot.revision}"`;
        const match = request.headers.get("If-None-Match");
        const unchanged = match?.split(",").map(value=>value.trim()).some(value=>value==="*" || value.replace(/^W\//,"")===etag);
        return response(request,result.snapshot,unchanged?304:200,{ETag:etag});
      }
      return response(request,result,op==="enqueue" && result.status==="pending"?202:200);
    } catch(error) {
      if(error instanceof RequestFailure)return response(request,{error:{code:error.code,message:error.message}},error.status);
      return response(request,{error:{code:"unavailable",message:"Planner service is temporarily unavailable"}},503);
    }
  })});
}
