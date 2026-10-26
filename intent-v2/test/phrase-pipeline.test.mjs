import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PHRASE_SCHEMA,phrasePrompt,readPhraseOutput,phraseSchedule} from '../src/phrase-pipeline.mjs';
import {sourceUnits} from '../src/context.mjs';
import {targetModules,runCase} from '../../scripts/capture-stress/runtime.mjs';
import {nativeModelTransport,providerSchema} from '../adapters/transport.mjs';
import {MODEL_ROUTES} from '../src/model-policy.mjs';

const now=new Date('2026-10-19T10:00:00+05:30');
const operation=(title,timePhrase=null,extra={})=>({opId:'one',sourceId:'s0',kind:'create',entity:'task',targetId:null,title,timePhrase,removalWords:null,clearTime:false,fields:[],...extra});
function output(raw,operations,extra={}){return {schemaVersion:1,mode:'capture',draftMode:'new',answer:null,decisions:sourceUnits(raw).map(s=>({sourceId:s.id,disposition:operations.some(o=>o.sourceId===s.id)?'action':'reference',note:null})),operations,question:null,clarification:null,memoryCandidates:[],card:null,...extra};}
function read(raw,ops){const units=sourceUnits(raw);return readPhraseOutput(output(raw,ops),{input:{original:raw,sourceUnits:units,context:{entities:[{entity:'task',id:'203',title:'Dentist'}]}},units,messageId:'test',visibleEntities:[{entity:'task',id:'203'}],activeDraft:null}).parsed;}

test('phrase shape excludes model clocks, minutes and mutation replies',()=>{
 assert.equal(PHRASE_SCHEMA.properties.reply,undefined);
 const names=PHRASE_SCHEMA.properties.operations.items.properties.fields.items.properties.name.enum;
 for(const name of ['title','time','minutes'])assert.ok(!names.includes(name));
});
test('one copied p.m. phrase crosses mechanical sentence units and parses once',()=>{
 const raw='Have a shower tomorrow evening at 6:00 p.m.';
 const parsed=read(raw,[operation('Have a shower','tomorrow evening at 6:00 p.m.')]);
 const time=phraseSchedule({data:{},draft:parsed,anchor:now}).items[0];
 assert.equal(time.planned,'2026-10-20T12:30:00.000Z');
 assert.equal(time.source,'tomorrow evening at 6:00 p.m.');
});
test('another sentence and a negated removal never authorize an archive',()=>{
 for(const raw of ["Don't remove the dentist task",'Dentist. Clear the table'])assert.throws(()=>read(raw,[operation(null,null,{kind:'archive',targetId:'203',removalWords:sourceUnits(raw)[0].text})]),{code:'NO_REMOVAL_INTENT'});
 assert.equal(read('Dentist is not happening, remove it',[operation(null,null,{kind:'archive',targetId:'203',removalWords:'Dentist is not happening, remove it'})]).operations[0].kind,'archive');
});
test('prototype native transport requests and validates its exact schema',async()=>{
 const raw='Read for 20 min',turn=output(raw,[operation('Read','for 20 min')]);
 const model=nativeModelTransport({native:async(_,request)=>{
  assert.deepEqual(request.body.output_config.format.schema,providerSchema(PHRASE_SCHEMA));
  assert.equal(request.body.system[0].text,phrasePrompt);
  return {status:200,body:{model:'claude-haiku-5-5',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(turn)}]}};
 },model:MODEL_ROUTES.quick.model,prompt:phrasePrompt,schema:PHRASE_SCHEMA});
 assert.deepEqual(await model({},{route:MODEL_ROUTES.quick}),turn);
});

