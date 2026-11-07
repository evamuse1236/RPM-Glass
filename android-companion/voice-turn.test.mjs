import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan,planner,blockTasks} from './planner-state.mjs';
import {createRamble,applyRamble,recordWords,undoRamble,MAX_RAMBLE_OPS} from './voice-turn.mjs';
import {TOOLS,liveSetup,planView,offsetOf} from './voice-tools.mjs';
import {TZ,NOW,call,tools,said,heard,turnDone,day,reply,words} from './voice-turn-fixtures.mjs';

test('one ramble adds, completes, retimes and removes, then one Undo takes it all back and keeps the words', () => {
 const {data,ids}=day(),before={entries:structuredClone(data.entries),planner:structuredClone(data.planner)};
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('Call mom tomorrow at 8 pm, finish Raj, gym at 8, delete groceries'));r.stop();
 assert.equal(r.state.wordsReady,false,'the transcript may still be arriving');
 assert.ok(reply(r,tools(call('get_plan')))[0].inbox.some(t=>t.title==='Call Raj'));
 assert.equal(r.state.wordsReady,true);
 assert.equal(recordWords(data,r.state.heard,words),true);
 assert.equal(data.intentV2.captures['m-1'].status,'captured','words are saved before any change');
 const [added]=reply(r,tools(call('save_task',{title:'Call mom',start:'2026-10-28T20:00:00+05:30',alert:'reminder',alertLead:10}),call('save_task',{id:ids.raj,done:true}),call('save_task',{id:ids.gym,start:'2026-10-27T20:00:00+05:30'}),call('delete_task',{id:ids.milk})));
 r.receive(turnDone);assert.equal(r.state.phase,'working');
 r.receive(said('Done: four changes.'));assert.equal(r.state.phase,'speaking');
 r.receive(turnDone);assert.equal(r.state.phase,'done');
 const result=r.result();
 assert.equal(result.batch.ops.length,4);
 assert.deepEqual(applyRamble(data,result,words),{status:'applied',undo:true});
 const task=id=>data.entries.find(e=>e.id===id);
 assert.equal(task(added.saved).title,'Call mom');assert.equal(task(added.saved).alertIntent.lead,10);
 assert.equal(task(ids.raj).done,true);assert.equal(task(ids.milk).archived,true);
 assert.equal(task(ids.gym).planned,'2026-10-27T14:30:00.000Z');
 const capture=data.intentV2.captures['m-1'];
 assert.equal(capture.raw,'Call mom tomorrow at 8 pm, finish Raj, gym at 8, delete groceries');
 assert.equal(capture.status,'interpreted');assert.equal(capture.reply,'Done: four changes.');
 undoRamble(data,'m-1',NOW);
 assert.deepEqual(data.entries,before.entries);
 assert.throws(()=>undoRamble(data,'m-1',NOW),/nothing to undo/);
 assert.deepEqual(planner(data).blocks,before.planner.blocks);
 assert.equal(data.intentV2.captures['m-1'].raw.startsWith('Call mom'),true,'words survive Undo');
});

test('a new Block keeps its id when the ramble is saved on data another writer changed', () => {
 const {data,ids}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('New block: ship the app, because users wait. Put gym in Get fit, first.'));r.stop();
 const [block]=reply(r,tools(call('save_block',{title:'Ship the app',purpose:'Users wait'})));
 const [task]=reply(r,tools(call('save_task',{title:'Write release notes',blockId:block.saved})));
 reply(r,tools(call('move_task',{id:ids.gym,blockId:ids.fit})));
 const [refused]=reply(r,tools(call('order_block',{blockId:ids.fit,ids:[ids.raj]})));
 assert.match(refused.error,/from that Block/);
 const [,ordered]=reply(r,tools(call('save_task',{id:ids.raj,blockId:ids.fit}),call('order_block',{blockId:ids.fit,ids:[ids.raj,ids.gym]})));
 assert.deepEqual(ordered,{saved:ids.gym});
 r.receive(turnDone);r.receive(turnDone);
 editPlan(data,{type:'saveEntity',collection:'areas',fields:{title:'Work'}},NOW);
 assert.equal(applyRamble(data,r.result(),words).status,'applied');
 assert.equal(data.entries.find(e=>e.id===task.saved).blockId,block.saved);
 assert.deepEqual(blockTasks(data,ids.fit).map(t=>t.id),[ids.raj,ids.gym]);
 assert.ok(planner(data).areas.some(a=>a.title==='Work'),'the other writer\'s change stays');
});

