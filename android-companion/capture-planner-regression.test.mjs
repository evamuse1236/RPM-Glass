import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionAgent,MODEL} from '../chat-prototype/companion-agent.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {phoneProposal} from './planner-chat.mjs';
import {plannerInstruction,createPlannerTools} from './planner-tools.mjs';
test('malformed multi-call replies are repaired without executing a partial transaction',async()=>{const data=freshStore();let count=0;const call={id:'one',type:'function',function:{name:'respond',arguments:JSON.stringify({message:'No changes requested.',suggestions:[]})}};const agent=createCompanionAgent({apiKey:'fixture',fetchImpl:async(_,o)=>{assert.equal(JSON.parse(o.body).parallel_tool_calls,undefined);return {ok:true,json:async()=>({model:MODEL,choices:[{finish_reason:'tool_calls',message:{tool_calls:++count===1?[call,{...call,id:'two'}]:[call]}}]})};}});const r=await agent(data,'Hello',{conversationId:data.conversations[0].id});assert.equal(r.error,undefined);assert.equal(count,2);assert.equal(data.entries.length,0);});
test('parallel planner reads can precede one atomic change',async()=>{const d=freshStore();let requests=0,reads=0;const read={name:'read_planner',schema:{type:'object',properties:{},required:[],additionalProperties:false},run:()=>{reads++;return {items:[]};}},call=id=>({id,type:'function',function:{name:'read_planner',arguments:'{}'}});const agent=createCompanionAgent({apiKey:'fixture',appTools:[read],fetchImpl:async()=>({ok:true,json:async()=>({model:MODEL,choices:[{finish_reason:'tool_calls',message:{tool_calls:++requests===1?[call('a'),call('b')]:[{id:'c',type:'function',function:{name:'respond',arguments:JSON.stringify({message:'Read the current plans.',suggestions:[]})}}]}}]})})});const r=await agent(d,'What is planned?',{conversationId:d.conversations[0].id});assert.equal(r.error,undefined);assert.equal(reads,2);assert.equal(requests,2);assert.equal(d.entries.length,0);});

test('capture executes app planning tools instead of claiming an unsupported block edit',async()=>{
 const data=freshStore();
 const tool={name:'change_planner',description:'Make a planning change',schema:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false},terminal:true,
  run:(d,args)=>{const id=editPlan(d,{type:'saveEntity',collection:'blocks',fields:{title:args.title}});return {text:'Created RPM block.',blockId:id};}};
 const agent=createCompanionAgent({apiKey:'fixture',platform:'android',appTools:[tool],fetchImpl:async()=>({ok:true,json:async()=>({model:MODEL,choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'call1',type:'function',function:{name:'change_planner',arguments:JSON.stringify({title:'Prepare for the exam'})}}]}}]})})});
 const result=await agent(data,'Make an RPM block: prepare for the exam.',{conversationId:data.conversations[0].id});
 assert.equal(result.error,undefined);assert.equal(data.planner?.blocks[0]?.title,'Prepare for the exam');
});

test('upgrading keeps an unfinished legacy capture proposal continuable with planner tools present',async()=>{
 const data=freshStore(),now=new Date(2026,8,12,8),conversationId=data.conversations[0].id,readCalendar=async()=>({status:'not_selected',events:[]});
 const operations=[{type:'create',collection:'entries',id:null,fields:{title:'Walk',kind:'plan',time:null},evidence:['Walk at 10']}];
 await phoneProposal(data,{operations,continuation:false,question:'10 AM or 10 PM?',choices:[{label:'AM',text:'10am'},{label:'PM',text:'10pm'}]},{raw:'Walk at 10',now,conversationId},readCalendar);
 assert.equal(data.pending.kind,undefined);assert.equal(data.entries.length,0);
 const args={operations:[{...operations[0],fields:{...operations[0].fields,time:'10am'}}],continuation:true,question:null,choices:[]};
 const agent=createCompanionAgent({apiKey:'fixture',platform:'android',appTools:createPlannerTools({readCalendar}),appInstruction:plannerInstruction,proposeImpl:(d,a,m)=>phoneProposal(d,a,m,readCalendar),fetchImpl:async(_,options)=>{
   const body=JSON.parse(options.body);assert.match(body.messages[0].content,/legacy pending proposal with no kind field/);assert.ok(body.tools.some(t=>t.function.name==='change_planner'));
   return {ok:true,json:async()=>({model:MODEL,choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'legacy',type:'function',function:{name:'propose_changes',arguments:JSON.stringify(args)}}]}}]})};
 }});
 const result=await agent(data,'10am',{now,conversationId});assert.equal(result.error,undefined);assert.equal(data.pending,null);assert.equal(data.entries.length,1);assert.equal(data.entries[0].title,'Walk');assert.equal(new Date(data.entries[0].planned).getHours(),10);
});
