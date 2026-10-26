export const matchesWords=(title,words)=>(words??[]).every(word=>{
 const tokens=String(title??'').toLowerCase().normalize('NFKC').replace(/\bkm\b/g,'kilometres').match(/[\p{L}\p{N}]+/gu)??[];
 return String(word).toLowerCase().split(/\s+/).every(w=>tokens.some(t=>t===w||(w.length>=3&&t===w+'s')||(w.length>=4&&t.startsWith(w))));
});

export function entities(data){
 return [
  ...(data.entries??[]).filter(e=>(e.kind??'plan')==='plan').map(e=>({...e,entity:'task'})),
  ...Object.entries({block:'blocks',project:'projects',goal:'goals',area:'areas'}).flatMap(([entity,key])=>(data.planner?.[key]??[]).map(e=>({...e,entity}))),
 ];
}
const key=e=>`${e.entity}:${e.id}`;
const active=e=>!e.archived&&e.state!=='cancelled';
const matchesItem=(title,item)=>[item.words,...(item.wordAlternatives??[])].some(words=>matchesWords(title,words));
const local=value=>{
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
};
const signature=e=>JSON.stringify({...Object.fromEntries(['title','purpose','notes','planned','plannedDate','minutes','must','archived','done','state','blockId','projectId','goalId','areaId','recurrence','repeatAfterDays'].map(k=>[k,e[k]??null])),alert:e.alertIntent?.type??e.alert??null});
const draftRows=draft=>(draft?.operations??[]).filter(o=>o.kind==='create').map(o=>({id:o.opId,entity:o.entity,...Object.fromEntries(o.fields.filter(f=>f.op==='set').map(f=>[f.name,f.value])),proposal:true}));

