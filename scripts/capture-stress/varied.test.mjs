import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCorpus,selectCases,parseOptions} from './run.mjs';
import {checkExpectation} from './checks.mjs';
import {evaluateCase} from './evaluate.mjs';
import {TURN_SCHEMA,validate} from '../../intent-v2/src/schema.mjs';

test('varied cases are frozen before tuning, with twelve held out by default',async()=>{
 const {cases,manifest}=await loadCorpus();
 const varied=JSON.parse(await readFile(new URL('./corpus/varied-2026-10-21.json',import.meta.url)));
 assert.ok(varied.length>=40);
 assert.equal(varied.filter(c=>c.tags.includes('heldout')).length,12);
 assert.ok(varied.filter(c=>c.turns.some(t=>t.text.split(/\s+/).length>=150)&&c.expect.created.length>=4).length>=2);
 assert.ok(selectCases(cases,manifest,{}).every(c=>!c.tags.includes('heldout')));
 assert.equal(selectCases(cases,manifest,parseOptions(['--include-heldout'])).length,cases.length);
 assert.throws(()=>selectCases(cases,manifest,{only:'varied-h-journal'}),/Held-out/);
 assert.throws(()=>selectCases(cases,manifest,{only:'missing'}),/Unknown/);
});

test('repeat and Project checks reject a saved task with wrong recurrence or parent',()=>{
 const before={entries:[],planner:{projects:[]}},after={entries:[{id:1,title:'Stretch',recurrence:'daily',repeatAfterDays:null}],planner:{projects:[{id:'p',title:'Library weekend'}],blocks:[{id:'b',title:'Donation ready',projectId:'p'}]}};
 before.planner.projects=structuredClone(after.planner.projects);
 const expect={created:[{entity:'task',words:['stretch'],recurrence:'daily',repeatAfterDays:null},{entity:'block',words:['Donation'],projectWords:['Library','weekend']}],maxNew:2};
 assert.deepEqual(checkExpectation(expect,{before,after}),[]);
 for(const change of [d=>d.entries[0].recurrence='weekdays',d=>d.entries[0].repeatAfterDays=3,d=>d.planner.blocks[0].projectId='wrong']){
  const broken=structuredClone(after);change(broken);
  assert.ok(checkExpectation(expect,{before,after:broken}).length);
 }
});

test('an agenda expectation needs the correct answer day and missing details stay explicit',()=>{
 const capture={messageId:'m',raw:'words',card:{kind:'agenda',day:'2026-10-20'}};
 const draft={status:'committed',missing:[{opId:'a',field:'time'}],operations:[]};
 const state={entries:[],planner:{},intentV2:{captures:{m:capture},drafts:{}}};
 const turn={text:'words',capture,draft,calls:[]};
 const testCase={turns:[{text:'words'}],expect:{created:[],changes:[],maxNew:0,card:{kind:'agenda',day:'2026-10-20'},missing:['time']}};
 const evaluate=()=>evaluateCase(testCase,{before:state,after:state,states:[state],turns:[turn],validate,schema:TURN_SCHEMA});
 assert.deepEqual(evaluate(),[]);
 capture.card.day='2026-10-19';assert.ok(evaluate().some(f=>f.type==='wrong answer'));
 draft.missing=[];assert.ok(evaluate().some(f=>f.type==='missing detail lost'));
});
