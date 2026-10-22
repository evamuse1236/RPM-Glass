import {chatInstruction,instruction} from './openrouter-prompts.mjs';
import fs from 'node:fs';
import {interpretTime, scheduledAlert} from './interpret.mjs';
import {editSchema,validateEdit} from './edits.mjs';
import {capitalizeTitle} from './title.mjs';

// Verified against https://openrouter.ai/api/v1/models on 2026-09-10.
export const MODEL = 'deepseek/deepseek-v4.1-flash';
export const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const nullableText = {type:['string','null'], maxLength:2000};
const evidence = {type:'array',items:{type:'string',minLength:1,maxLength:12000},maxItems:12};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const extractionSchema = object({
  entries:{type:'array',minItems:1,maxItems:8,items:object({
    title:{type:'string',minLength:1,maxLength:300},
    kind:{type:'string',enum:['plan','checkin']},
    state:{type:'string',enum:['active','completed','cancelled']},
    evidence:{...evidence,minItems:1},
    time:object({text:nullableText,evidence,uncertain:{type:'boolean'},clarification:nullableText}),
    durationMinutes:{type:['integer','null'],minimum:1,maximum:1440},
    durationEvidence:nullableText,
    alert:{type:['string','null'],enum:['alarm','reminder',null]},
    purpose:nullableText,purposeEvidence:nullableText,
  })},
  feelings:object({mood:nullableText,energy:{type:['string','null'],enum:['Low','Medium','High',null]},evidence}),
});
export const conversationSchema=object({
  intent:{type:'string',enum:['capture','edit']},
  entries:{...extractionSchema.properties.entries,minItems:0},
  feelings:extractionSchema.properties.feelings,
  edit:{...editSchema,type:['object','null']},
});

// The CLI keeps its current-message-only contract. Only the explicitly enabled
// web conversation accepts bounded context and these non-mutating dialogue turns.
export const chatSchema=object({
  ...conversationSchema.properties,
  intent:{type:'string',enum:['capture','edit','answer','cancel_question','chat']},
  answer:{...object({value:{type:'string',minLength:1,maxLength:2000},evidence:{...evidence,minItems:1}}),type:['object','null']},
  message:nullableText,
  continuation:{type:'boolean'},
});

// Small schema validator: same contract sent remotely and enforced locally.
function validate(value, schema) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const validType = types.some(t => t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):t==='integer'?Number.isInteger(value):typeof value===t);
  if (!validType || (schema.enum && !schema.enum.includes(value))) throw new Error('invalid_schema');
  if (value===null) return;
  if (typeof value==='string' && (value.length>(schema.maxLength??Infinity)||value.length<(schema.minLength??0))) throw new Error('invalid_schema');
  if (typeof value==='number' && (value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))) throw new Error('invalid_schema');
  if (Array.isArray(value)) {
    if(value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity)) throw new Error('invalid_schema');
    for(const item of value) validate(item,schema.items);
  } else if (schema.properties) {
    if(schema.required.some(k=>!Object.hasOwn(value,k)) || Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k))) throw new Error('invalid_schema');
    for(const [key,child] of Object.entries(schema.properties)) validate(value[key],child);
  }
}