export function checkExpectation(expect,{before,after,draft,focusDraft=draft,questions=[],reply=''}){
 const failures=[];const fail=(type,detail)=>failures.push({type,detail});
 const previous=new Map(entities(before).map(e=>[key(e),e]));
 const savedNew=entities(after).filter(e=>!previous.has(key(e))&&active(e));
 const pending=Object.values(after.intentV2?.drafts??{}).filter(d=>['draft','review'].includes(d.status)&&
  (d.id===draft?.id||JSON.stringify(before.intentV2?.drafts?.[d.id])!==JSON.stringify(d))).flatMap(draftRows);
 if(!after.intentV2&&draft&&['draft','review'].includes(draft.status))pending.push(...draftRows(draft));
 const created=expect.scope==='draft'?pending:savedNew;
 const required=expect.created??[];
 const used=new Set();
 for(const item of required){
  const candidates=created.filter(e=>(!item.entity||e.entity===item.entity)&&matchesItem(e.title,item));
  const match=candidates.find(e=>item.allowShared||!used.has(key(e)));
  if(!match){if(!item.optional)fail('lost item',`Missing ${item.entity??'item'} title containing ${item.words.join(' + ')} in ${expect.scope??'saved'} state`);continue;}
  used.add(key(match));
  checkFields(item,match,fail,after);
 }
 for(const row of created)if(!required.some(item=>(!item.entity||row.entity===item.entity)&&matchesItem(row.title,item))){
  if(!(expect.allowNote&&row.entity==='task'&&row.kind==='note'))fail('invented item',`${row.entity} ${row.title}`);
 }
 if(created.length>(expect.maxNew??0))fail('invented item',`${created.length} new items exceeds ${expect.maxNew??0}`);
 for(const words of expect.forbidden??[])for(const row of [...savedNew,...pending])if(matchesWords(row.title,words))fail('retraction ignored',`Retracted title survives: ${row.title}`);
 for(const expected of expect.changes??[]){
  const entity=expected.entity??'task',row=entities(after).find(e=>e.entity===entity&&String(e.id)===String(expected.id));
  if(expected.optional)continue;
  if(!row){fail('lost item',`Saved ${entity} ${expected.id} disappeared`);continue;}
  if(expected.kind==='archive'&&active(row))fail('focus lost',`${row.title} was not archived`);
  if(expected.kind==='complete'&&!row.done)fail('lost item',`${row.title} was not completed`);
  if(expected.kind==='update'&&signature(row)===signature(previous.get(key(row))??{}))fail('lost item',`${row.title} was not updated`);
  checkFields(expected,row,fail,after);
 }
 const allowedChanges=new Set((expect.changes??[]).map(e=>`${e.entity??'task'}:${e.id}`));
 for(const row of entities(after)){
  const old=previous.get(key(row));
  if(old&&signature(old)!==signature(row)&&!allowedChanges.has(key(row)))fail('invented item',`Unrequested change to ${row.title} (${key(row)})`);
 }
 for(const [id,old] of previous)if(!entities(after).some(e=>key(e)===id)&&!allowedChanges.has(id))fail('invented item',`Unrequested removal of ${old.title} (${id})`);
 const stableTasks=entities(before).filter(e=>e.entity==='task'&&active(e)&&!allowedChanges.has(key(e)));
 for(const block of new Set(stableTasks.map(e=>e.blockId??null))){
  const old=stableTasks.filter(e=>(e.blockId??null)===block);
  const sort=rows=>[...rows].sort((a,b)=>(a.priority??Infinity)-(b.priority??Infinity)||a.id-b.id).map(e=>e.id);
  const now=entities(after).filter(e=>e.entity==='task'&&old.some(o=>o.id===e.id));
  if(now.length===old.length&&JSON.stringify(sort(now))!==JSON.stringify(sort(old)))fail('invented item',`Unrequested reorder of saved tasks in ${block??'Inbox'}`);
 }
 for(const id of expect.unchanged??[]){
  const row=entities(after).find(e=>e.entity==='task'&&String(e.id)===String(id));
  if(!row||signature(row)!==signature(previous.get(`task:${id}`)??{}))fail('focus lost',`Task ${id} should stay unchanged`);
 }
 for(const opId of expect.focusRemoved??[])if(!focusDraft||['draft','review'].includes(focusDraft.status)&&focusDraft.operations.some(o=>o.opId===opId))fail('focus lost',`Focused proposal ${opId} was not removed from the effective draft`);
 for(const opId of expect.focusRetained??[])if(!focusDraft||!['draft','review'].includes(focusDraft.status)||!focusDraft.operations.some(o=>o.opId===opId))fail('focus lost',`Focused proposal ${opId} should remain in the effective draft`);
 if(expect.focusRemoved){
  const original=before.intentV2?.drafts?.[focusDraft?.id??draft?.id??'draft-dinner'];
  if(original){
   const wanted=original.operations.filter(o=>!expect.focusRemoved.includes(o.opId));
   const current=focusDraft&&['draft','review'].includes(focusDraft.status)?focusDraft.operations:[];
   const content=o=>JSON.stringify({kind:o.kind,entity:o.entity,targetId:o.targetId,fields:[...o.fields].map(f=>({name:f.name,op:f.op,value:f.value})).sort((a,b)=>a.name.localeCompare(b.name))});
   for(const op of wanted)if(!current.some(c=>c.opId===op.opId&&content(c)===content(op)))fail('focus lost',`Focused proposal ${op.opId} was not preserved unchanged`);
   for(const op of current)if(!original.operations.some(o=>o.opId===op.opId))fail('invented item',`Unrequested focused proposal ${op.opId}`);
  }
 }
 if(expect.replyWords&&!expect.replyWords.some(w=>matchesWords(reply,[w])))fail('lost item',`Reply does not mention ${expect.replyWords.join(' or ')}`);
 for(const w of expect.replyForbidden??[])if(matchesWords(reply,[w]))fail('false claim',`Reply says ${w}`);
 for(const item of expect.anyTask??[]){
  const hit=entities(after).some(e=>e.entity==='task'&&active(e)&&matchesWords(e.title,item.words)&&(item.day===undefined||(local(e.planned)?.day??e.plannedDate??null)===item.day));
  if(!hit)fail('lost item',`No active task with ${item.words.join(' + ')}${item.day?' on '+item.day:''}`);
 }
 const questionCount=questions.length;
 if(expect.question==='forbidden'&&questionCount)fail('repeated question','A question was asked when no clarification was allowed');
 if(expect.question==='required'&&!questionCount)fail('lost item','Expected a clarification question');
 if(expect.health){
  const water=d=>(d.planner?.body?.water?.glasses??[]).length;
  if(expect.health.waterDelta!==undefined&&water(after)-water(before)!==expect.health.waterDelta)fail('lost item',`Water delta ${water(after)-water(before)} instead of ${expect.health.waterDelta}`);
  for(const meal of expect.health.meals??[])if(!after.planner?.body?.meals?.some(m=>m.slot===meal.slot&&(m.state??'logged')===meal.state&&matchesWords(m.name,meal.foodWords??[])))fail('lost item',`No ${meal.state} ${meal.slot} recorded with the stated food`);
  if(expect.health.mealSkipped&&!after.planner?.body?.meals?.some(m=>m.slot===expect.health.mealSkipped&&m.state==='skipped'))fail('lost item',`No skipped ${expect.health.mealSkipped} recorded`);
 }
 return failures;
}

