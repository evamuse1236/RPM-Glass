import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadCorpus} from './run.mjs';
import {targetModules,routeName} from './runtime.mjs';
import {evaluateCase} from './evaluate.mjs';
import {summarize,reportMarkdown} from './report.mjs';

export async function recheck(directory){
 const file=path.join(directory,'results.json'),original=await readFile(file,'utf8'),run=JSON.parse(original);
 const {cases,hash}=await loadCorpus(),m=await targetModules(run.repo);
 for(const result of run.results){
  const test=cases.find(c=>c.id===result.id);
  if(!test||JSON.stringify(test.turns.map(t=>t.text))!==JSON.stringify(result.turns.map(t=>t.text)))throw new Error('Recheck cannot change case words or turn order');
  const dir=result.artifacts.directory;
  const {data:before}=JSON.parse(await readFile(path.join(dir,'seed.json'),'utf8'));
  const states=await Promise.all(result.turns.map(async(_,i)=>JSON.parse(await readFile(path.join(dir,`turn-${i+1}.json`),'utf8')).state));
  const after=JSON.parse(await readFile(path.join(dir,'final.json'),'utf8'));
  result.expect=test.expect;
  for(const turn of result.turns)for(const call of turn.calls)call.routeUsed=routeName(call.route,m.policy.MODEL_ROUTES);
  result.failures=evaluateCase(test,{before,after,turns:result.turns,states,validate:m.schema.validate,schema:m.schema.TURN_SCHEMA});
  result.pass=result.failures.length===0;
 }
 const digest=createHash('sha256').update(original).digest('hex');
 await writeFile(path.join(directory,`results-before-recheck-${digest.slice(0,12)}.json`),original);
 run.rechecks??=[];run.rechecks.push({at:new Date().toISOString(),originalResultsHash:digest,originalCorpusHash:run.corpusHash,corpusHash:hash,method:'Deterministic evaluation of retained model outputs and disk states. No model calls.'});
 run.corpusHash=hash;run.summary=summarize(run.results);
 for(const result of run.results)await writeFile(path.join(result.artifacts.directory,'result.json'),JSON.stringify(result,null,2));
 await writeFile(file,JSON.stringify(run,null,2));await writeFile(path.join(directory,'report.md'),reportMarkdown(run));
 console.log(`${run.summary.passed}/${run.results.length} passed after deterministic recheck; no model calls`);
 return run;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Usage: node scripts/capture-stress/recheck.mjs RUN_DIRECTORY');
 await recheck(path.resolve(process.argv[2]));
}
