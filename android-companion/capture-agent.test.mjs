import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {field,operation,turn} from '../intent-v2/test/helpers.mjs';
import {PROMPT_VERSION} from '../intent-v2/prompts/capture-agent.mjs';
import {HAIKU_MODEL} from '../intent-v2/src/model-policy.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan,planner} from './planner-state.mjs';
import {createIntentService,intentViewFromData} from './intent-service.mjs';
import {createCaptureAgent} from './capture-agent.mjs';
import {createTraceStore} from './capture-trace.mjs';
import {planSnapshot} from './capture-snapshot.mjs';

const NOW=new Date('2026-09-16T04:00:00.000Z');
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
function agentFor(model,{seed=freshStore(),snapshot=null}={}){
 const backend=createMemoryBackend(seed),emitted=[];
 const service=createIntentService({backend,model,changePlanner,undo,readCalendar:async()=>({status:'not_selected',events:[]}),editPlan,snapshot,clock:()=>NOW,timezone:'Asia/Kolkata'});
 const traces=createTraceStore({storage:memoryStorage(),emit:t=>emitted.push(structuredClone(t)),clock:()=>NOW});
 return {backend,service,traces,emitted,agent:createCaptureAgent({service,traces,clock:()=>NOW})};
}
const latest=async backend=>intentViewFromData(await backend.load(),{now:NOW}).captures[0];
const conversationOf=async backend=>(await backend.load()).conversations[0].id;
const withTask=(fields)=>{const seed=freshStore();editPlan(seed,{type:'saveTask',fields:{title:'Run',...fields}},NOW);return seed;};

test('the exact words are saved before the model is asked anything',async()=>{
 const raw='Call the bank at 10:30 am about the joint account';let seenAtCall=null;
 const s=agentFor(async()=>{const data=await s.backend.load();seenAtCall={raw:Object.values(data.intentV2.captures)[0]?.raw,entries:data.entries.length};return turn(raw,[operation([field('title','Call the bank','Call the bank'),field('time','10:30 am','10:30 am')])]);});
 await s.agent.capture({messageId:'m-bank',conversationId:await conversationOf(s.backend),text:raw});
 assert.deepEqual(seenAtCall,{raw,entries:0});
});

test('a new task applies straight away with a receipt, and Undo removes it and marks a likely mistake',async()=>{
 const raw='Call the bank at 10:30 am';
 const s=agentFor(async()=>turn(raw,[operation([field('title','Call the bank','Call the bank'),field('time','10:30 am','10:30 am')])]));
 const conversationId=await conversationOf(s.backend);
 const r=await s.agent.capture({messageId:'m-bank',conversationId,text:raw});
 assert.equal(r.applied.status,'applied');assert.equal(r.applied.needsConfirm,false);
 const data=await s.backend.load();assert.equal(data.entries.length,1);assert.equal(data.entries[0].raw,raw);
 const card=await latest(s.backend);
 assert.equal(card.draft.status,'committed');assert.equal(card.draft.confirm,null);
 assert.deepEqual(card.draft.lines.map(l=>[l.verb,l.title,l.where]),[['Added','Call the bank','Inbox']]);assert.match(card.draft.lines[0].when,/10:30/);
 await s.agent.undo({draftId:card.draft.id,conversationId,actionId:'undo-1'});
 assert.equal((await s.backend.load()).entries.length,0);
 const trace=s.traces.get('m-bank');assert.equal(trace.outcome,'undone');assert.equal(trace.likelyMistake,true);
 assert.equal((await latest(s.backend)).draft.status,'undone');
});

test('moving a saved task applies at once, then waits for Keep; Keep is recorded on the trace',async()=>{
 const seed=withTask({planned:'2026-09-16T07:30:00.000Z',minutes:30}),raw='Move my run to 6 pm';
 const s=agentFor(async()=>turn(raw,[operation([field('time','6 pm','6 pm')],{opId:'run',kind:'update',targetId:'1'})]),{seed});
 const conversationId=await conversationOf(s.backend);
 const r=await s.agent.capture({messageId:'m-move',conversationId,text:raw});
 assert.equal(r.applied.status,'applied');assert.equal(r.applied.needsConfirm,true);
 const card=await latest(s.backend);
 assert.equal(card.draft.confirm,'pending');
 const [line]=card.draft.lines;assert.equal(line.verb,'Moved');assert.match(line.was,/1:00/);assert.match(line.when,/6:00/);
 assert.equal(new Date((await s.backend.load()).entries[0].planned).toISOString(),'2026-09-16T12:30:00.000Z');
 await s.agent.confirm({draftId:card.draft.id,conversationId,actionId:'keep-1'});
 assert.equal((await latest(s.backend)).draft.confirm,'kept');
 assert.equal(s.traces.get('m-move').outcome,'kept');assert.equal(s.traces.get('m-move').likelyMistake,false);
});

