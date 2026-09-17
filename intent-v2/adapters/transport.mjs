import {TURN_SCHEMA,validate} from '../src/schema.mjs';
/** Pass fetchImpl only on Node/server. Android uses nativeModelTransport instead;
 * never store an API key in localStorage or expose it to a WebView prompt.
 */
export function structuredRequest({model,prompt,input,maxTokens=3000,providerNames=[]}){
 if(typeof model!=='string'||!model.includes('/'))throw new Error('Configure and verify a supported OpenRouter model ID');
 return {model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'rpm_intent_v1',strict:true,schema:TURN_SCHEMA}},max_tokens:maxTokens,provider:{require_parameters:true,allow_fallbacks:false,...(providerNames.length?{only:providerNames}:{})}};
}
export function readStructuredResponse(body){
 const choice=body?.choices?.[0];if(choice?.finish_reason!=='stop'||choice.message?.refusal)throw new Error('Provider did not return a complete interpretation');
 const result=JSON.parse(choice.message.content);validate(result,TURN_SCHEMA);return result;
}
export function openRouterTransport({apiKey,model,prompt,fetchImpl=fetch,providerNames=[]}={}){
 if(!apiKey)throw new Error('Set OPENROUTER_API_KEY on the server');
 return async(input,{signal}={})=>{
  const r=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(structuredRequest({model,prompt,input,providerNames})),signal});
  if(!r.ok)throw new Error(`Model request failed (${r.status}); capture is retained`);
  return readStructuredResponse(await r.json());
 };
}
export function nativeModelTransport({native,model,prompt,providerNames=[],requestIdFactory=()=>`intent-model:${crypto.randomUUID()}`}={}){
 return async(input,{signal}={})=>{
  const requestId=requestIdFactory(input);if(typeof requestId!=='string'||!requestId||requestId.length>160||!/^[A-Za-z0-9:_-]+$/.test(requestId))throw new Error('Invalid native model request ID');
  const cancelled=()=>native('cancelModel',{requestId}).catch(()=>{});
  if(signal?.aborted){cancelled();throw new DOMException('Interpretation cancelled','AbortError');}
  signal?.addEventListener('abort',cancelled,{once:true});
  try{
   const r=await native('model',{requestId,body:structuredRequest({model,prompt,input,providerNames})});
   if(signal?.aborted)throw new DOMException('Late native response ignored','AbortError');
   if(r.status<200||r.status>=300)throw new Error(`Native model request failed (${r.status})`);
   return readStructuredResponse(r.body);
  }finally{signal?.removeEventListener('abort',cancelled);}
 };
}
