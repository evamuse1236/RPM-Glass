import {randomUUID} from 'node:crypto';
import {interpretTime,formatTime,localDate} from '../cli/interpret.mjs';
import {editPatch} from '../cli/edits.mjs';
import {recordSnapshot,restoreSnapshot} from './companion-state.mjs';

const str={type:'string',maxLength:2000};
const nullable={type:['string','null'],maxLength:2000};
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const list=(items,maxItems=20)=>({type:'array',items,maxItems});
const fields=obj({title:str,kind:{type:'string',enum:['plan','checkin']},time:nullable,duration:{type:['integer','null'],minimum:1,maximum:1440},purpose:nullable,mood:nullable,energy:nullable,alert:{type:['string','null'],enum:['alarm','reminder','off',null]},status:{type:'string',enum:['active','done','cancelled']},recurrence:{type:['string','null'],enum:['daily','weekly','weekdays',null]},preference:str},[]);
const operation=obj({type:{type:'string',enum:['create','update','remember','archive','restore']},collection:{type:'string',enum:['entries','memories','history','conversations']},id:{type:['integer','string','null']},fields,evidence:list(str,8)});
const suggestions=list(obj({label:{type:'string',maxLength:60},text:{type:'string',maxLength:800}}),4);
export const schemas={
  read_context:obj({collection:{type:'string',enum:['entries','history','memories','conversations']},query:{type:'string',maxLength:300},cursor:{type:'integer',minimum:0}}),
  propose_changes:obj({operations:list(operation),continuation:{type:'boolean'},question:nullable,choices:suggestions}),
  respond:obj({message:{type:'string',minLength:1,maxLength:4000},suggestions}),
};
// Sparse patches distinguish omitted fields (leave unchanged) from null (clear).
// Explicit non-strict mode prevents Responses-backed routes requiring every field.
export const tools=Object.entries(schemas).map(([name,parameters])=>({type:'function',function:{name,parameters,strict:false,description:{read_context:'Read/search ANY unarchived RPM data, including original words and older chats. Paginated; use nextCursor until done. Archived data is excluded.',propose_changes:'Apply an entire requested transaction, or hold all of it for one clarification. Include every requested operation. Set continuation=true only to resolve/replace the entire open proposal. A question holds ALL changes. Use choices as full-text answers to the missing detail. Times are natural phrases, never guessed timestamps.',respond:'Reply conversationally without changing records, optionally showing up to four helpful suggestion bubbles. Never claim changes without propose_changes. Offer brief coaching when invited; do not turn feelings into tasks.'}[name]}}));
export function validate(value,schema){
  const types=[schema.type].flat();
  if(!types.some(t=>t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):t==='integer'?Number.isInteger(value):typeof value===t))throw new Error('invalid_tool_arguments');
  if(schema.enum&&!schema.enum.includes(value))throw new Error('invalid_tool_arguments');
  if(value===null)return;
  if(typeof value==='string'&&(value.length>(schema.maxLength??Infinity)||value.length<(schema.minLength??0)))throw new Error('invalid_tool_arguments');
  if(typeof value==='number'&&(value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)))throw new Error('invalid_tool_arguments');
  if(Array.isArray(value)){if(value.length>(schema.maxItems??Infinity))throw new Error('invalid_tool_arguments');for(const v of value)validate(v,schema.items);}
  else if(schema.properties){if(schema.required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))throw new Error('invalid_tool_arguments');for(const k of Object.keys(value))validate(value[k],schema.properties[k]);}
}
export function entryView(e){
  return {id:e.id,title:e.title,kind:e.kind??'plan',when:e.planned?formatTime(e.planned):e.plannedDate?e.plannedDate+' · time not set':null,planned:e.planned??null,minutes:e.minutes??null,durationSource:e.durationSource,mood:e.mood,energy:e.energy,purpose:e.purpose,raw:e.raw,state:e.state,done:e.done,archived:!!e.archived,recurrence:e.recurrence??null,repeatAfterDays:e.repeatAfterDays??null,alert:e.alertIntent?.type??e.alert?.type??null,revision:e.revisions?.length??0};
}
function contextRows(data,collection){
  const archivedEntries=new Set(data.entries.filter(e=>e.archived).map(e=>e.id));
  const archivedConversations=new Set(data.conversations.filter(c=>c.archived).map(c=>c.id));
  const excludedWords=new Set([...data.history.filter(h=>h.archived||archivedConversations.has(h.conversationId)||(h.entryIds??[]).some(id=>archivedEntries.has(id))).flatMap(h=>[h.raw,h.response]),...data.memories.filter(m=>m.archived).map(m=>m.source)].filter(Boolean));
  if(collection==='entries')return data.entries.filter(e=>!e.archived).map(e=>({...entryView(e),revisions:e.revisions}));
  if(collection==='conversations')return data.conversations.filter(c=>!c.archived).map(c=>({id:c.id,title:c.title,messages:c.messages.filter(m=>!excludedWords.has(m.text)&&!(m.entryIds??[]).some(id=>archivedEntries.has(id))&&!(m.memories??[]).some(m=>data.memories.find(x=>x.id===m.id)?.archived))}));
  return data[collection].filter(e=>!e.archived&&!archivedConversations.has(e.conversationId)&&!excludedWords.has(e.raw)&&!(e.entryIds??[]).some(id=>archivedEntries.has(id)));
}
export function readContext(data,{collection,query='',cursor=0}){
  const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
  let rows=contextRows(data,collection);
  // Conversations are paged by message rather than returning unbounded transcripts.
  if(collection==='conversations')rows=rows.flatMap(c=>c.messages.map(m=>({conversationId:c.id,title:c.title,...m})));
  rows=rows.filter(r=>terms.every(t=>JSON.stringify(r).toLowerCase().includes(t)));
  const items=rows.slice(cursor,cursor+12);
  return {items,total:rows.length,nextCursor:cursor+items.length<rows.length?cursor+items.length:null};
}
export function initialContext(data,conversationId){
  const c=contextRows(data,'conversations').find(c=>c.id===conversationId);
  return {entries:data.entries.filter(e=>!e.archived).slice(-30).map(entryView),memories:data.memories.filter(m=>!m.archived).slice(-30),pending:data.pending,counts:Object.fromEntries(['entries','memories','history','conversations'].map(k=>[k,contextRows(data,k).length])),recentMessages:c?.archived?[]:(c?.messages??[]).slice(-14).filter(m=>!(m.entryIds??[]).some(id=>data.entries.find(e=>e.id===id)?.archived)).map(m=>({role:m.role,text:m.text})),allHistoryAvailableThrough:'read_context'};
}
function normalizeClock(text,entry,now){
  if(!text)return text;
  // Normalize clocks, never arbitrary numbers inside dates (2026 is not 20:26).
  text=text.trim().replace(/\b(\d{1,2})([0-5]\d)([ap](?:m)?)\b/gi,'$1:$2$3')
    .replace(/^((?:maybe\s+|at\s+)?)(\d{1,2})([0-5]\d)$/i,'$1$2:$3')
    .replace(/\bat\s+(\d{1,2})([0-5]\d)(?![\d-])\b/gi,'at $1:$2');
  // A bare clock correction inherits the known period and day, not the next occurrence.
  const match=text.match(/^(?:maybe\s+|at\s+)?(\d{1,2})(?::([0-5]\d))?\s*$/i);
  if(match&&entry.planned){const old=new Date(entry.planned);text=`${Number(match[1])}:${match[2]??'00'}${Number(match[1])>12?'':old.getHours()<12?'am':'pm'}`;}
  return text;
}
function createEntry(data,raw,now){
  return {id:Math.max(0,...data.entries.map(e=>e.id))+1,kind:'plan',title:'',raw,created:now.toISOString(),state:'active',done:false,planned:null,plannedDate:null,minutes:30,durationSource:'default_estimate',purpose:'',mood:null,energy:null,alert:null,alertIntent:{type:null},recurrence:null,revisions:[],archived:false,source:'conversation'};
}
function patchEntry(e,fields,raw,now){
  const patch={};const changes=[];
  for(const [field,value] of Object.entries(fields)){
    if(field==='preference')throw new Error('Preference needs a memory, not an entry.');
    if(field==='kind'){if(e.revisions.length&&e.kind!==value)throw new Error('Entry kind cannot be changed.');patch.kind=value;continue;}
    if(field==='recurrence'){patch.recurrence=value;continue;}
    if(field==='time'){changes.push({field:'time',op:value===null?'clear':'set',value:normalizeClock(value,e,now),evidence:[raw]});continue;}
    const name=field==='duration'?'duration':field;
    changes.push({field:name,op:value===null?'clear':'set',value:value===null?null:String(value),evidence:[raw]});
  }
  const working={...e,...patch};
  if(working.kind==='checkin'){
    working.minutes=fields.duration??null;working.durationSource=fields.duration?'user_words':'unknown';
    if(Object.hasOwn(fields,'time'))throw new Error('A check-in cannot schedule a future alert.');
  }
  const result=changes.length?editPatch(working,{changes,clarification:null},now):{patch:{}};
  if(result.need){
    const c=changes[result.need.index];
    const value=c?.value??'';
    const clock=value.match(/\b(\d{1,2}(?::[0-5]\d)?)\b/);
    const options=result.need.field==='time'&&clock&&!/\b(?:am|pm)\b/i.test(value)?['AM','PM'].map(p=>({label:clock[1]+' '+p,text:`For ${e.title||fields.title}, use ${clock[1]}${p.toLowerCase()}.`})):[];
    return {need:{question:`For ${e.title||fields.title}: ${result.need.prompt}`,choices:options}};
  }
  if(result.error)throw new Error(result.error);
  return {patch:{...patch,...result.patch,...(working.kind==='checkin'?{minutes:Object.hasOwn(fields,'duration')?fields.duration:e.kind==='checkin'?e.minutes:null,durationSource:fields.duration?'user_words':e.kind==='checkin'?e.durationSource:'unknown'}:{})}};
}
export function propose(data,args,{raw,conversationId,now=new Date()}={}){
  validate(args,schemas.propose_changes);
  if(args.continuation&&!data.pending)throw new Error('There is no pending proposal.');
  if(args.continuation&&data.pending.operations.some(old=>!args.operations.some(next=>next.type===old.type&&next.collection===old.collection&&(old.id===null||next.id===old.id))))throw new Error('The reply omitted part of the pending request. Include every original operation.');
  if(data.pending&&!args.continuation&&args.operations.length)throw new Error('Resolve or explicitly cancel the pending proposal before a separate change.');
  const evidenceText=[raw,...(args.continuation?data.pending?.raws??[]:[])].join('\n');
  const copy=structuredClone(data);const changed=[];const remembered=[];let missing=null;
  for(const op of args.operations){
    if(!op.evidence.length||op.evidence.some(e=>!e.trim()||!evidenceText.includes(e)))throw new Error('Changes need exact supporting words from the request.');
    if(op.type==='archive'||op.type==='restore'){
      const target=copy[op.collection].find(x=>x.id===op.id);if(!target)throw new Error('That record no longer exists.');target.archived=op.type==='archive';
      if(op.collection==='entries')changed.push(target.id);continue;
    }
    if(op.type==='remember'){
      if(op.collection!=='memories'||!op.fields.preference?.trim())throw new Error('A memory needs an explicitly stated preference.');
      let m=op.id===null?null:copy.memories.find(m=>m.id===op.id&&!m.archived);
      if(op.id!==null&&!m)throw new Error('That memory no longer exists.');
      if(!m){m={id:randomUUID(),created:now.toISOString(),archived:false,revisions:[]};copy.memories.push(m);}
      m.revisions.push({text:m.text??null,at:now.toISOString()});m.text=op.fields.preference;m.evidence=op.evidence;m.source=raw;remembered.push(m.id);continue;
    }
    if(op.collection!=='entries')throw new Error('Create and update apply to entries only.');
    let e=op.type==='create'?createEntry(copy,evidenceText,now):copy.entries.find(e=>e.id===op.id&&!e.archived);
    if(!e)throw new Error('That plan is missing or archived. Read current context first.');
    if(op.type==='create'){if(!op.fields.title?.trim())throw new Error('A new entry needs a title.');copy.entries.push(e);}
    const built=patchEntry(e,op.fields,evidenceText,now);
    if(built.need){missing??=built.need;continue;}
    Object.assign(e,built.patch);e.revisions??=[];
    e.revisions.push({at:now.toISOString(),reason:raw,snapshot:entryView(e)});changed.push(e.id);
  }
  const question=args.question||missing?.question;
  if(question){
    data.pending={id:data.pending?.id??randomUUID(),conversationId,operations:args.operations,raws:[...(args.continuation?data.pending.raws:[]),raw],question,choices:args.choices.length?args.choices:missing?.choices??[],created:now.toISOString()};
    return {text:'I have the changes together. '+question,proposal:structuredClone(data.pending),suggestions:data.pending.choices};
  }
  if(!args.operations.length)throw new Error('No changes supplied. Use respond for conversation.');
  data.undo={id:randomUUID(),before:recordSnapshot(data),at:now.toISOString()};
  for(const k of ['entries','memories','history'])data[k]=copy[k];
  for(const c of data.conversations)c.archived=copy.conversations.find(x=>x.id===c.id).archived;
  data.pending=null;
  const ids=[...new Set(changed)];
  const text=remembered.length?'Remembered. You can inspect or change this in Context.':args.operations.every(o=>o.type==='archive')?'Archived from active context. The original is kept.':args.operations.every(o=>o.type==='restore')?'Restored to active context.':ids.length===1?'All set.':`All set — ${ids.length} entries updated together.`;
  return {text,entryIds:ids,receipts:ids.map(id=>entryView(data.entries.find(e=>e.id===id))),memories:remembered.map(id=>data.memories.find(m=>m.id===id)),undoId:data.undo.id,suggestions:ids.length?[{label:'Change time',text:`Change the time for ${ids.map(id=>'#'+id).join(' and ')}.`},{label:'Add purpose',text:`Add a purpose to #${ids[0]}.`}]:[]};
}
export function undo(data,id){
  if(!data.undo||data.undo.id!==id)throw new Error('Only the latest change can be undone.');
  restoreSnapshot(data,data.undo.before);data.undo=null;return {text:'Undone. The previous state is restored.'};
}
