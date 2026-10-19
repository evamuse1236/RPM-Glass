import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,stat,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {matchesWords,checkExpectation,checkExecution} from './checks.mjs';
import {parseOptions,loadCorpus} from './run.mjs';
import {targetModules,runCase} from './runtime.mjs';
import {TURN_SCHEMA,validate} from '../../intent-v2/src/schema.mjs';
import {usageTotals} from './cli.mjs';
import {summarize} from './report.mjs';
import {evaluateCase} from './evaluate.mjs';

const empty=()=>({entries:[],planner:{blocks:[],projects:[],goals:[],areas:[],body:{water:{glasses:[]},meals:[]}}});
const expectation=extra=>({created:[{words:['call','bank'],entity:'task',day:'2026-10-20',time:'18:00'}],forbidden:[],maxNew:1,question:'forbidden',changes:[],unchanged:[],...extra});
const bank=()=>({id:1,kind:'plan',title:'Calling the bank',planned:'2026-10-20T12:30:00Z'});
const compare=(extra,rows=[bank()])=>checkExpectation(expectation(extra),{before:empty(),after:{...empty(),entries:rows},questions:[]});

test('fuzzy title matching requires every token, permits word starts, and checks IST saved time',()=>{
 assert.equal(matchesWords('Calling the bank',['call','bank']),true);
 assert.equal(matchesWords('Recall a banker',['call','bank']),false);
 assert.deepEqual(compare({}),[]);
 assert.ok(compare({},[{...bank(),planned:'2026-10-19T12:30:00Z'}]).some(f=>f.type==='wrong time'));
});

test('known bad controls separate lost, invented, retracted, dates, purpose and must',()=>{
 assert.ok(compare({},[]).some(f=>f.type==='lost item'));
 assert.ok(compare({},[bank(),{...bank(),id:2,title:'Book flight'}]).some(f=>f.type==='invented item'));
 assert.ok(compare({forbidden:[['bank']]}).some(f=>f.type==='retraction ignored'));
 assert.ok(compare({created:[{words:['bank'],purposeWords:['refund'],must:true}]}).some(f=>f.detail.includes('purpose')));
 assert.deepEqual(compare({created:[{words:['bank'],must:false}]}),[]);
 assert.ok(compare({created:[{words:['bank'],time:null}]}).some(f=>f.type==='wrong time'));
});

test('a proposed title is not a saved task and omission is not focused removal',()=>{
 const draft={status:'draft',operations:[{opId:'dinner1',kind:'create',entity:'task',fields:[{name:'title',op:'set',value:'Call bank'}]}]};
 assert.ok(checkExpectation(expectation({}),{before:empty(),after:empty(),draft}).some(f=>f.type==='lost item'));
 const failures=checkExpectation(expectation({created:[],maxNew:0,focusRemoved:['dinner1']}),{before:empty(),after:empty(),draft});
 assert.ok(failures.some(f=>f.type==='focus lost'));
 assert.ok(checkExpectation(expectation({created:[],focusRemoved:['dinner1']}),{before:empty(),after:empty()}).some(f=>f.type==='focus lost'));
 assert.ok(checkExpectation(expectation({created:[],focusRemoved:['dinner1'],focusRetained:['dinner2']}),{before:empty(),after:empty(),draft:{status:'draft',operations:[]}}).some(f=>f.type==='focus lost'));
 assert.ok(compare({created:[{words:['bank'],minutes:20}]},[{...bank(),minutes:5}]).some(f=>f.type==='wrong time'));
});

