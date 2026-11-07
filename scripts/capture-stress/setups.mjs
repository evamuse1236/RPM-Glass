import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {targetModules,runCase} from './runtime.mjs';
import {nodeModelBridge} from '../../cli/capture-session.mjs';
import {nativeModelTransport,providerSchema} from '../../intent-v2/adapters/transport.mjs';
import {TURN_SCHEMA} from '../../intent-v2/src/schema.mjs';
import {intentSystemPrompt} from '../../intent-v2/prompts/intent-system.mjs';
import {HAIKU_MODEL,SONNET_MODEL,CLAUDE_PROVIDERS} from '../../intent-v2/src/model-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const TERRA='openai/gpt-6.1-terra';
export const SETUPS=Object.freeze({
 haiku:{first:HAIKU_MODEL,backup:SONNET_MODEL},
 terra:{first:TERRA,backup:TERRA},
 'haiku+terra':{first:HAIKU_MODEL,backup:TERRA},
});
export const DEFAULT_SETS=['real-2026-10-27','everyday','conversation','basic'];

/** The phone sends quick and careful reads to Haiku and hard reads and redos to Sonnet; a setup names who answers each. */
export function setupTransport({first,backup},{native,prompt=intentSystemPrompt}){
 const claude=nativeModelTransport({native,model:HAIKU_MODEL,prompt,providerNames:CLAUDE_PROVIDERS,effort:'none'});
 const other=nativeModelTransport({native,model:first,prompt,providerNames:[],effort:'none'});
 return (input,options={})=>{
  const target=options.route?.model===SONNET_MODEL?backup:first;
  const route={...(options.route??{}),model:target};
  if(options.run)options.run.model=target;
  return (target.startsWith('anthropic/')?claude:other)(input,{...options,route});
 };
}

const strictFor=model=>model.startsWith('anthropic/')||model.startsWith('openai/');
export function bridgeFetch(fetchImpl=fetch){
 return async(url,init)=>{
  const body=JSON.parse(init.body);
  if(!strictFor(body.model??'')&&body.response_format?.json_schema){body.response_format.json_schema.schema=providerSchema(TURN_SCHEMA);init={...init,body:JSON.stringify(body)};}
  return fetchImpl(url,init);
 };
}

export function setupsOptions(args){
 const options={setups:Object.keys(SETUPS),sets:DEFAULT_SETS,out:path.join(root,'.verify/capture-setups',new Date().toISOString().replace(/[:.]/g,'-'))};
 for(let i=0;i<args.length;i++){
  const flag=args[i];
  if(!['--setups','--sets','--out','--only'].includes(flag)||!args[i+1])throw new Error('Use --setups haiku,terra,haiku+terra --sets real-2026-10-27,everyday --out <dir>.');
  const value=args[++i];options[flag.slice(2)]=flag==='--out'?value:value.split(',').map(s=>s.trim()).filter(Boolean);
 }
 for(const name of options.setups)if(!SETUPS[name])throw new Error(`Unknown setup ${name}. Use ${Object.keys(SETUPS).join(', ')}.`);
 return options;
}

const pct=(list,p)=>{const s=[...list].sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.ceil(s.length*p)-1)]:null;};
export function summarizeSetup(results){
 const turns=results.flatMap(r=>r.turnTimes??[]);
 const calls=results.flatMap(r=>r.calls??[]);
 return {cases:results.length,passed:results.filter(r=>r.pass).length,turns:turns.length,medianMs:pct(turns,0.5),p90Ms:pct(turns,0.9),maxMs:turns.length?Math.max(...turns):null,
  backupCalls:calls.filter(c=>c.backup).length,costUSD:calls.reduce((s,c)=>s+(typeof c.cost==='number'?c.cost:0),0)};
}

async function main(){
 const options=setupsOptions(process.argv.slice(2));
 if(!process.env.OPENROUTER_API_KEY||!process.env.ANTHROPIC_API_KEY){console.log('Not run: needs ANTHROPIC_API_KEY and OPENROUTER_API_KEY.');process.exitCode=1;return;}
 process.env.TZ='Asia/Kolkata';
 const modules=await targetModules(root);
 const byFile=(await Promise.all(options.sets.map(async set=>JSON.parse(await readFile(path.join(root,'scripts/capture-stress/corpus',set+'.json'),'utf8'))))).flat().filter(c=>!options.only||options.only.includes(c.id));
 await mkdir(options.out,{recursive:true});
 const report={sets:options.sets,cases:byFile.length,setups:{}};
 for(const name of options.setups){
  const setup=SETUPS[name],native=nodeModelBridge({env:process.env,fetchImpl:bridgeFetch()}),transport=setupTransport(setup,{native});
  const results=[];
  for(const test of byFile){
   const calls=[],turnTimes=[];
   const modelOverride=async(input,o)=>{
    const started=Date.now(),output=await transport(input,o),run=o.run??{};
    calls.push({model:run.servedModel??run.model,effort:o.route?.effort,backup:o.route?.model===SONNET_MODEL,ms:Date.now()-started,cost:run.cost??null});
    return {output,record:{servedModel:run.servedModel??run.model,usage:{input_tokens:run.inputTokens??null,output_tokens:run.outputTokens??null},costUSD:run.cost??null,service:run.service??null}};
   };
   let result;
   try{result=await runCase(test,{modules,directory:path.join(options.out,name.replace('+','-'),test.id),transport:'api',modelOverride});}
   catch(error){result={pass:false,error:String(error?.message??error),turns:[]};}
   for(const t of result.turns??[])if(Number.isFinite(t.ms))turnTimes.push(t.ms);
   results.push({id:test.id,pass:!!result.pass,failures:result.failures??result.checks?.filter?.(c=>!c.pass)?.map(c=>c.name??c.id)??[],ms:result.ms,turnTimes,calls});
   console.log(`${name.padEnd(12)} ${result.pass?'PASS':'FAIL'} ${String(result.ms??'-').padStart(6)}ms  ${test.id}  ${calls.map(c=>`${c.model?.split('/').pop()}${c.backup?'(backup)':''} ${c.ms}ms`).join(' → ')}`);
   report.setups[name]={setup,results,summary:summarizeSetup(results)};
   await writeFile(path.join(options.out,'results.json'),JSON.stringify(report,null,2));
  }
 }
 console.log('\nsetup         passed   median turn  p90     slowest  backup calls  cost');
 for(const [name,{summary:s}] of Object.entries(report.setups))console.log(`${name.padEnd(14)}${`${s.passed}/${s.cases}`.padEnd(9)}${((s.medianMs??0)/1000).toFixed(1).padEnd(13)}${((s.p90Ms??0)/1000).toFixed(1).padEnd(8)}${((s.maxMs??0)/1000).toFixed(1).padEnd(9)}${String(s.backupCalls).padEnd(14)}$${s.costUSD.toFixed(3)}`);
 console.log(`\nSaved: ${path.join(options.out,'results.json')}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error?.message??error);process.exitCode=1;});
