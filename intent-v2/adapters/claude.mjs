import {TURN_SCHEMA,validate} from '../src/schema.mjs';
/** Anthropic Messages API IDs for the OpenRouter model IDs the routing policy names. */
export const CLAUDE_API_MODELS=Object.freeze({'anthropic/claude-haiku-5.5':'claude-haiku-5-5','anthropic/claude-sonnet-5.5':'claude-sonnet-5-5'});
/** Turning thinking off is spelled differently per model: Sonnet 5.5 rejects "disabled". */
const NO_THINKING=Object.freeze({'claude-haiku-5-5':'disabled','claude-sonnet-5-5':'between_tools'});
export function claudeRequest({model,prompt,input,schema,maxTokens=3000,effort}){
 const id=CLAUDE_API_MODELS[model];if(!id)throw new Error('No Claude API model for '+model);
 if(effort!==undefined&&!['none','high'].includes(effort))throw new Error('Unsupported reasoning effort');
 return {model:id,max_tokens:maxTokens,system:[{type:'text',text:prompt,cache_control:{type:'ephemeral'}}],messages:[{role:'user',content:JSON.stringify(input)}],
  output_config:{format:{type:'json_schema',schema},...(effort==='high'?{effort:'high'}:{})},
  ...(effort==='none'?{thinking:{type:NO_THINKING[id]}}:{})};
}
const sameModel=(answered,requested)=>answered===requested||typeof answered==='string'&&answered.startsWith(requested+'-');
export function readClaudeResponse(body,{model}={}){
 const id=CLAUDE_API_MODELS[model]??model;
 if(id&&!sameModel(body?.model,id))throw new Error('Unexpected model; capture is retained');
 try{
  if(!['end_turn','stop_sequence'].includes(body?.stop_reason))throw new Error('Provider did not return a complete interpretation');
  const text=(body.content??[]).find(block=>block?.type==='text')?.text;
  const result=JSON.parse(text);validate(result,TURN_SCHEMA);return result;
 }catch(error){error.code='INVALID_MODEL_RESPONSE';throw error;}
}
/** What one Claude call cost and who served it, for the capture trace. Never the content. */
export const claudeUsageOf=body=>({provider:'Anthropic',servedModel:body?.model??null,inputTokens:body?.usage?.input_tokens??null,outputTokens:body?.usage?.output_tokens??null,cacheReadTokens:body?.usage?.cache_read_input_tokens??null,cacheWriteTokens:body?.usage?.cache_creation_input_tokens??null,cost:null});
