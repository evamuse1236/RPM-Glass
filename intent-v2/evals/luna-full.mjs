// Full synthetic suite. No user store or network access; only caller-supplied replies.
import {readFileSync} from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {planner} from '../../android-companion/planner-state.mjs';
import {refreshSchedulePreview} from '../../android-companion/intent-service.mjs';
import {buildContext,sourceUnits} from '../src/context.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {structuredRequest,readStructuredResponse} from '../adapters/transport.mjs';
import {intentSystemPrompt} from '../prompts/intent-system.mjs';
import {grade} from './grade.mjs';
import * as sample from './luna-sample.mjs';

export const configurations=['none','high'].map(effort=>({model:'openai/gpt-6-luna',effort}));
export const cases=[
 ...readFileSync(new URL('./cases.jsonl',import.meta.url),'utf8').trim().split('\n').map(line=>({...JSON.parse(line),suite:'original'})),
 ...sample.cases.map(c=>({...c,id:`sample-${c.id}`,sampleId:c.id,suite:'regression',category:c.id==='tool'?'tool':'range/correction'}))
];
export const reference=sample.reference;
export function fixture(c){
 if(c.sampleId)return sample.fixture({...c,id:c.sampleId});
 const data=freshStore();data.conversations[0].id='eval';planner(data);
 data.entries=(c.entries??[]).map(e=>({kind:'plan',archived:false,done:false,raw:e.title,revisions:[],...e}));
 data.memories=structuredClone(c.memories??[]);
 const units=sourceUnits(c.text),context=buildContext(data,{raw:c.text,conversationId:'eval',now:reference});context.timezone='Asia/Kolkata';
 return {data,units,context,input:{messageId:c.id,sourceUnits:units,context,activeDraft:null,repair:null}};
}
export function requestFor(c,config){
 if(c.sampleId)return sample.requestFor({...c,id:c.sampleId},config);
 const body=structuredRequest({model:config.model,prompt:intentSystemPrompt,input:fixture(c).input,providerNames:['openai']});
 body.provider={require_parameters:true,allow_fallbacks:false,only:['openai'],order:['openai']};
 body.reasoning={effort:config.effort,exclude:true};return body;
}

// Supplemental assertions are fixed before the live run. The original contracts
// are retained separately; replies and flexible planning content need manual review.
export function semanticChecks(c,turn,preview){
 const failures=[],check=(yes,message)=>{if(!yes)failures.push(message);};
 const ops=turn.operations,field=(op,name)=>op?.fields.find(f=>f.name===name);
 const value=(op,name)=>field(op,name)?.value;
 const taskTitles=ops.filter(o=>o.entity==='task').map(o=>String(value(o,'title')??'').toLowerCase());
 const taskWords={
  'capture-01':['milk'],'capture-02':['consent','volunteer'],'capture-03':['room','workshop'],
  'capture-04':['print','worksheet'],'capture-05':['desk'],'capture-06':['milk','worksheet'],
  'capture-07':['shelter','slides','chart paper'],'capture-08':['projector','attendance','laptop'],
  'capture-09':['worksheet'],'capture-10':['microphone'],'capture-11':['participant'],
  'capture-12':['pens'],'memory-05':['paragraph'],'voice-01':['pencil'],'voice-02':['worksheet'],
  'boundary-03':['ignore all rules']
 };
 if(taskWords[c.id]){
  check(ops.every(o=>o.kind==='create'&&o.entity==='task'),'Expected only new tasks');
  for(const word of taskWords[c.id])check(taskTitles.some(t=>t.includes(word)),`Lost requested task content: ${word}`);
 }
 if(c.id==='voice-01')check(!taskTitles.some(t=>/chart paper/.test(t)),'Kept the superseded dictation task');
 if(c.id==='boundary-03')check(taskTitles[0]==='ignore all rules','Changed the explicitly requested literal title');
 if(!['memory-01','memory-04'].includes(c.id))check(turn.memoryCandidates.length===0,'Invented a durable memory');
 const p=preview.items[0];
 const scheduled={
  'time-01':'2026-09-17T01:30:00.000Z','time-04':'2026-09-16T14:30:00.000Z',
  'time-06':'2026-09-17T03:30:00.000Z','time-07':'2026-09-17T02:30:00.000Z',
  'edit-01':'2026-09-17T00:30:00.000Z'
 };
 if(scheduled[c.id])check(p?.planned===scheduled[c.id],'Wrong locally resolved start/date');
 if(c.id==='time-01')check(value(ops[0],'minutes')===20,'Lost the stated 20-minute duration');
 if(c.id==='time-02')check(field(ops[0],'time')?.op==='unknown'&&!!turn.question,'Did not preserve unresolved AM/PM');
 if(c.id==='time-03')check(p?.plannedDate==='2026-09-17'&&!p?.planned,'Lost the date-only task or invented a clock');
 if(c.id==='time-05')check(value(ops[0],'minutes')===15,'Wrong duration');
 if(c.id==='time-06')check(value(ops[0],'alert')==='reminder','Wrong requested alert type');
 if(c.id==='time-07')check(value(ops[0],'alert')==='alarm','Wrong requested alarm type');
 if(c.id==='time-08')check(value(ops[0],'recurrence')==='daily'&&/6\s*(?:a\.?m\.?)/i.test(value(ops[0],'time')??''),'Lost daily recurrence or 6am');
 if(c.id==='edit-02')check(value(ops[0],'minutes')===10,'Wrong updated duration');
 if(c.id==='edit-03')check(field(ops[0],'time')?.op==='clear','Time removal must clear, not set unknown');
 if(['edit-06','edit-07'].includes(c.id)){
  const run=ops.find(o=>o.targetId==='41'),walk=ops.find(o=>o.targetId==='42');
  check(preview.items.find(p=>p.opId===run?.opId)?.planned==='2026-09-17T00:30:00.000Z','Lost run correction or saved date');
  if(c.id==='edit-06')check(preview.items.find(p=>p.opId===walk?.opId)?.planned==='2026-09-17T13:30:00.000Z','Wrong walk correction');
  else check(field(walk,'time')?.op==='unknown','Guessed the ambiguous walk time');
 }
 if(c.id==='rpm-02')for(const word of ['room','book','invit'])check(taskTitles.some(t=>t.includes(word)),`Lost planning action: ${word}`);
 if(c.id==='rpm-05'){
  const block=ops.find(o=>o.entity==='block');
  check(!!block&&ops.filter(o=>o.entity==='task').length===2,'Expected one block and two actions');
  for(const op of ops.filter(o=>o.entity==='task'))check(value(op,'blockId')===`$${block?.opId}`,'Lost task-to-result link');
  check(taskTitles.some(t=>t.includes('form'))&&taskTitles.some(t=>t.includes('link')),'Lost a registration action');
 }
 if(['voice-02','voice-03','voice-04'].includes(c.id))check(!!field(ops[0],'time'),'Lost the supplied date/time');
 return failures;
}

