import {interpretTime,durationFromText,localDate,scheduledAlert,formatTime} from './interpret.mjs';

const text={type:['string','null'],maxLength:2000};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const editSchema=object({
  target:text,targetEvidence:text,
  changes:{type:'array',minItems:1,maxItems:6,items:object({
    field:{type:'string',enum:['time','duration','mood','energy','purpose','alert','status','title']},
    op:{type:'string',enum:['set','clear','shift']},value:text,
    evidence:{type:'array',minItems:1,maxItems:8,items:{type:'string',minLength:1,maxLength:12000}},
  })},
  clarification:text,
});

export function validateEdit(edit,raw){
  const spans=[edit.targetEvidence,...edit.changes.flatMap(c=>c.evidence)].filter(s=>s!==null);
  if(spans.some(s=>!s.trim()||!raw.includes(s))||(edit.target&&!edit.targetEvidence))throw new Error('invalid_evidence');
  if(new Set(edit.changes.map(c=>c.field)).size!==edit.changes.length)throw new Error('invalid_edit');
  for(const c of edit.changes){
    if(c.op==='shift'&&c.field!=='time')throw new Error('invalid_edit');
    if(c.op==='clear'&&!['time','duration','mood','energy','purpose','alert'].includes(c.field))throw new Error('invalid_edit');
    if(c.op==='clear'&&c.value!==null)throw new Error('invalid_edit');
    if(c.field==='status'&&c.value!==null&&!['done','active','cancelled'].includes(c.value))throw new Error('invalid_edit');
    if(c.field==='alert'&&c.value!==null&&!['alarm','reminder','off'].includes(c.value))throw new Error('invalid_edit');
  }
  const id=edit.target?.match(/^(?:#|(?:entry|plan|check-?in)\s*#?)(\d+)$/i)?.[1];
  if(id&&!new RegExp(`(?:#|\\bentry\\s*#?|\\bplan\\s*#?|\\bcheck-?in\\s*#?)${id}\\b`,'i').test(edit.targetEvidence??''))throw new Error('invalid_evidence');
  return structuredClone(edit);
}

// Used only when the API fails: a possible edit must not become a new alarm.
export const looksLikeEdit=text=>/^(?:(?:actually|please|can you|could you|would you|hey)[,\s]*)*(?:move|shift|reschedule|postpone|push back|bring .+ (?:forward|earlier)|change|update|rename|mark|cancel|undo|disable|turn off|use (?:an? |the )?(?:reminder|alarm)|remove (?:the|that|its)|make (?:it|that|this|the)|set (?:its|the duration|the purpose))\b/i.test(text.trim());
const words=text=>(text??'').toLowerCase().replace(/\bmom|\bmother/g,'mum').match(/[\p{L}\p{N}]+/gu)??[];
const stop=new Set(['the','a','an','my','that','this','it','its','one','entry','plan','task','check','in','please','with','for','latest','last','most','recent','that','woh','wo','us']);
const root=word=>word.replace(/(?:ing|ed|es|s)$/,'').replace(/(.)\1$/,'$1');
function eligible(e,edit){
  if(edit.changes.some(c=>['time','alert','status'].includes(c.field)))return e.kind==='plan';
  if(edit.changes.some(c=>['mood','energy'].includes(c.field)))return e.kind==='checkin';
  return true;
}
export function editTargets(edit,entries,selectedId,now=new Date()){
  const reference=/^(?:it|this|that|this one|that one|selected|the selected entry|latest|last one|the last one)$/i;
  let target=edit.target?.trim();
  // A missing model target must not erase a named reference such as "that meeting".
  if((!target||reference.test(target))&&edit.targetEvidence?.trim())target=edit.targetEvidence.trim();
  if(!target||reference.test(target))return entries.filter(e=>e.id===selectedId);
  const id=target.match(/^(?:#|(?:entry|plan|check-?in)\s*#?)(\d+)$/i)?.[1];
  if(id)return entries.filter(e=>e.id===Number(id));
  const day=target.match(/\b(?:day after tomorrow|tomorrow|today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)?.[0];
  const wantedDay=day?interpretTime(day,now).plannedDate:null;
  const needles=words(day?target.replace(day,''):target).filter(t=>!stop.has(t)&&!['reminder','alarm'].includes(t));
  if(!needles.length&&!wantedDay){
    if(/\b(?:reminder|alarm)\b/.test(target))return entries.filter(e=>eligible(e,edit)&&target.includes(e.alert?.type??e.alertIntent?.type??'__none__'));
    return entries.filter(e=>e.id===selectedId);
  }
  const pool=entries.filter(e=>eligible(e,edit)&&(!wantedDay||e.plannedDate===wantedDay));
  const exact=pool.filter(e=>needles.every(n=>words(e.title).includes(n)));
  let matches=exact.length?exact:pool.filter(e=>needles.every(n=>words(e.title).some(w=>root(w)===root(n))));
  // Prefer active plans for a reschedule unless a specific ID was requested.
  if(edit.changes.some(c=>['time','alert'].includes(c.field))&&matches.some(e=>!e.done))matches=matches.filter(e=>!e.done);
  if(/\b(?:latest|last|most recent)\b/i.test(target)&&matches.length)matches=[matches.reduce((a,b)=>a.id>b.id?a:b)];
  return matches;
}

export function editDuration(value){
  if(!value)return null;
  let normalized=value.toLowerCase().trim().replace(/\bhalf an? hour\b/g,'30 minutes').replace(/\b(?:an?|one) hour\b/g,'1 hour');
  if(/^\d+$/.test(normalized))normalized+=' minutes';
  else if(/^(?:ten|fifteen|twenty|thirty|forty[- ]five|sixty)$/.test(normalized))normalized+=' minutes';
  // Reject multiple duration components instead of silently retaining the first.
  if((normalized.match(/\b(?:minutes?|mins?|hours?|hrs?)\b/g)??[]).length>1)return null;
  return durationFromText('for '+normalized);
}

function shiftedTime(value,planned){
  if(!planned||!value)return null;
  const direction=/\b(?:earlier|before)\b|^\s*-/.test(value)?-1:/\b(?:later|after)\b|^\s*\+/.test(value)?1:null;
  if(direction===null)return null;
  const clean=value.replace(/\b(?:earlier|later|before|after)\b|^[+-]/g,'').trim();
  const amount=editDuration(clean);
  if(amount===null)return null;
  return new Date(new Date(planned).getTime()+direction*amount*60000);
}

/** The local context of a clock edit. Keep a requested hour across short replies. */
export function editTimeContext(entry,change,now){
  if(!change||change.field!=='time'||change.op!=='set')return null;
  const sources=[change.value,...change.evidence].filter(Boolean);
  const dayWords=[...new Set(sources.join(' ').match(/\b(?:day after tomorrow|tomorrow|today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi)??[])];
  const days=[...new Set(dayWords.map(s=>interpretTime(s,now).plannedDate).filter(Boolean))];
  if(days.length>1)return null;
  const day=days[0]??entry.plannedDate;if(!day)return null;
  const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
  let clock;
  for(const source of sources.toReversed()){
    if(/\b(?:or|earlier|later)\b|\d\s*[-–]\s*\d/i.test(source))continue;
    const match=source.toLowerCase().match(/(?:^|\bat\s+|\bto\s+|\bit\s+|\bthat\s+|\bthis\s+)(\d{1,2}(?::[0-5]\d)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)([a-z.]*)\b/);
    if(!match)continue;
    const [h,m='0']=match[1].split(':');const hour=numbers[h]??Number(h);
    if(hour>23)continue;
    const suffix=match[2].replaceAll('.','');
    const period=['am','pm'].includes(suffix)?suffix:/\b(?:morning|afternoon|evening|night)\b/.exec(source.toLowerCase())?.[0];
    clock={hour,minute:Number(m),period:period==='morning'?'am':['afternoon','evening','night'].includes(period)?'pm':period,typo:Boolean(suffix&&!['am','pm','a','p'].includes(suffix))};break;
  }
  if(!clock)return null;
  const periods=clock.hour>12||clock.hour===0?[null]:clock.period?[clock.period]:['am','pm'];
  const options=periods.map(period=>interpretTime(`${day} at ${clock.hour}:${String(clock.minute).padStart(2,'0')}${period??''}`,now)).filter(p=>p.planned).map(p=>({at:p.planned,label:formatTime(p.planned)}));
  const latest=sources.at(-1)??'';
  const same=/\bsame\b/i.test(latest)&&! /\b(?:not|different|another)\b/i.test(latest);
  const old=entry.planned?new Date(entry.planned):null;
  const selected=same&&old?(clock.period||clock.hour>12||clock.hour===0?options[0]:options.find(o=>(new Date(o.at).getHours()<12)===(old.getHours()<12))):null;
  return {options,sameAt:selected?.at??null,day,typo:clock.typo};
}

/** Build an allowlisted patch; the caller commits it only when every value resolves. */
export function editPatch(entry,edit,now){
  edit=structuredClone(edit);
  for(const change of edit.changes){
    const context=editTimeContext(entry,change,now);
    if(context?.sameAt){
      change.value=context.sameAt;
      if(!edit.changes.some(c=>c.field!=='time'&&c.op!=='clear'&&!c.value))edit.clarification=null;
    }
  }
  const patch={};
  const need=(index,prompt)=>({need:{index,field:edit.changes[index].field,prompt}});
  if(edit.clarification){
    const missing=edit.changes.findIndex(c=>c.op!=='clear'&&!c.value);
    const time=edit.changes.findIndex(c=>c.field==='time');
    return need(missing>=0?missing:time>=0?time:0,edit.clarification);
  }
  for(const [index,c] of edit.changes.entries()){
    if(['time','alert','status'].includes(c.field)&&entry.kind!=='plan')return {error:'That action needs a plan. This entry is a check-in.'};
    if(['mood','energy'].includes(c.field)&&entry.kind!=='checkin')return {error:'Mood and energy belong to check-ins. Choose a check-in.'};
    if(c.op!=='clear'&&!c.value?.trim())return need(index,`What ${c.field==='time'?'day and time':c.field} should I use?`);
    if(c.field==='time'){
      if(c.op==='clear'){Object.assign(patch,{planned:null,plannedDate:null,interpretation:{source:'edit',status:'none',assumptions:[],planned:null,plannedDate:null}});continue;}
      if(c.op==='shift'){
        const date=shiftedTime(c.value,entry.planned);
        if(!date||date<=now)return need(index,entry.planned?'What future day and time should I move it to?':'This entry has no clock time yet. What day and time should I use?');
        Object.assign(patch,{planned:date.toISOString(),plannedDate:localDate(date),interpretation:{source:'edit',status:'parsed',assumptions:[],planned:date.toISOString(),plannedDate:localDate(date),shiftFrom:entry.planned,shiftText:c.value}});
        continue;
      }
      let parsed=interpretTime(c.value,now);
      if(parsed.assumptions.some(a=>a.startsWith("AM/PM wasn't specified")))return need(index,'AM or PM? Include the day if it is changing.');
      if(parsed.status==='date_only'&&/\b(?:morning|afternoon|evening|night|lunch)\b/i.test(c.value))return need(index,'What time? For example, 7pm.');
      if(parsed.assumptions.includes('No day specified; using the next occurrence.')&&entry.plannedDate)parsed=interpretTime(entry.plannedDate+' '+c.value,now);
      else if(parsed.status==='date_only'&&entry.planned){
        const old=new Date(entry.planned);
        parsed=interpretTime(parsed.plannedDate+' at '+String(old.getHours()).padStart(2,'0')+':'+String(old.getMinutes()).padStart(2,'0'),now);
      }
      if(!parsed.planned&&parsed.status!=='date_only')return need(index,parsed.reason||'What day and time should I use?');
      Object.assign(patch,{planned:parsed.planned,plannedDate:parsed.plannedDate,interpretation:{...parsed,source:'edit',choiceText:c.value}});
    }else if(c.field==='duration'){
      const value=c.op==='clear'?null:editDuration(c.value);
      if(value===null&&c.op!=='clear')return need(index,'How many minutes? You can write 20 minutes or one hour.');
      Object.assign(patch,{minutes:value,durationSource:value===null?'unknown':'user_words'});
    }else if(c.field==='alert'){
      const type=c.op==='clear'||c.value==='off'?null:c.value;
      if(type!==null&&!['alarm','reminder'].includes(type))return need(index,'Alarm, reminder, or off?');
      patch.alertIntent={type,reason:'Changed by your request.'};
    }else if(c.field==='status'){
      if(!['done','active','cancelled'].includes(c.value))return need(index,'Done, active, or cancelled?');
      Object.assign(patch,{done:c.value!=='active',state:c.value==='done'?'completed':c.value});
    }else if(c.field==='title'){
      if(!c.value?.trim()||c.value.length>300)return need(index,'What short title should I use?');
      patch.title=c.value;
    }else patch[c.field]=c.op==='clear'?(c.field==='purpose'?'':null):c.value;
  }
  const changedTime=Object.hasOwn(patch,'planned');
  const changedAlert=Object.hasOwn(patch,'alertIntent');
  if(changedTime||changedAlert||Object.hasOwn(patch,'done')){
    const effective={...entry,...patch};
    const type=effective.alertIntent?.type??(effective.alertIntent?null:effective.alert?.type);
    patch.alert=!effective.done&&effective.planned&&type?scheduledAlert(type,effective.planned,now):null;
    if(changedAlert&&!effective.done&&!effective.planned&&type){
      return {need:{index:edit.changes.length,field:'time',prompt:'What day and time should this alert be for?'}};
    }
  }
  return {patch};
}