function checkFields(expected,row,fail,after){
 const stamp=local(row.planned),day=stamp?.day??row.plannedDate??null,time=stamp?.time??null;
 if(expected.title!==undefined&&row.title!==expected.title)fail('wrong title',`${row.title}: expected exact title ${expected.title}`);
 if(expected.day!==undefined&&day!==expected.day)fail('wrong time',`${row.title}: day ${day}, expected ${expected.day}`);
 if(expected.time!==undefined&&time!==expected.time)fail('wrong time',`${row.title}: time ${time}, expected ${expected.time}`);
 if(expected.scheduled!==undefined&&!!(row.planned||row.plannedDate)!==expected.scheduled)fail('wrong time',`${row.title}: scheduled should be ${expected.scheduled}`);
 if(expected.done!==undefined&&!!row.done!==expected.done)fail('lost item',`${row.title}: done should be ${expected.done}`);
 if(expected.must!==undefined&&!!row.must!==expected.must)fail('lost item',`${row.title}: must should be ${expected.must}`);
 if(expected.titleWords&&!matchesWords(row.title,expected.titleWords))fail('lost item',`${row.title}: expected title ${expected.titleWords.join(' + ')}`);
 if(expected.purposeWords&&!matchesWords(row.purpose,expected.purposeWords))fail('lost item',`${row.title}: purpose missing ${expected.purposeWords.join(' + ')}`);
 const alert=row.alertIntent?.type??row.alert??null;
 if(expected.alert!==undefined&&alert!==expected.alert)fail('lost item',`${row.title}: alert ${alert}, expected ${expected.alert}`);
 if(expected.minutes!==undefined&&row.minutes!==expected.minutes)fail('wrong time',`${row.title}: duration ${row.minutes}, expected ${expected.minutes}`);
 if(expected.priority!==undefined&&row.priority!==expected.priority)fail('lost item',`${row.title}: priority ${row.priority}, expected ${expected.priority}`);
 if(expected.blockWords&&!matchesWords(after.planner?.blocks?.find(b=>b.id===row.blockId)?.title,expected.blockWords))fail('lost item',`${row.title}: not filed under the requested Result ${expected.blockWords.join(' + ')}`);
}

export function visibleQuestions(turn){
 if(turn.capture?.clarification?.prompt)return [turn.capture.clarification.prompt.trim().toLowerCase()];
 const pending=turn.draft&&['draft','review'].includes(turn.draft.status);
 const texts=pending?[turn.draft.question?.prompt,turn.draft.review?.question]:[];
 const reply=turn.draft?.reply??turn.capture?.reply??'';
 texts.push(...(reply.match(/[^.!?]*\?/g)??[]).map(t=>t.trim()));
 return [...new Set(texts.filter(Boolean).map(t=>t.trim().toLowerCase()))];
}

export function checkExecution(turns,{validate,schema}){
 const failures=[];const fail=(type,detail)=>failures.push({type,detail});
 let previousQuestion=null,previousDraft=null;
 for(const [i,t] of turns.entries()){
  const label=`Turn ${i+1}`;
  if(t.capture?.raw!==t.text||t.allRawRetained===false)fail('words lost',`${label}: exact raw words not retained`);
  if(t.exception)fail('crash',`${label}: ${t.exception}`);
  if(t.result?.status==='captured'&&t.result?.error)fail('interpretation rejected',`${label}: ${t.result.code??'error'} ${t.result.error}`);
  for(const call of t.calls??[]){
   if(call.output){try{validate(call.output,schema);}catch{fail('invalid schema',`${label}: model response fails target schema`);}}
   else fail('transport error',`${label}: ${call.error??call.record?.error??'no model output'}`);
   if(call.savedBeforeModel===false)fail('words lost',`${label}: model ran before raw capture was durable`);
  }
  const errors=[t.result?.error,t.capture?.lastError?.message,...(t.trace?.errors??[]).map(e=>e.message),t.exception].filter(Boolean);
  if(errors.some(e=>/TypeError:|SyntaxError:|ReferenceError:|Cannot read properties|is not a function|\bat \w+.*:\d+:\d+/i.test(e)))fail('unsafe error',`${label}: raw script fault shown`);
  if(t.result?.applied?.status==='failed')fail('apply failed',`${label}: planner rejected the draft`);
  const qs=visibleQuestions(t);
  if(qs.length>1)fail('repeated question',`${label}: ${qs.length} questions shown`);
  if(qs.length&&!t.capture?.clarification&&qs[0]===previousQuestion&&t.draft?.id===previousDraft)fail('repeated question',`${label}: same question repeated on the same draft`);
  previousQuestion=qs[0]??null;previousDraft=t.draft?.id??null;
 }
 return failures;
}

const CLAIM=/(?<!\bnot )(?<!n['’]t )(?<!\bnothing )(?<!\bno )\b(saved|added|scheduled|created|archived|removed|deleted|cleared|completed|marked|renamed|moved|rescheduled)\b/i;
const stored=data=>JSON.stringify([data.entries??[],data.planner??{},data.intentV2?.drafts??{}]);

// Heuristic: a past-tense claim of change in the reply while entries and planner are identical.
export function checkClaims(reply,{before,after,pending=false}){
 const text=String(reply??'').replace(/\bis (?:already )?saved\b/gi,'is on the list').replace(/\byour (?:original )?words are saved\b/gi,'your words are kept').replace(/\b(your|the|these|those) saved (tasks?|items?|records?)\b/gi,'$1 existing $2').replace(/\bnothing (?:(?:will|would) be|(?:is|was)(?: being)?|(?:has|had) been) \w+/gi,'');
 const claim=text.match(CLAIM);
 if(!claim||pending||stored(before)!==stored(after))return [];
 return [{type:'false claim',detail:`Reply says "${claim[0]}" but nothing saved changed: ${text.slice(0,120)}`}];
}