test('Undo on an edit puts the saved task back as it was',async()=>{
 const seed=withTask({planned:'2026-09-16T07:30:00.000Z',minutes:30}),raw='Move my run to 6 pm';
 const s=agentFor(async()=>turn(raw,[operation([field('time','6 pm','6 pm')],{opId:'run',kind:'update',targetId:'1'})]),{seed});
 const conversationId=await conversationOf(s.backend);
 await s.agent.capture({messageId:'m-move',conversationId,text:raw});
 const card=await latest(s.backend);
 await s.agent.undo({draftId:card.draft.id,conversationId,actionId:'undo-edit'});
 assert.equal((await s.backend.load()).entries[0].planned,'2026-09-16T07:30:00.000Z');
 assert.equal(s.traces.get('m-move').outcome,'undone');
});

test('a delete moves the task to Trash and asks for Keep or Undo',async()=>{
 const seed=withTask({}),raw='Delete the run';
 const s=agentFor(async()=>turn(raw,[{opId:'del',sourceId:'s0',kind:'archive',entity:'task',targetId:'1',fields:[]}]),{seed});
 await s.agent.capture({messageId:'m-del',conversationId:await conversationOf(s.backend),text:raw});
 const entry=(await s.backend.load()).entries[0];assert.equal(entry.archived,true);assert.equal(entry.archiveDisposition,'trash');
 const card=await latest(s.backend);assert.equal(card.draft.confirm,'pending');assert.equal(card.draft.lines[0].verb,'Moved to Trash');
});

test('a model failure keeps the words for Retry, and Retry applies them',async()=>{
 let fail=true;const raw='Buy printer ink, the waterproof kind';
 const s=agentFor(async()=>{if(fail){const e=new Error('Connection failed');e.code='TRANSPORT_ERROR';throw e;}return turn(raw,[operation([field('title','Buy printer ink','Buy printer ink')])]);});
 const r=await s.agent.capture({messageId:'m-ink',conversationId:await conversationOf(s.backend),text:raw});
 assert.equal(r.status,'captured');assert.equal(r.applied,null);
 const saved=(await s.backend.load()).intentV2.captures['m-ink'];assert.equal(saved.raw,raw);assert.ok(saved.lastError);
 assert.equal((await s.backend.load()).entries.length,0);
 assert.equal(s.traces.get('m-ink').applied.status,'words-kept');assert.equal(s.traces.get('m-ink').errors[0].stage,'interpret');
 fail=false;const again=await s.agent.retry('m-ink');
 assert.equal(again.applied.status,'applied');assert.equal((await s.backend.load()).entries[0].title,'Buy printer ink');
 assert.equal(s.traces.get('m-ink').attempts,2);
});

test('the trace records words, model, prompt version, latency, actions and what applied, and never a key',async()=>{
 const raw='Call the bank at 10:30 am about the joint account';
 const s=agentFor(async(input,{route,run})=>{Object.assign(run,{provider:'Anthropic',inputTokens:1200,outputTokens:90});return turn(raw,[operation([field('title','Call the bank','Call the bank'),field('time','10:30 am','10:30 am')])]);});
 s.service.harness.modelPolicy=()=>({model:HAIKU_MODEL,effort:'none',timeoutMs:1000,reason:'capture'});
 await s.agent.capture({messageId:'m-trace',conversationId:await conversationOf(s.backend),text:raw});
 const t=s.traces.get('m-trace');
 assert.equal(t.words,raw);assert.equal(t.promptVersion,PROMPT_VERSION);assert.equal(t.models[0].model,HAIKU_MODEL);assert.equal(t.models[0].provider,'Anthropic');
 assert.ok(Number.isFinite(t.latencyMs));assert.equal(t.interpreted.operations[0].fields.title,'Call the bank');
 assert.equal(t.applied.status,'applied');assert.equal(t.applied.entryIds.length,1);assert.equal(t.outcome,null);
 assert.ok(s.emitted.length>=1&&s.emitted.at(-1).id==='m-trace');
 assert.equal(/Bearer|sk-or-|api[_-]?key/i.test(JSON.stringify(s.traces.list())),false);
 s.traces.handEdit(t.applied.entryIds[0]);assert.equal(s.traces.get('m-trace').outcome,'edited');
});