test('saved changes require target identity, with unsolicited edits and health deltas checked',()=>{
 const before={...empty(),entries:[bank(),{...bank(),id:2,title:'Gym morning'}]};
 const after=structuredClone(before);after.entries[1].archived=true;
 const failures=checkExpectation(expectation({created:[],changes:[{id:1,kind:'archive'}],unchanged:[2],health:{waterDelta:2,mealSkipped:'lunch'}}),{before,after});
 assert.ok(failures.some(f=>f.type==='focus lost'));
 assert.ok(failures.some(f=>f.type==='invented item'));
 assert.ok(failures.some(f=>f.detail.includes('Water delta')));
 assert.ok(failures.some(f=>f.detail.includes('skipped lunch')));
 const shifted=structuredClone(before);before.entries[0].priority=1;before.entries[1].priority=2;
 shifted.entries[0].priority=2;shifted.entries[1].priority=3;
 assert.deepEqual(checkExpectation(expectation({created:[],maxNew:0}),{before,after:shifted}),[]);
 shifted.entries[0].priority=4;
 assert.ok(checkExpectation(expectation({created:[],maxNew:0}),{before,after:shifted}).some(f=>f.detail.includes('reorder')));
 const alarm=bank();alarm.alertIntent={type:'alarm'};
 assert.deepEqual(compare({created:[{words:['bank'],alert:'alarm'}]},[alarm]),[]);
 assert.ok(compare({created:[{words:['bank'],blockWords:['refund']}]}).some(f=>f.type==='lost item'));
});

test('focused survivor identity cannot hide a changed title or an extra proposal',()=>{
 const op=(opId,title)=>({opId,kind:'create',entity:'task',targetId:null,fields:[{name:'title',op:'set',value:title}]});
 const before=empty();before.intentV2={drafts:{'draft-dinner':{id:'draft-dinner',status:'draft',operations:[op('dinner1','Cook dinner'),op('dinner2','Buy dinner ingredients')]}}};
 const draft={id:'draft-dinner',status:'draft',operations:[op('dinner2','Invented flight'),op('extra','Book hotel')]};
 const failures=checkExpectation(expectation({created:[],maxNew:0,focusRemoved:['dinner1'],focusRetained:['dinner2']}),{before,after:empty(),draft});
 assert.ok(failures.some(f=>f.type==='focus lost'));
 assert.ok(failures.some(f=>f.type==='invented item'));
});

test('schema, raw retention, unsafe errors, transport, crash and repeated questions have negative controls',()=>{
 const turn={text:'raw',capture:{raw:'changed',lastError:{message:'TypeError: Cannot read properties of null'}},exception:'crashed',
  result:{status:'captured',error:'No interpretation'},calls:[{output:{},savedBeforeModel:false},{output:null,error:'timeout'}],draft:{id:'d1',status:'draft',question:{prompt:'Which one?'}}};
 const types=checkExecution([turn,turn],{validate,schema:TURN_SCHEMA}).map(f=>f.type);
 for(const type of ['words lost','invalid schema','unsafe error','transport error','crash','interpretation rejected','repeated question'])assert.ok(types.includes(type),type);
});

test('CLI usage keeps cache tokens separate and option parser rejects accidental broad runs',()=>{
 assert.deepEqual(usageTotals([{usage:{input_tokens:3,output_tokens:4,cache_read_input_tokens:5,cache_creation_input_tokens:6},costUSD:0.1}]),{input:3,output:4,cacheRead:5,cacheWrite:6,costUSD:0.1,calls:1});
 assert.equal(parseOptions([]).concurrency,3);
 assert.throws(()=>parseOptions(['--concurrency','0']));assert.throws(()=>parseOptions(['--only']));
 const summary=summarize([{ms:1,pass:false,failures:[],turns:[{calls:[{error:'timeout',route:{reason:'capture'}}]}]}]);
 assert.equal(summary.modelCalls,1);assert.equal(summary.usageMissing,1);assert.equal(summary.callFailures,1);
});