test('a replay that would give a new task a different id applies nothing and keeps the words for Retry', () => {
 const {data}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('Add pay rent'));r.stop();reply(r,tools(call('save_task',{title:'Pay rent'})));r.receive(turnDone);r.receive(turnDone);
 editPlan(data,{type:'saveTask',fields:{title:'Added on the website'}},NOW);
 const count=data.entries.length,outcome=applyRamble(data,r.result(),words);
 assert.equal(outcome.status,'words-kept');assert.equal(data.entries.length,count);
 assert.equal(data.intentV2.captures['m-1'].status,'captured');assert.ok(data.intentV2.captures['m-1'].lastError);
});

test('a dropped connection keeps the words with an error and saves no changes', () => {
 const {data}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('Plan my week'));r.stop();r.fail('Voice connection closed.');
 assert.equal(r.state.phase,'failed');
 const count=data.entries.length;
 assert.equal(applyRamble(data,r.result(),words).status,'words-kept');
 assert.equal(data.entries.length,count);assert.equal(data.intentV2.captures['m-1'].raw,'Plan my week');
});

test('a tool call naming something missing answers the model with the problem and saves nothing for it', () => {
 const {data}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});r.receive(heard('delete task 999'));r.stop();
 const [answer]=reply(r,tools(call('delete_task',{id:999})));
 assert.match(answer.error,/No task 999/);assert.equal(r.result().batch,null);assert.equal(r.state.errors.length,1);
});

test('Blocks, Projects and Areas are added, changed, linked and removed with existing planner ops', () => {
 const {data,ids}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});r.receive(heard('Sort out health, then remove the Block and the Project'));r.stop();
 const project=planner(data).projects[0].id;
 reply(r,tools(call('save_block',{id:ids.fit,title:'Get fit',purpose:'Feel strong',projectId:project})));
 const [area]=reply(r,tools(call('save_area',{title:'Health',purpose:'Body',rating:6})));
 reply(r,tools(call('save_area',{id:area.saved,title:'Health and body'})));
 reply(r,tools(call('save_project',{id:project,title:'Health',purpose:'Long life'})));
 reply(r,tools(call('move_task',{id:ids.gym,blockId:ids.fit})));
 reply(r,tools(call('delete_block',{id:ids.fit})));
 reply(r,tools(call('delete_project',{id:project})));
 r.receive(turnDone);r.receive(turnDone);
 assert.deepEqual(r.state.errors,[]);
 assert.equal(applyRamble(data,r.result(),words).status,'applied');
 const p=planner(data);
 assert.equal(p.blocks.length,0);assert.equal(p.projects.length,0);
 assert.deepEqual(p.areas.map(a=>[a.title,a.purpose,a.rating]),[['Health and body','Body',6]]);
 assert.equal(data.entries.find(e=>e.id===ids.gym).blockId,null,'a removed Block sends its tasks to the Inbox');
});

