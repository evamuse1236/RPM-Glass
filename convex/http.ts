import { httpActionGeneric as httpAction, httpRouter, makeFunctionReference } from "convex/server";
import { randomSecret, sha256 } from "./security";
const http=httpRouter();
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
async function body(request:Request){
  const text=await request.text();if(new TextEncoder().encode(text).byteLength>1000000)throw new Error("Body too large");return JSON.parse(text);
}
http.route({path:"/v1/pair",method:"POST",handler:httpAction(async(ctx,request)=>{
  try{
    const value=await body(request);
    if(typeof value.code!=="string"||!/^[a-f0-9]{32}$/.test(value.code)||typeof value.installationId!=="string"||!/^[a-f0-9-]{36}$/.test(value.installationId))return json({error:"Invalid pairing request"},400);
    const token=randomSecret();
    const accepted=await ctx.runMutation(makeFunctionReference<"mutation">("sync:pair"),{codeHash:await sha256(value.code),tokenHash:await sha256(token),installationId:value.installationId});
    return accepted?json({token,protocol:1}):json({error:"Pairing code expired or already used"},401);
  }catch{return json({error:"Invalid pairing request"},400);}
})});
http.route({path:"/v1/sync",method:"POST",handler:httpAction(async(ctx,request)=>{
  const authorization=request.headers.get("Authorization")??"";
  if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return json({error:"Unauthorized"},401);
  try{
    const value=await body(request);
    if(!Array.isArray(value.events)||value.events.length>50)return json({error:"Invalid batch"},400);
    const result=await ctx.runMutation(makeFunctionReference<"mutation">("sync:ingest"),{tokenHash:await sha256(authorization.slice(7)),events:value.events});
    return result===null?json({error:"Unauthorized"},401):json(result);
  }catch{return json({error:"Invalid batch; nothing acknowledged"},400);}
})});
http.route({path:"/health",method:"GET",handler:httpAction(async()=>json({service:"rpm-sync",protocol:1}))});
export default http;
