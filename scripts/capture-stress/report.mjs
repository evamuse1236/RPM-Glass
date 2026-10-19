import {usageTotals,modelUsageTotals} from './cli.mjs';

export function summarize(results){
 const counts={};
 for(const r of results)for(const type of new Set(r.failures.map(f=>f.type)))counts[type]=(counts[type]??0)+1;
 const attempts=results.flatMap(r=>r.turns.flatMap(t=>t.calls));
 const records=attempts.map(c=>c.record).filter(Boolean);
 const routes={},routeReasons={};
 for(const c of attempts){const name=c.routeUsed??(c.route?.effort==='none'?'quick':'careful'),reason=c.route?.reason??'unknown';routes[name]=(routes[name]??0)+1;routeReasons[reason]=(routeReasons[reason]??0)+1;}
 const times=results.map(r=>r.ms).sort((a,b)=>a-b);
 return {runs:results.length,passed:results.filter(r=>r.pass).length,passRate:results.length?results.filter(r=>r.pass).length/results.length:0,
  classes:Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1])),usage:usageTotals(records),modelUsage:modelUsageTotals(records),routes,routeReasons,
  modelCalls:attempts.length,usageMissing:attempts.length-records.length,callFailures:attempts.filter(c=>c.error||c.record?.isError).length,
  caseLatencyMs:{min:times[0]??0,median:times[Math.floor(times.length/2)]??0,max:times.at(-1)??0}};
}

export function reportMarkdown(run){
 const s=run.summary;
 const lines=[`# Capture stress report ${run.id}`,'',
  `${s.passed}/${s.runs} case-runs passed (${(s.passRate*100).toFixed(1)}%). Failures count affected case-runs, so classes overlap.`,
  '',`Target ${run.repo} at ${run.revision}. Corpus SHA-256 ${run.corpusHash}.`,
  `CLI transport. Live model plus production Capture backend. Phone API, native fallback and UI are UNVERIFIED.`,
  `Project-document/hook canary probe ${run.probe.passed?'passed':'FAILED'}, mode ${run.probe.mode}. ${run.probe.method}`,
  'Strict custom-prompt-only isolation is UNVERIFIED. A later retained probe reported CLI environment instructions despite safe mode. Canary success covers only the tested project document and hooks; CLI metadata and StructuredOutput framing remain a proxy difference.',
  '',`Wall time ${(run.wallMs/1000).toFixed(1)} seconds at concurrency ${run.concurrency}. Case latency min/median/max ${Object.values(s.caseLatencyMs).join('/')} ms.`,
  `CLI top-level usage ${JSON.stringify(s.usage)}. Token fields include API usage totals and cache counts separately. List-price estimate, not a billing receipt.`,
  `CLI per-model modelUsage totals ${JSON.stringify(s.modelUsage)}. These are a separate CLI accounting view, not additional tokens to add to top-level usage.`,
  `Probe usage ${JSON.stringify(run.probeUsage??null)}. Optional judge usage ${JSON.stringify(run.judgeUsage??null)}. Both are separate from the case workload.`,
  ...run.results.filter(r=>r.judge).map(r=>`Judge ${r.id} #${r.repeat}: ${JSON.stringify(r.judge.output??r.judge.error)}`),
  `Model attempts ${s.modelCalls}, CLI failures ${s.callFailures}, attempts with no reported usage ${s.usageMissing}. Routes ${JSON.stringify(s.routes)}. Reasons ${JSON.stringify(s.routeReasons)}.`,
  `Machine ${JSON.stringify(run.machine)}. Startup, CLI framing, network, model thinking and schema formatting are included. No phone latency claim.`,
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
  '- The optional Sonnet judge is supplemental and never changes deterministic pass/fail.',
  '- The clock is fixed at 2026-10-19 10:00 IST, advancing one second per turn. Calendar and habits are seeded fixtures, not external integrations.',
  '- Production routes, repair allowance and deadlines are retained. CLI startup and structured-output overhead can cause deadline failures. CLI may use thinking even where the API route requests none.',
  '- Runtime error checks reject raw script faults. Production userMessage provenance is covered by npm rule checks and a fault-injection unit test.',
  '- Full per-turn input, output and disk state are in the case directories beside results.json. No app key files are read.');
 return lines.join('\n')+'\n';
}
