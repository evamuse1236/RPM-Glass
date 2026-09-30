import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,requestFor,applyPolicy,validateResponse} from '../evals/jev-routing.mjs';
const request=requestFor(cases[0]);
const response=(probabilities={block_0:.97,block_1:.01,block_2:.01,keep_unsorted:.01})=>({model:'typesafe/jev-1.13-20260917',usage:{input_tokens:100,output_tokens:50},answers:{assignment_0:{type:'choice',choice:'block_0',confidence:.94,probabilities}}});
test('Jev routing keeps source text and complete finite choices without private context',()=>{
 assert.equal(cases.length,24);
 for(const c of cases){const r=requestFor(c);assert.equal(r.state.tasks[0].title,c.text);assert.ok(c.text.length<=200);assert.equal(Object.keys(r.questions.assignment_0.criteria).length,4);assert.deepEqual(Object.keys(r.state),['tasks','blocks']);}
});
test('routing refuses incomplete or internally inconsistent probabilities',()=>{
 assert.throws(()=>validateResponse(response({block_0:.97}),request));
 assert.throws(()=>validateResponse(response({block_0:.01,block_1:.97,block_2:.01,keep_unsorted:.01}),request));
 assert.equal(applyPolicy({},request).mode,'high');
});
test('only a confident classification can downgrade; stale evidence and risk preserve high',()=>{
 assert.equal(applyPolicy(response(),request).mode,'none');
 assert.equal(applyPolicy(response(),request,{riskFloor:'high'}).mode,'high');
 assert.equal(applyPolicy(response(),request,{currentFingerprint:'stale'}).reason,'stale_evidence');
 assert.equal(applyPolicy(response({block_0:.7,block_1:.1,block_2:.1,keep_unsorted:.1}),request).mode,'high');
});
