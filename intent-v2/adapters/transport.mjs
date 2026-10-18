import {TURN_SCHEMA,validate} from '../src/schema.mjs';
/** Pass fetchImpl only on Node/server. Android uses nativeModelTransport instead;
 * never store an API key in localStorage or expose it to a WebView prompt.
 */
const isClaude=model=>model.startsWith('anthropic/');
/**
 * Claude's strict structured outputs accept no length or count limits and no type lists, so the
 * provider sees the same shape without them. The full schema still validates every reply locally.
 */
export function providerSchema(schema){
 if(Array.isArray(schema))return schema.map(providerSchema);
 if(!schema||typeof schema!=='object')return schema;
 const {maxLength,maxItems,...rest}=schema;
 if(Array.isArray(rest.type)){const {type,...other}=rest;return {anyOf:type.map(t=>({type:t})),...providerSchema(other)};}
 return Object.fromEntries(Object.entries(rest).map(([k,v])=>[k,k==='enum'?v:providerSchema(v)]));
}
export function structuredRequest({model,prompt,input,maxTokens=3000,providerNames=[],effort}){
 if(typeof model!=='string'||!model.includes('/'))throw new Error('Configure and verify a supported OpenRouter model ID');
 if(effort!==undefined&&!['none','high'].includes(effort))throw new Error('Unsupported reasoning effort');
 const claude=isClaude(model);
 const reasoning=effort&&!(claude&&effort==='none')?{reasoning:{effort,exclude:true}}:{};
 return {model,...reasoning,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'rpm_intent_v1',strict:true,schema:claude?providerSchema(TURN_SCHEMA):TURN_SCHEMA}},max_tokens:maxTokens,provider:{require_parameters:true,allow_fallbacks:claude&&providerNames.length>1,...(providerNames.length?{only:providerNames}:{})}};
}
/** OpenRouter may answer with a dated snapshot of the requested model ("…-20261001"). */
const sameModel=(answered,requested)=>answered===requested||typeof answered==='string'&&answered.startsWith(requested+'-');
export function readStructuredResponse(body,{model,providerNames=[]}={}){
 if(model&&!sameModel(body?.model,model))throw new Error('Unexpected model; capture is retained');
 if(providerNames.length&&!providerNames.includes(body?.provider))throw new Error('Unexpected provider; capture is retained');
 try{
 const choice=body?.choices?.[0];if(choice?.finish_reason!=='stop'||choice.message?.refusal)throw new Error('Provider did not return a complete interpretation');
 const result=JSON.parse(choice.message.content);validate(result,TURN_SCHEMA);return result;
 }catch(error){error.code='INVALID_MODEL_RESPONSE';throw error;}
}
/** What one model call cost and who served it, for the capture trace. Never the content. */
export const usageOf=body=>({provider:body?.provider??null,servedModel:body?.model??null,inputTokens:body?.usage?.prompt_tokens??null,outputTokens:body?.usage?.completion_tokens??null,cost:body?.usage?.cost??null});
export function nativeModelTransport({native,model,prompt,providerNames=[],effort,requestIdFactory=()=>`intent-model:${crypto.randomUUID()}`}={}){
 return async(input,{signal,route,run}={})=>{
  const selectedEffort=route?.effort??effort,selectedModel=route?.model??model;
  const requestId=requestIdFactory(input);if(typeof requestId!=='string'||!requestId||requestId.length>160||!/^[A-Za-z0-9:_-]+$/.test(requestId))throw new Error('Invalid native model request ID');
  const cancelled=()=>native('cancelModel',{requestId}).catch(()=>{});
  if(signal?.aborted){cancelled();throw new DOMException('Interpretation cancelled','AbortError');}
  signal?.addEventListener('abort',cancelled,{once:true});
  try{
   const body=structuredRequest({model:selectedModel,prompt,input,providerNames,effort:selectedEffort,...(route?.maxTokens?{maxTokens:route.maxTokens}:{})});
   const r=await native('model',{requestId,body,...(route?.timeoutMs?{timeoutMs:route.timeoutMs+2000}:{})});
   if(signal?.aborted)throw new DOMException('Late native response ignored','AbortError');
   if(r.status===401||r.status===403)throw new Error('The AI service refused your key. Add a new OpenRouter key in Settings, then tap Retry.');
   if(r.status<200||r.status>=300)throw new Error(`Native model request failed (${r.status})`);
   if(run)Object.assign(run,{requestId,...usageOf(r.body)});
   return readStructuredResponse(r.body,{model:selectedModel,providerNames});
  }catch(error){if(error.code!=='INVALID_MODEL_RESPONSE'&&error.name!=='AbortError')error.code='TRANSPORT_ERROR';throw error;}finally{signal?.removeEventListener('abort',cancelled);}
 };
}
