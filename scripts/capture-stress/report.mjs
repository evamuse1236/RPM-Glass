import {usageTotals,modelUsageTotals} from './cli.mjs';

export function summarize(results){
 const counts={};
 for(const r of results)for(const type of new Set(r.failures.map(f=>f.type)))counts[type]=(counts[type]??0)+1;
 const attempts=results.flatMap(r=>r.turns.flatMap(t=>t.calls));
 const records=attempts.map(c=>c.record).filter(Boolean);
 const routes={},routeReasons={},latencies={};
 for(const c of attempts){const name=c.routeUsed??'unknown',reason=c.route?.reason??'unknown';routes[name]=(routes[name]??0)+1;routeReasons[reason]=(routeReasons[reason]??0)+1;
  const times=latencies[name]??=[];if(Number.isFinite(c.record?.ms))times.push(c.record.ms);}
 const routeLatencyMs=Object.fromEntries(Object.entries(latencies).map(([name,times])=>{times.sort((a,b)=>a-b);return [name,{count:routes[name],measured:times.length,p50:times[Math.ceil(times.length*0.5)-1]??null,p95:times[Math.ceil(times.length*0.95)-1]??null}];}));
 const usage=usageTotals(records);if(attempts.length!==records.length)usage.costUSD=null;
 const times=results.map(r=>r.ms).sort((a,b)=>a-b);
 return {runs:results.length,passed:results.filter(r=>r.pass).length,passRate:results.length?results.filter(r=>r.pass).length/results.length:0,
  classes:Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1])),usage,modelUsage:modelUsageTotals(records),routes,routeReasons,routeLatencyMs,
  costComplete:usage.costUSD!==null,modelCalls:attempts.length,usageMissing:attempts.filter(c=>c.record?.usage?.input_tokens==null||c.record?.usage?.output_tokens==null).length,callFailures:attempts.filter(c=>c.error||c.record?.isError).length,
  caseLatencyMs:{min:times[0]??0,median:times[Math.floor(times.length/2)]??0,max:times.at(-1)??0}};
}

export function reportMarkdown(run){
 const s=run.summary,api=(run.transport??run.options?.transport)==='api',label=api?'API transport':'CLI transport';
 const lines=[`# Capture stress report ${run.id}`,'',
  `${s.passed}/${s.runs} case-runs passed (${(s.passRate*100).toFixed(1)}%). Failures count affected case-runs, so classes overlap.`,
  '',`Target ${run.repo} at ${run.revision}. Corpus SHA-256 ${run.corpusHash}.`,
  `${label}. Live model plus production Capture backend. Native fallback and UI are UNVERIFIED.`,
  ...(api?['CLI version and isolation probe skipped. Requests use the target production Anthropic adapter and provider schema. No retries or OpenRouter fallback are attempted. Node fetch uses a total route deadline capped at 95 seconds; it cannot reproduce Java\'s separate 8-second connect and 95-second per-read timers.']:[
   `Project-document/hook canary probe ${run.probe.passed?'passed':'FAILED'}, mode ${run.probe.mode}. ${run.probe.method}`,
   'Strict custom-prompt-only isolation is UNVERIFIED. A later retained probe reported CLI environment instructions despite safe mode. Canary success covers only the tested project document and hooks; CLI metadata and StructuredOutput framing remain a proxy difference.']),
  '',`Wall time ${(run.wallMs/1000).toFixed(1)} seconds at concurrency ${run.concurrency}. Case latency min/median/max ${Object.values(s.caseLatencyMs).join('/')} ms.`,
  `${label} usage ${JSON.stringify(s.usage)}. Token fields include uncached input and cache counts separately. Cost ${s.costComplete?'complete for reported calls':'incomplete; missing usage is not free'}. List-price estimate, not a billing receipt.`,
  ...(api?['API pricing verified 2026-10-19 at https://platform.claude.com/docs/en/about-claude/pricing. Usage includes cache writes by TTL when reported. No cache directives are added to phone requests.']:[`CLI per-model modelUsage totals ${JSON.stringify(s.modelUsage)}. These are a separate CLI accounting view, not additional tokens to add to top-level usage.`]),
  `Probe usage ${JSON.stringify(run.probeUsage??null)}. Optional judge usage ${JSON.stringify(run.judgeUsage??null)}. Both are separate from the case workload.`,
  ...run.results.filter(r=>r.judge).map(r=>`Judge ${r.id} #${r.repeat}: ${JSON.stringify(r.judge.output??r.judge.error)}`),
  `Model attempts ${s.modelCalls}, transport failures ${s.callFailures}, attempts with missing usage ${s.usageMissing}. Routes ${JSON.stringify(s.routes)}. Reasons ${JSON.stringify(s.routeReasons)}.`,
  `Route call latency in ms ${JSON.stringify(s.routeLatencyMs)}. p50 and p95 use nearest rank over recorded calls, including failed calls.`,
  `Machine ${JSON.stringify(run.machine)}. ${api?'Network, model thinking and response validation':'Startup, CLI framing, network, model thinking and schema formatting'} are included. No phone latency claim.`,
  ...(run.rechecks?.length?[`Deterministic recheck history ${JSON.stringify(run.rechecks)}. Original model responses are retained unchanged.`]:[]),
  '', '## Failure classes','', '| Class | Case-runs |','| --- | ---: |',
  ...Object.entries(s.classes).map(([name,count])=>`| ${name} | ${count} |`),'',
  '## All cases','', '| ID | Repeat | Pass | Classes |','| --- | ---: | --- | --- |',
  ...run.results.map(r=>`| ${r.id} | ${r.repeat} | ${r.pass?'yes':'no'} | ${[...new Set(r.failures.map(f=>f.type))].join(', ')} |`),
  '', '## Worst five',''];
 const rank=r=>new Set(r.failures.map(f=>f.type)).size*10+r.failures.length;
 for(const r of [...run.results].sort((a,b)=>rank(b)-rank(a)).slice(0,5)){
  lines.push(`### ${r.id}, repeat ${r.repeat}`,'',...r.failures.map(f=>`- ${f.type}: ${f.detail}`),'',
   'Actual model outputs, including rejected attempts:','', '```json',
   JSON.stringify(r.turns.map(t=>({words:t.text,outputs:t.calls.map(c=>c.output??{error:c.error??c.record?.error}),result:t.result})),null,2),'```','');
 }
 lines.push('## Interpretation limits','',
  '- Deterministic checks require canonical saved rows. Deferred turns explicitly test drafts. Proposal text alone is not a saved task.',
  '- Matching uses token prefixes, not semantic equivalence. Inspect lost/invented pairs before interpreting an overall rate as product quality.',
  ...(api?[]:['- The optional Sonnet judge is supplemental and never changes deterministic pass/fail.']),
  '- The clock is fixed at 2026-10-19 10:00 IST, advancing one second per turn. Calendar and habits are seeded fixtures, not external integrations.',
  '- Production routes, repair allowance and deadlines are retained.'+(api?' Application repair or escalation may make another call; the API transport itself never retries.':' CLI startup and structured-output overhead can cause deadline failures. CLI may use thinking even where the API route requests none.'),
  '- Runtime error checks reject raw script faults. Production userMessage provenance is covered by npm rule checks and a fault-injection unit test.',
  '- Full per-turn input, output and disk state are in the case directories beside results.json. No app key files are read.');
 return lines.join('\n')+'\n';
}