test('a Block joins an Area through a new Goal of this year that holds its Project, and one Undo takes it back', () => {
 const {data,ids}=day();
 const project=planner(data).projects[0].id;
 editPlan(data,{type:'saveEntity',collection:'blocks',id:ids.fit,fields:{title:'Get fit',purpose:'Energy',projectId:project}},NOW);
 const area=editPlan(data,{type:'saveEntity',collection:'areas',fields:{title:'Health'}},NOW);
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});r.stop();
 const [view]=reply(r,tools(call('get_plan')));
 assert.deepEqual(view.projects.map(x=>x.goalId),[null]);assert.deepEqual(view.goals,[]);
 const [goal]=reply(r,tools(call('save_goal',{title:'Strong body',areaId:area})));
 reply(r,tools(call('save_project',{id:project,goalId:goal.saved})));
 const [again]=reply(r,tools(call('get_plan')));
 assert.deepEqual(again.goals,[{id:goal.saved,title:'Strong body',purpose:null,areaId:area,year:2026}]);
 r.receive(turnDone);r.receive(turnDone);
 assert.deepEqual(r.state.errors,[]);
 assert.deepEqual(r.state.changes.map(c=>[c.kind,c.entity,c.title]),[['add','goal','Strong body'],['change','project','Health']]);
 applyRamble(data,r.result(),words);
 const p=planner(data),saved=p.goals[0];
 assert.deepEqual([saved.areaId,saved.year,saved.horizon],[area,2026,'yearly']);
 assert.equal(p.projects[0].goalId,saved.id);
 undoRamble(data,'m-1',NOW);
 assert.equal(planner(data).goals.length,0);assert.equal(planner(data).projects[0].goalId,null);
});

test('changing a Goal keeps its unspoken Area, year and horizon; removing it frees its Projects', () => {
 const {data}=day();
 const area=editPlan(data,{type:'saveEntity',collection:'areas',fields:{title:'Health'}},NOW);
 const goal=editPlan(data,{type:'saveEntity',collection:'goals',fields:{title:'Run',areaId:area,year:2025,horizon:'quarterly',period:3}},NOW);
 const project=planner(data).projects[0].id;
 editPlan(data,{type:'saveEntity',collection:'projects',id:project,fields:{title:'Health',goalId:goal}},NOW);
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});r.stop();
 reply(r,tools(call('save_goal',{id:goal,title:'Run far'}),call('save_project',{id:project,title:'Body'})));
 r.receive(turnDone);r.receive(turnDone);
 const kept=structuredClone(data);applyRamble(kept,r.result(),words);
 const g=planner(kept).goals[0];
 assert.deepEqual([g.title,g.areaId,g.year,g.horizon,g.period],['Run far',area,2025,'quarterly',3]);
 assert.equal(planner(kept).projects[0].goalId,goal,'a Project change that names no Goal keeps its Goal');
 const d=createRamble({data,timeZone:TZ,now:()=>NOW});d.receive(heard('Add Swim and delete the Run goal'));d.stop();
 const [missing,removed]=reply(d,tools(call('save_goal',{title:'Swim',areaId:'area-x'}),call('delete_goal',{id:goal})));
 assert.match(missing.error,/No area area-x/);assert.equal(removed.saved,null);
 d.receive(turnDone);d.receive(turnDone);applyRamble(data,d.result(),words);
 assert.equal(planner(data).goals.length,0);assert.equal(planner(data).projects[0].goalId,null);
});

test('a time replaces a task\'s day and a day replaces its time, even when the model sends both', () => {
 const {data,ids}=day();
 editPlan(data,{type:'saveTask',id:ids.raj,fields:{plannedDate:'2026-10-28'}},NOW);
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});r.stop();
 reply(r,tools(call('save_task',{id:ids.raj,start:'2026-10-29T20:00:00+05:30',day:'2026-10-29'}),call('save_task',{id:ids.gym,day:'2026-10-30'})));
 r.receive(turnDone);r.receive(turnDone);
 assert.deepEqual(r.state.errors,[]);
 applyRamble(data,r.result(),words);
 const raj=data.entries.find(e=>e.id===ids.raj),gym=data.entries.find(e=>e.id===ids.gym);
 assert.deepEqual([raj.planned,raj.plannedDate],['2026-10-29T14:30:00.000Z',null]);
 assert.deepEqual([gym.planned,gym.plannedDate],[null,'2026-10-30']);
});

test('the prompt says Blocks have no order of their own and how voice moves one up', () => {
 const text=liveSetup(NOW,TZ).systemInstruction.parts[0].text;
 assert.match(text,/Blocks have no order of their own/);
 assert.match(text,/To put a Project in an Area, give it a Goal of that Area/);
});

