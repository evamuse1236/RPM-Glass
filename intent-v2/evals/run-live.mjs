import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
import {buildContext,sourceUnits} from '../src/context.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {openRouterTransport} from '../adapters/transport.mjs';import {grade} from './grade.mjs';
const args=process.argv.slice(2),run=args.includes('--run'),all=args.includes('--all'),saveOutputs=args.includes('--save-outputs');
const index=args.indexOf('--limit'),limit=index>=0?Number(args[index+1]):all?66:10;
if(!Number.isInteger(limit)||limit<1||limit>66)throw new Error('--limit must be an integer from 1 to 66');
const root=fileURLToPath(new URL('../',import.meta.url));
const cases=(await readFile(resolve(root,'evals/cases.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).slice(0,limit);
if(!run){console.log(`${cases.length} of 66 synthetic cases selected. No API call made. Use --run explicitly; default is 10 calls, --all is 66.`);console.log('Set OPENROUTER_API_KEY and RPM_MODEL in your shell. RPM_PROVIDER is optional. Provider charges apply.');process.exit(0);}
if(!process.env.RPM_MODEL||!process.env.OPENROUTER_API_KEY)throw new Error('Set RPM_MODEL and OPENROUTER_API_KEY before --run');
const model=openRouterTransport({apiKey:process.env.OPENROUTER_API_KEY,model:process.env.RPM_MODEL,prompt:await readFile(resolve(root,'prompts/intent-system.md'),'utf8'),providerNames:process.env.RPM_PROVIDER?[process.env.RPM_PROVIDER]:[]});
const reference='2026-09-16T04:00:00.000Z',results=[];
for(const c of cases){
 const data={schema:2,version:0,entries:(c.entries??[]).map(e=>({kind:'plan',archived:false,done:false,raw:e.title,revisions:[],...e})),memories:c.memories??[],history:[],conversations:[{id:'eval',messages:[],archived:false}],planner:{schema:1,blocks:[],projects:[],goals:[],areas:[],drafts:[],context:{approved:false}}};
 const units=sourceUnits(c.text),context=buildContext(data,{raw:c.text,conversationId:'eval',now:new Date(reference)});context.timezone='Asia/Kolkata';
 const start=performance.now();let result;
 try{const output=await model({messageId:c.id,sourceUnits:units,context,activeDraft:null,repair:null},{signal:AbortSignal.timeout(20000)});
 const parsed=interpretTurn(output,{units,messageId:c.id,visibleEntities:context.entities,activeDraft:null});
 const failures=grade(parsed,c.expect);result={id:c.id,category:c.category,model:process.env.RPM_MODEL,provider:process.env.RPM_PROVIDER??null,ms:Math.round(performance.now()-start),contractPassed:!failures.length,failures,humanReviewRequired:c.humanReview||'Verify meaning, completeness, reply quality and unsupported claims.',...(saveOutputs?{output}:{} )};
 }catch(e){result={id:c.id,category:c.category,model:process.env.RPM_MODEL,ms:Math.round(performance.now()-start),contractPassed:false,failures:[e.message],humanReviewRequired:c.humanReview};}
 results.push(result);console.log(`${result.contractPassed?'PASS':'FAIL'} ${c.id} ${result.ms}ms ${result.failures.join('; ')}`);
}
const out=resolve(root,'eval-results');await mkdir(out,{recursive:true});const file=resolve(out,`run-${new Date().toISOString().replace(/[:.]/g,'-')}.jsonl`);await writeFile(file,results.map(r=>JSON.stringify(r)).join('\n')+'\n');
const times=results.map(r=>r.ms).sort((a,b)=>a-b),percentile=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
console.log(JSON.stringify({cases:results.length,contractPassed:results.filter(r=>r.contractPassed).length,p50Ms:percentile(.5),p95Ms:percentile(.95),resultFile:file,note:'Single-call synthetic contract checks, not measured task success or production latency. No mutations executed.'},null,2));
process.exitCode=results.every(r=>r.contractPassed)?0:1;