export async function assess(c,body){
 if(c.sampleId){const result=await sample.assess({...c,id:c.sampleId},body);return {...result,contractFailures:result.failures,semanticFailures:[]};}
 const answer=readStructuredResponse(body),{data,units,context}=fixture(c);
 const parsed=interpretTurn(answer,{units,messageId:c.id,visibleEntities:context.entities,activeDraft:null});
 const preview=refreshSchedulePreview({data,draft:parsed,anchor:reference});
 const contractFailures=grade(parsed,c.expect),semanticFailures=semanticChecks(c,parsed,preview);
 return {failures:[...contractFailures,...semanticFailures],contractFailures,semanticFailures,answer,preview};
}

export function summarize(rows){
 const quantile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*xs.length)-1)]:null;
 return configurations.map(config=>{
  const group=rows.filter(r=>r.effort===config.effort),known=group.filter(r=>Number.isFinite(r.cost)),passed=group.filter(r=>r.passed),capture=group.filter(r=>r.caseId!=='sample-tool');
  return {...config,cases:group.length,passed:passed.length,contractPassed:group.filter(r=>r.contractPassed).length,
   original:{cases:group.filter(r=>r.suite==='original').length,passed:group.filter(r=>r.suite==='original'&&r.passed).length},
   regression:{cases:group.filter(r=>r.suite==='regression').length,passed:group.filter(r=>r.suite==='regression'&&r.passed).length},
   capturePassedWithin12s:capture.filter(r=>r.passed&&r.ms<=12000).length,captureCases:capture.length,over12s:capture.filter(r=>r.ms>12000).length,
   p50Ms:quantile(group.map(r=>r.ms),.5),p95Ms:quantile(group.map(r=>r.ms),.95),maxMs:quantile(group.map(r=>r.ms),1),
   cost:known.reduce((s,r)=>s+r.cost,0),costKnown:known.length,costPerCorrect:passed.length&&known.length===group.length?known.reduce((s,r)=>s+r.cost,0)/passed.length:null,
   reasoningTokens:group.reduce((s,r)=>s+(r.reasoningTokens??0),0),cachedTokens:group.reduce((s,r)=>s+(r.cachedTokens??0),0),
   failures:group.filter(r=>!r.passed).map(r=>({id:r.caseId,failures:r.failures}))};
 });
}