test('reopening a done task and taking a Block out of its Project', () => {
 const {data,ids}=day();
 const project=planner(data).projects[0].id;
 editPlan(data,{type:'saveTask',id:ids.raj,fields:{done:true}},NOW);
 editPlan(data,{type:'saveEntity',collection:'blocks',id:ids.fit,fields:{title:'Get fit',purpose:'Energy',projectId:project}},NOW);
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});r.stop();
 reply(r,tools(call('save_task',{id:ids.raj,done:false}),call('save_block',{id:ids.fit,projectId:null})));
 r.receive(turnDone);r.receive(turnDone);
 applyRamble(data,r.result(),words);
 assert.equal(data.entries.find(e=>e.id===ids.raj).done,false);
 const block=planner(data).blocks[0];assert.equal(block.projectId,null);assert.equal(block.purpose,'Energy','unspoken fields stay');
});

test(`a ramble holds at most ${MAX_RAMBLE_OPS} changes`, () => {
 const {data}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});r.stop();
 for(let i=0;i<MAX_RAMBLE_OPS;i++)reply(r,tools(call('save_task',{title:`Task ${i}`})));
 const [over]=reply(r,tools(call('save_task',{title:'One too many'})));
 assert.match(over.error,/too many changes/);assert.equal(r.result().batch.ops.length,MAX_RAMBLE_OPS);
 assert.equal(applyRamble(data,(r.receive(turnDone),r.receive(turnDone),r.result()),words).status,'applied');
});

test('the ramble Undo refuses once the plan changed after it, so it never takes back a later edit', () => {
 const {data}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('Add stretch'));r.stop();reply(r,tools(call('save_task',{title:'Stretch'})));r.receive(turnDone);r.receive(turnDone);
 applyRamble(data,r.result(),words);
 editPlan(data,{type:'saveTask',fields:{title:'Typed in the planner'}},NOW);
 assert.throws(()=>undoRamble(data,'m-1',NOW),/changed the plan after/);
 assert.ok(data.entries.some(e=>e.title==='Stretch'));
});

test('the Live setup carries every tool, the local offset and manual turns', () => {
 const setup=liveSetup(NOW,TZ);
 assert.deepEqual(setup.tools[0].functionDeclarations.map(f=>f.name),TOOLS.map(t=>t.name));
 assert.match(setup.systemInstruction.parts[0].text,/offset \+05:30/);
 assert.equal(setup.realtimeInputConfig.automaticActivityDetection.disabled,true);
 assert.equal(offsetOf(new Date('2026-07-01T12:00:00Z'),'America/New_York'),'-04:00');
 assert.deepEqual(Object.keys(planView(freshStore(),TZ)),['inbox','blocks','projects','goals','areas','trash']);
});

test('the model asking twice for the same new task in one ramble adds it once and answers with the first id', () => {
 const {data}=day(),r=createRamble({data,timeZone:TZ,now:()=>NOW});
 r.receive(heard('Buy milk tomorrow'));r.stop();
 const [first]=reply(r,tools(call('save_task',{title:'Buy milk',day:'2026-10-28'})));
 const [again]=reply(r,tools(call('save_task',{title:'buy milk ',day:'2026-10-28'})));
 assert.deepEqual(again,first);
 const out=r.result();
 assert.equal(out.created.length,1);
 assert.equal(out.changes.length,1);
 assert.equal(out.batch.ops.length,1);
 const [other]=reply(r,tools(call('save_task',{title:'Buy milk',day:'2026-10-29'})));
 assert.notEqual(other.saved,first.saved,'the same title on another day is a new task');
});

const ramble=(data,words,undoSaved=true)=>{const r=createRamble({data,timeZone:TZ,now:()=>NOW,undoSaved});r.receive(heard(words));r.stop();return r;};

test('31 Oct: voice removes or completes only when the words ask, and a yes answers its question', () => {
 const {data,ids}=day();
 const [binned]=reply(ramble(data,'el juego'),tools(call('delete_task',{id:ids.gym})));
 assert.match(binned.error,/did not ask to remove/);
 const r=ramble(data,'it needs at least 10 GB');
 const [ticked]=reply(r,tools(call('save_task',{id:ids.raj,done:true})));
 assert.match(ticked.error,/did not say this is done/);assert.equal(r.result().batch,null);
 assert.equal(reply(ramble(data,'yes, go ahead'),tools(call('delete_task',{id:ids.gym})))[0].saved,ids.gym);
 assert.equal(reply(ramble(data,'I finished calling Raj'),tools(call('save_task',{id:ids.raj,done:true})))[0].saved,ids.raj);
});