test('a transient invention still fails after a later turn removes it',()=>{
 const before=empty(),invented={...empty(),entries:[{id:1,title:'Invented flight',kind:'plan'}]};
 const states=[invented,empty()];
 const turns=['first','second'].map(text=>({text,capture:{messageId:text,raw:text},calls:[]}));
 for(const state of states)state.intentV2={captures:Object.fromEntries(turns.map(t=>[t.text,t.capture])),drafts:{}};
 const failures=evaluateCase({turns:turns.map(t=>({text:t.text})),expect:expectation({created:[],maxNew:0})},{before,after:states[1],states,turns,validate,schema:TURN_SCHEMA});
 assert.ok(failures.some(f=>f.type==='invented item'&&f.turn===1));
});

test('corpus has breadth, exact incident, long monologues and bounded committed files',async()=>{
 const {manifest,cases}=await loadCorpus();
 assert.ok(cases.length>=40);assert.ok(cases.filter(c=>c.turns.length>1).length>=8);
 assert.equal(manifest.hardest.length,10);assert.ok(manifest.hardest.every(id=>cases.some(c=>c.id===id)));
 assert.ok(cases.filter(c=>c.turns.some(t=>t.text.split(/\s+/).length>=500)).length>=2);
 assert.deepEqual(cases.find(c=>c.id==='dinner-exact-four-turns').turns.map(t=>t.text),['Delete this','That one only','Both','First']);
 for(const c of cases){
  assert.match(c.id,/^[a-z0-9-]+$/);
  for(const t of c.turns)assert.ok(t.text.length>0&&t.text.length<=12000);
  for(const e of [c.expect,...(c.expect.checkpoints??[])]){
   for(const k of ['created','forbidden','changes','unchanged'])assert.ok(Array.isArray(e[k]),`${c.id} ${k}`);
   assert.ok(Number.isInteger(e.maxNew));assert.ok(['allowed','forbidden','required'].includes(e.question));
  }
 }
 const here=path.dirname(fileURLToPath(import.meta.url));
 async function walk(dir){for(const f of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,f.name);if(f.isDirectory())await walk(file);else assert.ok((await stat(file)).size<=20000,`${file} exceeds 5,000 estimated tokens`);}}
 await walk(here);
});

test('fake model goes through production interpreter, canonical adapter, file persistence and userMessage',async t=>{
 t.mock.method(console,'error',()=>{});
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-stress-test-'));
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const modules=await targetModules(repo);
 const text='Call the bank tomorrow at 6 pm';
 const output=input=>({schemaVersion:1,mode:'capture',draftMode:'new',reply:'',decisions:input.sourceUnits.map(u=>({sourceId:u.id,disposition:'action',note:null})),
  operations:[{opId:'bank',sourceId:'s0',kind:'create',entity:'task',targetId:null,fields:[
   {name:'title',op:'set',value:'Call the bank',origin:'stated',evidence:'Call the bank'},
   {name:'time',op:'set',value:'tomorrow at 6 pm',origin:'stated',evidence:'tomorrow at 6 pm'}]}],question:null,clarification:null,memoryCandidates:[],card:null});
 try{
  const result=await runCase({id:'fake',tags:[],turns:[{text}],expect:expectation({})},{modules,directory:path.join(directory,'success'),modelOverride:async input=>({output:output(input),record:{}})});
  assert.deepEqual(result.failures,[]);
  assert.equal(result.saved.newTasks[0].source,'intent-v2');
  assert.equal(result.turns[0].calls[0].savedBeforeModel,true);
  const persisted=JSON.parse(await readFile(result.artifacts.final,'utf8'));
  assert.equal(persisted.entries.find(e=>e.title==='Call the bank').raw,text);
  const failure=await runCase({id:'fault',tags:[],turns:[{text}],expect:expectation({created:[],maxNew:0})},{modules,directory:path.join(directory,'fault'),modelOverride:async()=>{throw new TypeError('fault injection');}});
  assert.equal(failure.turns[0].result.error,modules.errors.FAULT_TEXT);
  assert.ok(!failure.failures.some(f=>f.type==='unsafe error'));
  assert.equal(failure.turns[0].capture.raw,text);
 }finally{await rm(directory,{recursive:true,force:true});}
});
