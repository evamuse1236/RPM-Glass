/** Retrieval is local, bounded, and source-preserving. No inferred biography. */
export function sourceUnits(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>12000)throw new Error('Use 1–12,000 characters');
 const units=[];const re=/[^\n.!?;]+(?:[.!?;]+|$)|[^\n]+/g;
 // Sentence boundaries are aids, not a claim that every action is a sentence.
 // Keep exact substrings and spans; multi-action sentences remain one unit.
 for(const m of raw.matchAll(re)){
  const text=m[0].trim();if(!text)continue;
  const start=m.index+m[0].indexOf(text);units.push({id:`s${units.length}`,text,start,end:start+text.length});
 }
 if(!units.length)units.push({id:'s0',text:raw,start:0,end:raw.length});
 if(units.length>100)throw new Error('This capture needs chunked interpretation; the original remains saved');
 return units;
}
export function entityRows(data,entity){return entity==='task'?(data.entries??[]).filter(e=>!e.archived&&(e.kind??'plan')==='plan'):(data.planner?.[{block:'blocks',project:'projects',goal:'goals',area:'areas'}[entity]]??[]);}
export function findEntity(data,entity,id){return entityRows(data,entity).find(x=>String(x.id)===String(id));}
export function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
function relevance(text,query){const words=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[])];return words.reduce((s,w)=>s+(text.toLowerCase().includes(w)?1:0),0);}
export function localStamp(value,timezone){
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export function contextEntity(entity,row,timezone){
 const startLocal=localStamp(row.planned,timezone),minutes=Number.isInteger(row.minutes)&&row.minutes>0?row.minutes:null;
 return {entity,id:String(row.id),title:row.title,purpose:row.purpose??null,planned:row.planned??null,plannedDate:row.plannedDate??null,savedLocalDate:startLocal?.slice(0,10)??row.plannedDate??null,startLocal,endLocal:startLocal&&minutes?localStamp(new Date(Date.parse(row.planned)+minutes*60000).toISOString(),timezone):null,minutes,blockId:row.blockId??null,projectId:row.projectId??null,goalId:row.goalId??null,done:!!row.done};
}
export function buildContext(data,{raw,messageId=null,conversationId,focus={},now=new Date(),maxChars=14000,timezone=Intl.DateTimeFormat().resolvedOptions().timeZone}={}){
 const at=+now,result={timezone,now:now.toISOString(),nowLocal:localStamp(now.toISOString(),timezone),scheduleCoverage:{records:'retrieved subset of saved RPM records',calendar:'not read',canAssertFreeTime:false},focus,entities:[],memories:[],recentMessages:[]};
 const add=(key,item)=>{const next={...result,[key]:[...result[key],item]};if(JSON.stringify(next).length<=maxChars)result[key].push(item);};
 const conversation=(data.conversations??[]).find(c=>c.id===conversationId&&!c.archived);
 const excludedEntries=new Set((data.entries??[]).filter(e=>e.archived).map(e=>e.id));
 const forgotten=[...(data.memories??[]),...(data.intentV2?.approvedMemories??[])].filter(m=>m.archived).flatMap(m=>[m.source,m.evidence]).flat().filter(x=>typeof x==='string'&&x.length>4);
 const excludedRaw=(data.history??[]).filter(h=>h.archived||(h.entryIds??[]).some(id=>excludedEntries.has(id))).flatMap(h=>[h.raw,h.response]).filter(Boolean);
 const pilotMessages=Object.values(data.intentV2?.captures??{}).filter(c=>c.conversationId===conversationId&&!c.archived&&(messageId?c.messageId!==messageId:c.raw!==raw)&&Date.parse(c.at)<=at).flatMap(c=>[{role:'user',text:c.raw,at:c.at},...(c.reply?[{role:'assistant',text:c.reply,at:c.at}]:[])]);
 const messages=[...(conversation?.messages??[]),...pilotMessages].sort((a,b)=>String(a.at??'').localeCompare(String(b.at??''))).filter(m=>(!m.at||Date.parse(m.at)<=at)&&!(m.entryIds??[]).some(id=>excludedEntries.has(id))&&!excludedRaw.includes(m.text)&&!forgotten.some(s=>String(m.text??'').includes(s))).slice(-6);
 // Reserve the budget for the nearest conversation before broad task retrieval.
 for(const m of [...messages].reverse())add('recentMessages',{role:m.role,text:String(m.text??'').slice(0,700)});
 result.recentMessages.reverse();
 const candidates=[];
 for(const entity of ['task','block','project','goal','area'])for(const row of entityRows(data,entity)){
  const focusId=focus[entity+'Id'];
  const score=(String(focusId??'')===String(row.id)?100:0)+relevance(row.title??'',raw)*10+(entity==='task'&&!row.done&&row.state!=='cancelled'?2:0);
  if(score>0)candidates.push({entity,row,score});
 }
 for(const {entity,row} of candidates.sort((a,b)=>b.score-a.score).slice(0,16))add('entities',contextEntity(entity,row,timezone));
 // A task belongs to a Block: offer the Blocks of related tasks too, so a new
 // thought can be filed beside its neighbours instead of falling to the Inbox.
 const parents=[...new Set(result.entities.filter(e=>e.entity==='task'&&e.blockId).map(e=>e.blockId))].filter(id=>!result.entities.some(e=>e.entity==='block'&&e.id===id));
 for(const id of parents.slice(0,6)){const row=findEntity(data,'block',id);if(row&&!row.archived)add('entities',contextEntity('block',row,timezone));}
 const memories=[...(data.memories??[]).filter(m=>!m.archived&&m.text).map(m=>({...m,approved:true})),...(data.intentV2?.approvedMemories??[])];
 for(const m of memories.filter(m=>m.approved&&!m.archived&&!m.supersededBy&&(!m.expiresAt||Date.parse(m.expiresAt)>at)).map(m=>({m,score:relevance(m.text??'',raw)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5))add('memories',{id:m.m.id,text:m.m.text,source:m.m.source??m.m.evidence??null});
 // Context values remain data, not instructions. Zero-match passages are excluded.
 if(data.planner?.context?.approved)for(const field of ['vision','goals','coreValues']){
  const value=data.planner.context[field];if(!value)continue;
  for(const part of value.split(/\n\s*\n/).filter(x=>relevance(x,raw)>0).slice(0,2))add('memories',{id:`approved-context:${field}`,text:part.slice(0,1000),source:'User-approved planning context'});
 }

 return result;
}
export function guardsFor(data,operations){
 const guards={};
 const keep=(entity,id)=>{const row=findEntity(data,entity,id);if(!row)throw new Error(`Unknown ${entity} ID ${id}`);guards[`${entity}:${id}`]=stable(row);};
 for(const op of operations){if(op.targetId!==null)keep(op.entity,op.targetId);
  for(const f of op.fields){const linked={blockId:'block',projectId:'project',goalId:'goal',areaId:'area'}[f.name];if(linked&&f.op==='set'&&!String(f.value).startsWith('$'))keep(linked,f.value);}
 }
 return guards;
}
export function checkGuards(data,guards){for(const [key,value] of Object.entries(guards??{})){const i=key.indexOf(':'),entity=key.slice(0,i),id=key.slice(i+1);if(stable(findEntity(data,entity,id))!==value)throw new Error('TARGET_CHANGED: reopen the draft against the current plan');}}
