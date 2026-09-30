import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {planner,editPlan} from '../../android-companion/planner-state.mjs';
import {changePlanner,changePlannerSchema} from '../../android-companion/planner-tools.mjs';
import {refreshSchedulePreview} from '../../android-companion/intent-service.mjs';
import {buildContext,sourceUnits} from '../src/context.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {structuredRequest,readStructuredResponse} from '../adapters/transport.mjs';
import {intentSystemPrompt} from '../prompts/intent-system.mjs';
import {validate} from '../../chat-prototype/companion-tools.mjs';
export const reference=new Date('2026-09-16T04:00:00.000Z');
export const configurations=[{model:'openai/gpt-5.6-luna',effort:'medium'},...['none','low','medium','high','xhigh','max'].map(effort=>({model:'openai/gpt-6-luna',effort}))];
export const cases=[
 {id:'range',text:'Finish one WID assessment tomorrow from 2 pm to 3 pm.'},
 {id:'ambiguous',text:'Read tomorrow from 2 to 3.'},
 {id:'compound',text:'Buy milk and print the worksheets. No reminders or times.'},
 {id:'correction',text:'Move Read chapter to 6am; keep its duration.'},
 {id:'negation',text:'I already finished the WID assessment. Do not create a new task or schedule anything.'},
 {id:'hierarchy',text:'Create a project called Study, a block called Explain WID concepts with purpose Contribute clearly in class, and a task called Read WID chapter in that block tomorrow from 2pm to 3pm.'},
 {id:'tool',text:'Create one task called Buy milk. No time or alarm.'}
];
export function fixture(c){
 const data=freshStore();data.conversations[0].id='eval';planner(data);
 if(c.id==='correction'){editPlan(data,{type:'saveTask',fields:{title:'Read chapter',planned:'2026-09-20T15:30:00.000Z',minutes:45}},reference);data.entries[0].id=7;data.planner.undo=null;data.undo=null;}
 const units=sourceUnits(c.text),context=buildContext(data,{raw:c.text,conversationId:'eval',now:reference});context.timezone='Asia/Kolkata';
 return {data,units,context,input:{messageId:c.id,sourceUnits:units,context,activeDraft:null,repair:null}};
}
export function requestFor(c,config){
 const {input}=fixture(c),provider={require_parameters:true,allow_fallbacks:false,only:['openai'],order:['openai']};
 const body=c.id==='tool'?{model:config.model,messages:[{role:'system',content:'Use change_planner to propose only the requested change. Do not claim it was saved. Every operation needs exact evidence from the user message. New IDs are null. Use only the supplied schema. Do not invent optional task fields.'},{role:'user',content:c.text}],tools:[{type:'function',function:{name:'change_planner',description:'Propose an RPM planner change for review.',parameters:changePlannerSchema,strict:false}}],tool_choice:'required',max_tokens:3500,provider}:structuredRequest({model:config.model,prompt:intentSystemPrompt,input,providerNames:['openai']});
 body.provider=provider;body.reasoning={effort:config.effort,exclude:true};return body;
}
export async function assess(c,body){
 const failures=[],check=(yes,message)=>{if(!yes)failures.push(message);},choice=body.choices?.[0];
 if(c.id==='tool'){
  check(choice?.finish_reason==='tool_calls','Expected a complete tool call');const calls=choice?.message?.tool_calls??[];check(calls.length===1,'Expected one tool call');
  if(calls.length===1){check(calls[0].function?.name==='change_planner','Wrong tool');const args=JSON.parse(calls[0].function.arguments);validate(args,changePlannerSchema);const op=args.operations[0];check(args.operations.length===1&&op?.type==='create'&&op.collection==='tasks'&&op.id===null,'Wrong tool operation');check(op?.fields?.title==='Buy milk','Wrong tool title');check(!op?.fields?.time&&!["alarm","reminder"].includes(op?.fields?.alert),'Invented time or alert');check(op?.evidence?.length>0&&op.evidence.every(e=>c.text.includes(e)),'Invented tool evidence');
   try{const {data}=fixture(c);await changePlanner(data,args,{raw:c.text,conversationId:'eval',now:reference},async()=>({status:'not_selected',events:[]}));check(data.entries.length===1&&!data.pending,'Tool did not produce the requested task');}catch(e){failures.push('Planner rejected tool: '+e.message);}}
  return {failures,answer:choice?.message?.tool_calls??null};
 }
 const {data,units,context}=fixture(c),answer=readStructuredResponse(body),parsed=interpretTurn(answer,{units,messageId:c.id,visibleEntities:context.entities,activeDraft:null}),ops=parsed.operations,field=(o,n)=>o?.fields.find(f=>f.name===n);
 const preview=refreshSchedulePreview({data,draft:parsed,anchor:reference});
 if(c.id==='negation')check(ops.length===0,'Created a mutation from an explicit non-action');
 if(c.id==='compound'){check(ops.length===2&&ops.every(o=>o.kind==='create'&&o.entity==='task'),'Expected two tasks');check(ops.some(o=>/milk/i.test(field(o,'title')?.value??''))&&ops.some(o=>/worksheet/i.test(field(o,'title')?.value??'')),'Lost an action');check(ops.every(o=>!field(o,'time')&&!field(o,'minutes')&&!field(o,'purpose')),'Invented optional details');}
 if(c.id==='range'||c.id==='ambiguous'){check(ops.length===1&&ops[0].kind==='create'&&ops[0].entity==='task','Expected one new task');check(!!field(ops[0],'time'),'Lost scheduling phrase');}
 if(c.id==='range'||c.id==='hierarchy'){const p=preview.items[0];check(p?.planned==='2026-09-17T08:30:00.000Z'&&p?.end==='2026-09-17T09:30:00.000Z'&&p?.minutes===60,'Did not preserve the complete 2pm–3pm range');}
 if(c.id==='ambiguous'){check(!/\bpm\b/i.test(parsed.reply)||!!parsed.question||/\bwhich|whether|am or pm\b/i.test(parsed.reply),'Reply assumes PM despite an unresolved range');check(ops.some(o=>field(o,'time')?.op==='unknown')||preview.items.some(p=>p.status==='review'),'Guessed ambiguous AM/PM');}
 if(c.id==='correction'){check(ops.length===1&&ops[0].kind==='update'&&ops[0].targetId==='7','Wrong correction target');check(!field(ops[0],'minutes')||field(ops[0],'minutes').value===45,'Changed retained duration');check(preview.items[0]?.planned==='2026-09-20T00:30:00.000Z','Lost saved day or requested 6am');}
 if(c.id==='hierarchy'){check(ops.length===3&&['project','block','task'].every(e=>ops.some(o=>o.entity===e&&o.kind==='create')),'Lost hierarchy entity');const block=ops.find(o=>o.entity==='block'),task=ops.find(o=>o.entity==='task');check(!!field(block,'projectId')&&!!field(task,'blockId'),'Lost hierarchy link');check(field(block,'purpose')?.value==='Contribute clearly in class','Lost stated purpose');}
 check(parsed.memoryCandidates.length===0,'Invented durable memory');
 return {failures,answer,preview};
}
export function summarize(rows){
 const quantile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*xs.length)-1)]:null;
 return configurations.map(c=>{const group=rows.filter(r=>r.model===c.model&&r.effort===c.effort),costs=group.filter(r=>Number.isFinite(r.cost)),success=group.filter(r=>r.passed),capture=group.filter(r=>r.caseId!=='tool');return {...c,cases:group.length,passed:success.length,capturePassed:capture.filter(r=>r.passed).length,within12s:capture.filter(r=>r.passed&&r.ms<=12000).length,p50Ms:quantile(group.map(r=>r.ms),.5),maxMs:quantile(group.map(r=>r.ms),1),cost:costs.reduce((n,r)=>n+r.cost,0),costKnown:costs.length,costPerCorrect:costs.length===group.length&&success.length?costs.reduce((n,r)=>n+r.cost,0)/success.length:null,reasoningTokens:group.reduce((n,r)=>n+(r.reasoningTokens??0),0)};});
}