test('a question gets an answer card and changes nothing',async()=>{
 const raw='Is my afternoon free for a long call?';
 const s=agentFor(async()=>turn(raw,[],{mode:'query',draftMode:'none',reply:'Your afternoon is free after 3.',decisions:[{sourceId:'s0',disposition:'question',note:null}],card:{kind:'agenda',day:'2026-09-16',targetId:null}}));
 const r=await s.agent.capture({messageId:'m-q',conversationId:await conversationOf(s.backend),text:raw});
 assert.equal(r.applied,null);assert.equal((await s.backend.load()).entries.length,0);
 const card=await latest(s.backend);assert.deepEqual(card.card,{kind:'agenda',day:'2026-09-16',targetId:null});assert.equal(card.reply,'Your afternoon is free after 3.');
 assert.equal(s.traces.get('m-q').applied.status,'answered');
});

test('an unknown create time saves immediately with missing data, its question as a note and Undo',async()=>{
 const raw='Call Alex at tea time';
 const s=agentFor(async()=>turn(raw,[operation([field('title','Call Alex','Call Alex'),field('time',null,null,'stated','unknown')])],{question:{opId:'task1',field:'time',prompt:'Morning or evening?',options:[]}}));
 const conversationId=await conversationOf(s.backend);
 const r=await s.agent.capture({messageId:'m-alex',conversationId,text:raw});
 assert.equal(r.applied.status,'applied');
 const data=await s.backend.load(),card=await latest(s.backend);
 assert.equal(data.entries.length,1);assert.equal(data.entries[0].planned,null);assert.equal(data.entries[0].raw,raw);
 assert.deepEqual(card.draft.missing,[{opId:'task1',field:'time'}]);
 assert.equal(card.draft.question,null);assert.ok(card.draft.notes.includes('Morning or evening?'));
 assert.ok(!card.draft.operations[0].fields.some(f=>f.name==='time'));
 await s.agent.undo({draftId:r.draftId,conversationId,actionId:'undo-missing'});
 assert.equal((await s.backend.load()).entries.length,0);
 assert.equal((await s.backend.load()).intentV2.captures['m-alex'].raw,raw);
});

test('an edit of an earlier capture can target the task it made, even when no word matches',async()=>{
 const seed=freshStore();const id=editPlan(seed,{type:'saveTask',fields:{title:'Call the bank',planned:'2026-09-16T05:00:00.000Z'}},NOW);
 Object.assign(seed.entries.find(e=>e.id===id),{source:'intent-v2',raw:'call the bank at 10:30'});
 const raw='actually make that 5 pm';let seen;
 const s=agentFor(async input=>{seen=input;return turn(raw,[operation([field('time','5 pm','5 pm')],{opId:'later',kind:'update',targetId:String(id)})]);},{seed,snapshot:async({data})=>planSnapshot(data,{now:NOW,timezone:'Asia/Kolkata'})});
 const r=await s.agent.capture({messageId:'m-later',conversationId:await conversationOf(s.backend),text:raw});
 assert.equal(r.applied.status,'applied');
 assert.equal(seen.snapshot.recentlyCaptured[0].id,String(id));assert.equal(seen.snapshot.recentlyCaptured[0].fromWords,'call the bank at 10:30');
 assert.equal(new Date((await s.backend.load()).entries[0].planned).getUTCHours(),11);
});

