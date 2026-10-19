export const API_ENDPOINT='https://api.anthropic.com/v1/messages';
export const API_VERSION='2023-06-01';
export const API_TIMEOUT_MS=95000;
export const PRICING_SOURCE='https://platform.claude.com/docs/en/about-claude/pricing';
const PRICES=Object.freeze({
 'claude-haiku-5-5':{input:0.10,output:0.50,read:0.01,write5m:0.125,write1h:0.20},
 'claude-sonnet-5-5':{input:2,output:10,read:0.10,write5m:2.5,write1h:4},
});
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function safeUsage(value){
 if(!value||typeof value!=='object')return null;
 const usage={};
 for(const name of ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens']){
  const n=count(value[name]);if(n!==null)usage[name]=n;
 }
 const creation={};
 for(const name of ['ephemeral_5m_input_tokens','ephemeral_1h_input_tokens']){
  const n=count(value.cache_creation?.[name]);if(n!==null)creation[name]=n;
 }
 if(Object.keys(creation).length)usage.cache_creation=creation;
 return Object.keys(usage).length?usage:null;
}
export function apiCost(model,usage){
 const price=PRICES[model];
 if(!price||usage?.input_tokens===undefined||usage?.output_tokens===undefined)return null;
 const input=usage.input_tokens,output=usage.output_tokens,read=usage.cache_read_input_tokens??0,write=usage.cache_creation_input_tokens??0;
 const write1h=usage.cache_creation?.ephemeral_1h_input_tokens??0,write5m=usage.cache_creation?.ephemeral_5m_input_tokens??(write-write1h);
 if(write5m<0||write1h+write5m!==write)return null;
 const multiplier=model==='claude-haiku-5-5'&&input+read+write>100000?5:1;
 return (input*price.input+output*price.output+read*price.read+write5m*price.write5m+write1h*price.write1h)*multiplier/1000000;
}
const servedModel=(model,requested)=>typeof model==='string'&&(model===requested||model.startsWith(requested+'-')&&/^\d{8}(?:T\d{6}Z)?$/.test(model.slice(requested.length+1)))?model:null;

export async function apiCall({prompt,input,route,deadline,signal,adapters,fetchImpl=fetch}){
 const started=Date.now(),requested=adapters.claude.CLAUDE_API_MODELS[route.model];
 const record={transport:'API transport',requestedModel:requested??null,servedModel:null,status:null,stopReason:null,ms:0,isError:false,usage:null,costUSD:null};
 const fail=code=>{record.isError=true;record.error=code;record.ms=Date.now()-started;
  const error=new Error(code==='INVALID_MODEL_RESPONSE'?'API transport returned an invalid interpretation; captured words are safe':'API transport could not obtain a model response; captured words are safe');
  error.code=code;error.record=record;return error;
 };
 const controller=new AbortController(),cancel=()=>controller.abort();
 const timeoutMs=Math.max(0,Math.min(API_TIMEOUT_MS,route.timeoutMs,deadline===undefined?Infinity:deadline-Date.now()));
 const timer=setTimeout(cancel,timeoutMs);
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted||timeoutMs===0)controller.abort();
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key||controller.signal.aborted)throw fail('TRANSPORT_ERROR');
  const body=adapters.claude.claudeRequest({model:route.model,prompt,input,schema:adapters.transport.providerSchema(adapters.schema.TURN_SCHEMA),maxTokens:route.maxTokens,effort:route.effort});
  const response=await fetchImpl(API_ENDPOINT,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':API_VERSION},body:JSON.stringify(body),signal:controller.signal});
  record.status=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
  if(controller.signal.aborted||record.status===null||record.status<200||record.status>=300)throw fail('TRANSPORT_ERROR');
  const value=await response.json();
  if(controller.signal.aborted)throw fail('TRANSPORT_ERROR');
  record.usage=safeUsage(value?.usage);record.costUSD=apiCost(requested,record.usage);
  record.stopReason=['end_turn','stop_sequence','max_tokens','refusal','tool_use','pause_turn'].includes(value?.stop_reason)?value.stop_reason:null;
  record.servedModel=servedModel(value?.model,requested);
  if(!record.servedModel)throw fail('TRANSPORT_ERROR');
  let output;
  try{output=adapters.claude.readClaudeResponse(value,{model:route.model});}catch(localError){
   const error=fail('INVALID_MODEL_RESPONSE');
   error.message=localError.message.replaceAll(key,'[redacted]');
   const fault=[TypeError,ReferenceError,SyntaxError,RangeError,EvalError,URIError].find(type=>localError instanceof type);
   if(fault)Object.setPrototypeOf(error,fault.prototype);
   throw error;
  }
  record.ms=Date.now()-started;
  return {record,output};
 }catch(error){throw error?.record===record?error:fail('TRANSPORT_ERROR');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