export function normalizeExtraction(extraction, raw, now=new Date()) {
  validate(extraction,extractionSchema);
  const checkEvidence = spans => {if(spans.some(s=>!s.trim()||!raw.includes(s)))throw new Error('invalid_evidence');};
  checkEvidence(extraction.feelings.evidence);
  if((extraction.feelings.mood||extraction.feelings.energy)&&!extraction.feelings.evidence.length)throw new Error('missing_evidence');
  return extraction.entries.map(item=>{
    checkEvidence([...item.evidence,...item.time.evidence,...[item.durationEvidence,item.purposeEvidence].filter(x=>x!==null)]);
    if((item.durationMinutes!==null&&!item.durationEvidence)||(item.purpose&&!item.purposeEvidence)||(item.time.text&&!item.time.evidence.length))throw new Error('missing_evidence');
    if(!item.title.trim())throw new Error('invalid_schema');
    const kind=item.state==='completed'?'checkin':item.kind;
    let interpretation=interpretTime(item.time.text??'',now);
    if(item.time.text&&interpretation.status==='none')interpretation={...interpretation,status:'review',reason:'What day and time should I use?'};
    if(interpretation.minutes!==null&&item.durationMinutes!==null&&interpretation.minutes!==item.durationMinutes)interpretation={...interpretation,planned:null,plannedDate:null,end:null,minutes:null,status:'review',reason:'The time range and stated duration disagree. Choose which to keep.'};
    const timeSource=item.time.evidence.join(' ');
    // Relative-date arithmetic is local; invented absolute dates cannot bypass it.
    const inventedDate=[...(item.time.text??'').matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].some(m=>!timeSource.includes(m[0]));
    const uncertain=item.time.uncertain||inventedDate||interpretation.assumptions.some(a=>a.startsWith("AM/PM wasn't specified"));
    if(uncertain)interpretation={...interpretation,planned:null,end:null,minutes:null,plannedDate:interpretation.status==='date_only'&&!inventedDate?interpretation.plannedDate:null,status:'review',assumptions:[],reason:item.time.clarification||'What day and time should I use?'};
    if(kind==='checkin'||item.state==='cancelled')interpretation={...interpretation,planned:null,plannedDate:null,end:null,minutes:null,status:'not_scheduled'};
    interpretation={...interpretation,source:'openrouter',timeEvidence:item.time.evidence,normalizedPhrase:item.time.text,uncertain};
    const planned=interpretation.planned;
    const alertType=kind==='plan'&&item.state==='active'?item.alert:null;
    return {title:capitalizeTitle(item.title),kind,state:item.state,done:item.state!=='active',minutes:interpretation.minutes??item.durationMinutes??(kind==='plan'?30:null),durationSource:interpretation.minutes!=null||item.durationMinutes!==null?'user_words':kind==='plan'?'default_estimate':'unknown',purpose:item.purpose??'',planned,plannedDate:interpretation.plannedDate,interpretation,alertIntent:{type:alertType,reason:'Interpreted from this capture; editable with /alert.'},alert:planned&&alertType?scheduledAlert(alertType,planned,now):null,evidence:item.evidence,extracted:structuredClone(item)};
  });
}