test('one ramble creates linked kinds, reminders and alarms with one Undo',async()=>{
 const raw='Create a Project called Studio launch and a Life area called Creative work. My Result is First episode published, because I want to share my craft. Put it in Studio launch. Under it, remind me to Write outline tomorrow at 10am and set an alarm to Record intro tomorrow at 11am.';
 const output=()=>turn(raw,[
  operation([field('title','Write outline','Write outline'),field('blockId','$result',null,'suggested'),field('time','tomorrow at 10am','tomorrow at 10am'),field('alert','reminder','remind me')],{opId:'outline',sourceId:'s3'}),
  operation([field('title','Record intro','Record intro'),field('blockId','$result',null,'suggested'),field('time','tomorrow at 11am','tomorrow at 11am'),field('alert','alarm','alarm')],{opId:'record',sourceId:'s3'}),
  operation([field('title','First episode published','First episode published'),field('purpose','I want to share my craft','I want to share my craft'),field('projectId','$studio',null,'suggested')],{opId:'result',entity:'block',sourceId:'s1'}),
  operation([field('title','Studio launch','Studio launch')],{opId:'studio',entity:'project'}),
  operation([field('title','Creative work','Creative work')],{opId:'creative',entity:'area'}),
 ]);
 const s=agentFor(async()=>output()),conversationId=await conversationOf(s.backend);
 const before=await s.backend.load();
 const result=await s.agent.capture({messageId:'ramble',conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal(result.applied.needsConfirm,false);
 const data=await s.backend.load(),card=await latest(s.backend);
 assert.equal(card.draft.receipt.changes.length,5);
 const project=data.planner.projects.find(p=>p.title==='Studio launch'),block=data.planner.blocks.find(b=>b.title==='First episode published');
 assert.ok(project);assert.equal(block.projectId,project.id);assert.equal(block.purpose,'I want to share my craft');
 assert.equal(data.planner.areas.find(a=>a.title==='Creative work').title,'Creative work');
 assert.deepEqual(data.entries.map(e=>[e.title,e.blockId,e.alertIntent.type,e.raw]),[
  ['Write outline',block.id,'reminder',raw],['Record intro',block.id,'alarm',raw],
 ]);
 assert.equal(data.entries[0].planned,'2026-09-17T04:30:00.000Z');assert.equal(data.entries[1].planned,'2026-09-17T05:30:00.000Z');
 assert.deepEqual(card.draft.missing,[]);
 await s.agent.undo({draftId:result.draftId,conversationId,actionId:'undo-ramble'});
 const after=await s.backend.load();
 assert.deepEqual(after.entries,before.entries);
 for(const collection of ['blocks','projects','areas'])assert.deepEqual(planner(after)[collection],planner(before)[collection]);
 assert.equal(after.intentV2.captures.ramble.raw,raw);
});

test('an unreadable create time saves undated with its review notice and one Undo',async()=>{
 const raw='Call Alex at tea time',s=agentFor(async()=>turn(raw,[operation([field('title','Call Alex','Call Alex'),field('time','tea time','tea time')])]));
 const conversationId=await conversationOf(s.backend);
 const result=await s.agent.capture({messageId:'review-time',conversationId,text:raw});
 assert.equal(result.applied.status,'applied');
 const data=await s.backend.load(),card=await latest(s.backend);
 assert.equal(data.entries[0].planned,null);assert.equal(data.entries[0].raw,raw);
 assert.deepEqual(card.draft.missing,[{opId:'task1',field:'time'}]);
 assert.equal(card.draft.schedulePreview.items[0].status,'review');
 assert.ok(card.draft.notes.includes(card.draft.schedulePreview.items[0].reason));assert.ok(card.draft.applied.warning);
 await s.agent.undo({draftId:result.draftId,conversationId,actionId:'undo-review-time'});
 assert.equal((await s.backend.load()).entries.length,0);
});

test('a follow-up provenance concern saves a create with a notice and Undo',async()=>{
 const raw='Make it into a project',s=agentFor(async()=>turn(raw,[operation([field('title','Freelance studio',raw)],{entity:'project'})]));
 const conversationId=await conversationOf(s.backend);
 const result=await s.agent.capture({messageId:'follow-notice',conversationId,text:raw});
 assert.equal(result.applied.status,'applied');assert.equal(result.calls,1);
 const card=await latest(s.backend);assert.match(card.draft.notes.join(' '),/title.*original words/i);
 assert.equal((await s.backend.load()).planner.projects[0].title,'Freelance studio');
 await s.agent.undo({draftId:result.draftId,conversationId,actionId:'undo-follow-notice'});
 assert.equal(planner(await s.backend.load()).projects.length,0);
});

test('a time review on a saved task still blocks and leaves saved data untouched',async()=>{
 const seed=withTask({planned:'2026-09-17T07:30:00.000Z'}),raw='Move Run to tea time';
 const s=agentFor(async()=>turn(raw,[operation([field('time','tea time','tea time')],{kind:'update',targetId:'1'})]),{seed});
 const result=await s.agent.capture({messageId:'saved-review',conversationId:await conversationOf(s.backend),text:raw});
 assert.equal(result.applied.status,'needs-time');assert.deepEqual((await s.backend.load()).entries,seed.entries);
});
