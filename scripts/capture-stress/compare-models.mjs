import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCorpus} from './run.mjs';
import {targetModules,runCase} from './runtime.mjs';
import {apiCall} from './api.mjs';

export const SPEED_CASE_IDS=Object.freeze(['everyday-call-mom','smart-mom-five','fillers-bank','correction-report','hinglish-kal-subah','journal-only','water-and-task','focused-delete-first','monologue-purifier','monologue-loan']);
export const OPENROUTER_ENDPOINT='https://openrouter.ai/api/v1/chat/completions';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;

/** The production OpenRouter body/parser, with only numeric usage and static errors retained. */
export async function mercuryCall({prompt,input,route,signal,deadline,adapters,fetchImpl=fetch}){
 const started=Date.now(),record={transport:'API transport',service:'openrouter',requestedModel:route.model,servedModel:null,status:null,ms:0,isError:false,usage:null,costUSD:null};
 const controller=new AbortController(),cancel=()=>controller.abort();
 const timer=setTimeout(cancel,Math.max(0,Math.min(route.timeoutMs,(deadline??Infinity)-Date.now())));
 signal?.addEventListener('abort',cancel,{once:true});
 const fail=code=>{record.isError=true;record.ms=Date.now()-started;record.error=code;return Object.assign(new Error('OpenRouter interpretation unavailable; captured words are safe'),{code,record});};
 try{
  const key=process.env.OPENROUTER_API_KEY;
  if(!key||signal?.aborted||deadline<=Date.now())throw fail('TRANSPORT_ERROR');
  const body=adapters.transport.structuredRequest({model:route.model,prompt,input,maxTokens:route.maxTokens,effort:route.effort});
  const response=await fetchImpl(OPENROUTER_ENDPOINT,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(body),signal:controller.signal});
  record.status=Number.isInteger(response.status)?response.status:null;
  if(controller.signal.aborted||record.status===null||record.status<200||record.status>=300)throw fail('TRANSPORT_ERROR');
  const value=await response.json();
  if(controller.signal.aborted||value?.model!==route.model)throw fail('TRANSPORT_ERROR');
  record.servedModel=route.model;
  record.usage={input_tokens:count(value.usage?.prompt_tokens),output_tokens:count(value.usage?.completion_tokens),cache_read_input_tokens:count(value.usage?.prompt_tokens_details?.cached_tokens)};
  record.costUSD=typeof value.usage?.cost==='number'&&Number.isFinite(value.usage.cost)&&value.usage.cost>=0?value.usage.cost:null;
  let output;try{output=adapters.transport.readStructuredResponse(value,{model:route.model});}catch{throw fail('INVALID_MODEL_RESPONSE');}
  record.ms=Date.now()-started;
  return {record,output};
 }catch(error){throw error?.record===record?error:fail('TRANSPORT_ERROR');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

export function comparisonSummary(results){
 const calls=results.flatMap(r=>r.turns.flatMap(t=>t.calls)),times=calls.map(c=>c.record?.ms).filter(Number.isFinite).sort((a,b)=>a-b);
 return {cases:results.length,checksPassed:results.filter(r=>r.pass).length,checksPassRate:results.length?results.filter(r=>r.pass).length/results.length:0,
  calls:calls.length,validOutputs:calls.filter(c=>c.output).length,validOutputRate:calls.length?calls.filter(c=>c.output).length/calls.length:0,
  callMs:{p50:times[Math.ceil(times.length*0.5)-1]??null,p95:times[Math.ceil(times.length*0.95)-1]??null}};
}

async function main(){
 const args=process.argv.slice(2),options={n:10,out:'.verify/capture-stress/compare-models-'+new Date().toISOString().replace(/[:.]/g,'-'),budget:0.5};
 for(let i=0;i<args.length;i++){
  if(!['--n','--out','--budget'].includes(args[i])||!args[i+1])throw new Error('Use --n 1..10 --out PATH --budget USD');
  options[args[i].slice(2)]=args[++i];
 }
 options.n=Number(options.n);options.budget=Number(options.budget);
 if(!Number.isInteger(options.n)||options.n<1||options.n>10||!Number.isFinite(options.budget)||options.budget<=0||options.budget>1)throw new Error('Invalid case count or budget (maximum $1)');
 if(!process.env.OPENROUTER_API_KEY){console.log('not run: no key (OPENROUTER_API_KEY)');return;}
 if(!process.env.ANTHROPIC_API_KEY){console.log('not run: no key (ANTHROPIC_API_KEY)');return;}
 process.env.TZ='Asia/Kolkata';
 const adapters=await targetModules(root),{cases,hash}=await loadCorpus(),directory=path.resolve(options.out);
 await mkdir(directory,{recursive:true});
 const report={corpusHash:hash,caseIds:SPEED_CASE_IDS.slice(0,options.n),budgetUSD:options.budget,reservedUSD:0,models:{}};
 // Reserve an intentionally generous byte-based upper bound before every request, including repairs.
 // Launch prices: Haiku $0.10/$0.50, Mercury $0.10/$0.35 per million input/output tokens.
 const budgetFetch=async(url,init)=>{
  const body=JSON.parse(init.body),reserve=(Buffer.byteLength(init.body)*2*0.2+body.max_tokens*0.5)/1000000;
  if(report.reservedUSD+reserve>options.budget)throw new Error('Comparison budget exhausted');
  report.reservedUSD+=reserve;return fetch(url,init);
 };
 for(const [name,route] of [['haiku',{model:adapters.policy.HAIKU_MODEL,effort:'none',timeoutMs:25000,maxTokens:4000}],['mercury',adapters.policy.MERCURY_QUICK_ROUTE]]){
  const results=[];
  for(const id of report.caseIds){
   const test=cases.find(c=>c.id===id);
   const result=await runCase(test,{modules:adapters,directory:path.join(directory,name,id),transport:'api',modelOverride:(input,o)=>{
    // Compare the two quick models on identical inputs and budgets, including any repair input.
    const options={prompt:adapters.prompt.intentSystemPrompt,input,route,signal:o.signal,deadline:Math.min(o.deadline,Date.now()+route.timeoutMs),adapters,fetchImpl:budgetFetch};
    return name==='haiku'?apiCall(options):mercuryCall(options);
   }});
   results.push(result);console.log(`${name} ${id}: ${result.pass?'PASS':'FAIL'} (${result.ms} ms)`);
  }
  report.models[name]={route,summary:comparisonSummary(results),results};
  await writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2));
 }
 const lines=['# Capture quick-model comparison','',`Same ${options.n} cases, production input and checks. Both models use thinking off, 4,000 output tokens and their quick deadlines. Repairs stay on the model under test. Case pass rate includes saved state and preserved words; valid-output rate is schema validity per call. Existing local readers can finish a case without a model call. Native phone latency is UNVERIFIED.`,'','| Model | Calls | p50 ms | p95 ms | Valid outputs | Cases passing checks |','| --- | ---: | ---: | ---: | ---: | ---: |'];
 for(const [name,{summary:s}] of Object.entries(report.models))lines.push(`| ${name} | ${s.calls} | ${s.callMs.p50} | ${s.callMs.p95} | ${s.validOutputs}/${s.calls} | ${s.checksPassed}/${s.cases} |`);
 await writeFile(path.join(directory,'report.md'),lines.join('\n')+'\n');
 console.log(path.join(directory,'report.md'));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Model comparison failed; no provider credentials are logged.');process.exitCode=1;});
