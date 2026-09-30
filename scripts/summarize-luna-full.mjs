// Offline: combines immutable paid-call results with explicit review notes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {summarize} from '../intent-v2/evals/luna-full.mjs';
const dir=process.argv[2];assert.ok(dir,'Provide the completed evaluation directory');
const raw=fs.readFileSync(path.join(dir,'results.jsonl'),'utf8');
const rows=raw.trim().split('\n').map(JSON.parse),reviews=JSON.parse(fs.readFileSync(path.join(dir,'manual-review.json'),'utf8'));
const key=r=>`${r.effort}:${r.caseId}`,byKey=new Map(reviews.map(r=>[key(r),r]));
assert.equal(byKey.size,rows.length,'Every result needs one review');assert.equal(reviews.length,byKey.size,'No duplicate reviews');
const reviewed=rows.map(row=>{
 const review=byKey.get(key(row));assert.ok(review?.reviewed,'Unreviewed result '+key(row));
 const failures=[...row.failures,...review.additionalFailures];
 return {...row,automatedPassed:row.passed,failures,passed:failures.length===0,review};
});
const summaries=summarize(reviewed),categories=[...new Set(rows.map(r=>r.category))];
const paired=Object.fromEntries(['bothPass','noneOnly','highOnly','bothFail'].map(k=>[k,[]]));
for(const id of new Set(rows.map(r=>r.caseId))){
 const n=reviewed.find(r=>r.caseId===id&&r.effort==='none'),h=reviewed.find(r=>r.caseId===id&&r.effort==='high');
 assert.ok(n&&h,'Incomplete pair '+id);paired[n.passed?(h.passed?'bothPass':'noneOnly'):(h.passed?'highOnly':'bothFail')].push(id);
}
const report={rawSha256:createHash('sha256').update(raw).digest('hex'),requests:rows.length,
 totalReportedCost:rows.reduce((n,r)=>n+(r.cost??0),0),knownCosts:rows.filter(r=>Number.isFinite(r.cost)).length,
 summaries,paired,categories:categories.map(category=>({category,configurations:summaries.map(c=>{
  const selected=reviewed.filter(r=>r.category===category&&r.effort===c.effort);return {effort:c.effort,cases:selected.length,passed:selected.filter(r=>r.passed).length};
 })})),applicationLimitations:reviewed.filter(r=>r.review.applicationLimitations?.length).map(r=>({effort:r.effort,caseId:r.caseId,limitations:r.review.applicationLimitations}))};
fs.writeFileSync(path.join(dir,'reviewed-results.jsonl'),reviewed.map(r=>JSON.stringify(r)).join('\n')+'\n');
fs.writeFileSync(path.join(dir,'reviewed-summary.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({requests:report.requests,totalReportedCost:report.totalReportedCost,summaries},null,2));