test('prototype saves literal time, duration, unreadable phrase and actual receipt with Undo',async t=>{
 const modules=await targetModules(fileURLToPath(new URL('../..',import.meta.url)));
 const temp=await mkdtemp(path.join(os.tmpdir(),'rpm-phrase-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 for(const [i,raw,phrase,time,minutes] of [
  [0,'Meeting from 10am to 11am','from 10am to 11am','2026-10-19T04:30:00.000Z',60],
  [1,'Exercise now 30 min','now 30 min','2026-10-19T04:30:00.000Z',30],
  [2,'Read for 20 min','for 20 min',null,20],
  [3,'Read someday','someday',null,null],
 ]){
  const result=await runCase({id:`phrase-${i}`,turns:[{text:raw}],expect:{created:[{entity:'task',words:[]}],maxNew:1,undo:true,changes:[],forbidden:[]}},
   {modules,directory:path.join(temp,String(i)),pipeline:'phrase',modelOverride:async()=>({output:output(raw,[operation(raw.split(' ')[0],phrase)])})});
  assert.deepEqual(result.failures,[]);
  const saved=result.saved.newTasks[0],turn=result.turns[0];
  assert.equal(saved.planned??null,time);assert.equal(saved.minutes,minutes);
  assert.equal(saved.raw,raw);assert.ok(turn.undoId);
  assert.equal(turn.draft.reply,`Created: ${saved.title}.`);
  assert.equal(turn.capture.reply,turn.draft.reply);
  assert.equal(saved.interpretation.source,phrase);
  if(phrase==='someday'){assert.match(saved.notes,/someday/);assert.ok(turn.draft.missing.some(m=>m.field==='time'));}
  const {data:seed}=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(temp,String(i),'seed.json'),'utf8'));
  const final=JSON.parse(await (await import('node:fs/promises')).readFile(result.artifacts.final,'utf8'));
  modules.undo.undo(final,turn.undoId);assert.equal(final.entries.length,seed.entries.length);
 }
});

test('unreadable saved-item update saves undated with review, receipt and Undo',async t=>{
 const modules=await targetModules(fileURLToPath(new URL('../..',import.meta.url)));
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpm-phrase-update-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const raw='Move Read to someday',testCase={id:'phrase-update',saved:[{id:201,title:'Read',planned:'2026-10-21T18:00:00+05:30',minutes:20}],turns:[{text:raw}],expect:{created:[],maxNew:0,forbidden:[],changes:[{id:201,kind:'update',day:null,time:null}],undo:true}};
 const result=await runCase(testCase,{modules,directory,pipeline:'phrase',modelOverride:async()=>({output:output(raw,[operation(null,'someday',{kind:'update',targetId:'201'})])})});
 assert.deepEqual(result.failures,[]);
 const final=JSON.parse(await (await import('node:fs/promises')).readFile(result.artifacts.final,'utf8'));
 assert.equal(final.entries.find(e=>e.id===201).planned,null);
 assert.match(final.entries.find(e=>e.id===201).notes,/someday/);
 assert.match(result.turns[0].draft.notes.join(' '),/Saved undated/);
 assert.equal(result.turns[0].draft.reply,'Changed: Read.');
 modules.undo.undo(final,result.turns[0].undoId);
 assert.equal(final.entries.find(e=>e.id===201).planned,'2026-10-21T12:30:00.000Z');
});

test('code preserves a saved clock on a day move and a future day on a clock change',()=>{
 const data={entries:[{id:201,title:'Read',planned:'2026-10-21T18:00:00+05:30'}]};
 const schedule=phrase=>phraseSchedule({data,draft:{operations:[{opId:'one',kind:'update',targetId:'201',fields:[{name:'time',op:'set',value:phrase}]}]},anchor:now}).items[0];
 assert.equal(schedule('tomorrow').planned,'2026-10-20T12:30:00.000Z');
 assert.equal(schedule('at 5pm').planned,'2026-10-21T11:30:00.000Z');
});

test('an invented time phrase becomes a visible missing field instead of an invented clock',()=>{
 const parsed=read('Read tomorrow',[operation('Read','next Tuesday')]);
 assert.equal(parsed.operations[0].fields.find(f=>f.name==='time').op,'unknown');
 assert.match(parsed.notice,/not copied/);
});