export function readApiKey(file, env=process.env) {
  if(!file)return env.OPENROUTER_API_KEY?.trim()||null;
  const stat=fs.statSync(file);
  if(!stat.isFile()||(stat.mode&0o077)!==0)throw new Error('Key file must be private (chmod 600).');
  // Parse only this value; never execute/source a file or print its contents.
  const match=fs.readFileSync(file,'utf8').match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/m);
  if(!match)throw new Error('Key file has no OPENROUTER_API_KEY.');
  const key=match[1].replace(/^(['"])(.*)\1$/,'$2');
  if(!key||/\s/.test(key))throw new Error('Invalid OpenRouter key configuration.');
  return key;
}

const safeUsage = usage => {
  if(!usage||typeof usage!=='object')return null;
  const out={};
  for(const k of ['prompt_tokens','completion_tokens','total_tokens','cost'])if(Number.isFinite(usage[k])&&usage[k]>=0)out[k]=usage[k];
  if(Number.isFinite(usage.completion_tokens_details?.reasoning_tokens))out.reasoning_tokens=usage.completion_tokens_details.reasoning_tokens;
  if(Number.isFinite(usage.prompt_tokens_details?.cached_tokens))out.cached_tokens=usage.prompt_tokens_details.cached_tokens;
  return out;
};

export function createOpenRouter({apiKey,fetchImpl=fetch,timeoutMs=20000,conversation=false}={}) {
  return async (raw,{now=new Date(),mode='capture',captureOnly=false,context}={})=>{
    const started=performance.now();
    const metadata={source:'openrouter',model:MODEL,status:'failed',usage:null};
    try {
      if(!apiKey)throw new Error('missing_key');
      if(raw.length>12000)throw new Error('input_too_long');
      const chat=conversation&&Boolean(context)&&!captureOnly;
      if(chat&&JSON.stringify(context).length>20000)throw new Error('context_too_long');
      const schema=chat?chatSchema:conversationSchema;
      const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:instruction+(chat?'\n'+chatInstruction:'')+(captureOnly?'\nThis message was explicitly marked as a NEW note. Use capture intent. Do not edit existing entries.':'')+'\nReturn one JSON object matching this schema exactly:\n'+JSON.stringify(schema)},{role:'user',content:JSON.stringify({reference:now.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,mode,text:raw,...(chat?{context}:{})})}],temperature:0,max_tokens:3000,reasoning:{enabled:false,exclude:true},provider:{require_parameters:true,order:['deepseek']},response_format:{type:'json_object'}}),signal:AbortSignal.timeout(timeoutMs)});
      metadata.http=response.status;
      const retryAfter=response.headers?.get('retry-after');
      if(retryAfter&&/^\d+$/.test(retryAfter))metadata.retryAfterSeconds=Number(retryAfter);
      if(!response.ok)throw new Error('http_error');
      const data=await response.json();
      metadata.usage=safeUsage(data.usage);
      if(data.error)throw new Error('provider_error');
      if(data.model!==MODEL)throw new Error('unexpected_model');
      const choice=data.choices?.[0];
      if(choice?.finish_reason!=='stop')throw new Error('incomplete_response');
      let extraction;
      try{extraction=JSON.parse(choice.message.content);}catch{throw new Error('invalid_json');}
      validate(extraction,schema);
      if(chat){
        if(extraction.continuation&&extraction.intent!=='edit')throw new Error('invalid_edit');
        if(['answer','cancel_question','chat'].includes(extraction.intent)){
          if(extraction.entries.length||extraction.edit||extraction.feelings.mood||extraction.feelings.energy||extraction.feelings.evidence.length)throw new Error('invalid_schema');
          if(extraction.intent==='answer'){
            if(!extraction.answer||extraction.message||!context.question)throw new Error('invalid_schema');
            if(extraction.answer.evidence.some(s=>!s.trim()||!raw.includes(s)))throw new Error('invalid_evidence');
            for(const date of extraction.answer.value.match(/\b\d{4}-\d{2}-\d{2}\b/g)??[])if(!raw.includes(date))throw new Error('invalid_evidence');
          }else if(extraction.answer||Boolean(extraction.message)!==(extraction.intent==='chat'))throw new Error('invalid_schema');
          metadata.status='accepted';metadata.ms=Math.round(performance.now()-started);
          return {intent:extraction.intent,answer:extraction.answer?.value??null,message:extraction.message,entries:null,metadata};
        }
        if(extraction.answer||extraction.message)throw new Error('invalid_schema');
      }
      if(extraction.intent==='edit'){
        if(captureOnly)throw new Error('invalid_edit');
        if(!extraction.edit||extraction.entries.length||extraction.feelings.mood||extraction.feelings.energy||extraction.feelings.evidence.length)throw new Error('invalid_edit');
        const edit=validateEdit(extraction.edit,raw);
        metadata.status='accepted';metadata.ms=Math.round(performance.now()-started);
        return {intent:'edit',edit,entries:null,feelings:null,metadata,...(chat?{continuation:extraction.continuation}:{})};
      }
      if(extraction.edit!==null)throw new Error('invalid_schema');
      const entries=normalizeExtraction({entries:extraction.entries,feelings:extraction.feelings},raw,now);
      metadata.status='accepted';metadata.ms=Math.round(performance.now()-started);
      return {intent:'capture',entries,feelings:extraction.feelings,metadata};
    } catch(error) {
      const allowed=['missing_key','input_too_long','context_too_long','http_error','provider_error','unexpected_model','incomplete_response','invalid_json','invalid_schema','invalid_evidence','missing_evidence','invalid_edit'];
      metadata.failure=allowed.includes(error.message)?error.message:['TimeoutError','AbortError'].includes(error.name)?'timeout':'network_error';
      metadata.ms=Math.round(performance.now()-started);
      // Raw provider/transport errors can echo headers or user input. Never log them.
      return {entries:null,feelings:null,metadata};
    }
  };
}