test('31 Oct: "restore them" brings tasks back from the Trash and never adds copies', () => {
 const {data,ids}=day();
 editPlan(data,{type:'archiveTask',id:ids.gym},NOW);
 assert.deepEqual(planView(data,TZ).trash,[{id:ids.gym,title:'Gym evening'}]);
 const r=ramble(data,'restore them');
 const [copy,back]=reply(r,tools(call('save_task',{title:'gym evening'}),call('restore_task',{id:ids.gym})));
 assert.match(copy.error,/in the Trash as task \d+\. Use restore_task/);
 assert.equal(back.saved,ids.gym);r.receive(turnDone);r.receive(turnDone);
 applyRamble(data,r.result(),words);
 const gyms=data.entries.filter(e=>e.title==='Gym evening');
 assert.deepEqual(gyms.map(e=>e.archived),[false],'one live Gym task, no copies');
});

test('a second task with a saved title is refused unless they ask for a duplicate', () => {
 const {data}=day();
 const [twin,second]=reply(ramble(data,'add call raj'),tools(call('save_task',{title:'Call Raj'}),call('save_task',{title:'Call Raj',duplicate:true})));
 assert.match(twin.error,/already saved as task/);assert.equal(typeof second.saved,'number');
});

test('a start time that has passed is refused until they confirm it', () => {
 const {data,ids}=day(),past='2026-10-27T15:00:00+05:30';
 const r=ramble(data,"it's not for tomorrow, it's today at 3");
 const [asked,saved]=reply(r,tools(call('save_task',{id:ids.raj,start:past}),call('save_task',{id:ids.raj,start:past,pastOk:true})));
 assert.match(asked.error,/already passed/);assert.equal(saved.saved,ids.raj);
});

test('"undo that" drops the last change in this ramble, or takes back the previous voice change', () => {
 const {data,ids}=day();
 const r=ramble(data,'add swim, call it off, undo that');
 reply(r,tools(call('save_task',{title:'Swim'})));
 assert.deepEqual(reply(r,tools(call('undo_last'))),[{undone:'Swim'}]);
 assert.equal(r.result().batch,null);
 const first=ramble(data,'move gym to tomorrow at 7 pm');
 reply(first,tools(call('save_task',{id:ids.gym,start:'2026-10-28T19:00:00+05:30'})));first.receive(turnDone);first.receive(turnDone);
 applyRamble(data,first.result(),words);
 const moved=data.entries.find(e=>e.id===ids.gym).planned;assert.notEqual(moved,'2026-10-27T13:00:00.000Z');
 const second=ramble(data,'undo that');
 assert.deepEqual(reply(second,tools(call('undo_last'))),[{undone:'Gym evening'}]);
 second.receive(turnDone);second.receive(turnDone);
 assert.equal(applyRamble(data,second.result(),{...words,messageId:'m-2'}).status,'applied');
 assert.equal(data.entries.find(e=>e.id===ids.gym).planned,'2026-10-27T13:00:00.000Z');
 assert.equal(data.intentV2.captures['m-1'].voice.undone,true);
 assert.match(reply(ramble(data,'undo that'),tools(call('undo_last')))[0].error,/no voice change to undo/);
 assert.match(reply(ramble(data,'undo that',false),tools(call('undo_last')))[0].error,/Use the Undo button/,'one press per ramble cannot undo a saved one');
});

test('the prompt says what "it" means, ignores speech that is not a request, and asks before removing', () => {
 const prompt=liveSetup(NOW,TZ).systemInstruction.parts[0].text;
 assert.match(prompt,/"It", "that" and "them" mean the items you changed last/);
 assert.match(prompt,/not a request to you.*change nothing/);
 assert.match(prompt,/ask before you remove or complete/);
 assert.ok(TOOLS.some(t=>t.name==='restore_task')&&TOOLS.some(t=>t.name==='undo_last'));
});
