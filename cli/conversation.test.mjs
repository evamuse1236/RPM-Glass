import test from 'node:test';
import assert from 'node:assert/strict';
import {Workflow,emptyData} from './workflow.mjs';
import {createOpenRouter,MODEL} from './openrouter.mjs';
import {editPatch,editDuration,editTargets} from './edits.mjs';
import {actionsFor,bubble,entryBubble,timeChoices} from './bubbles.mjs';

process.env.TZ='Asia/Kolkata';
const now=()=>new Date('2026-09-09T23:30:00+05:30');
const change=(field,value,op='set')=>({field,value,op,evidence:[]});
const edit=(target,changes)=>({target,targetEvidence:null,changes,clarification:null});
function model(proposal){
  return createOpenRouter({apiKey:'test-only-token',fetchImpl:async(_url,options)=>{
    const raw=JSON.parse(JSON.parse(options.body).messages[1].content).text;
    const request=structuredClone(proposal);request.targetEvidence=request.target?raw:null;
    request.changes.forEach(c=>c.evidence=[raw]);
    return new Response(JSON.stringify({model:MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'edit',entries:[],feelings:{mood:null,energy:null,evidence:[]},edit:request})}}]}));
  }});
}
function setup(proposal){
  const w=new Workflow(emptyData(),{now});
  w.send('Meeting with Riya tomorrow at 9am for 45 minutes');
  w.interpreter=model(proposal);
  return w;
}

test('a natural shift changes one saved plan and keeps original text and its alarm lead',async()=>{
  const w=setup(edit('meeting',[change('time','one hour later','shift')]));
  const original=structuredClone(w.get());
  const result=await w.sendAsync('Move that meeting one hour later');
  assert.match(result,/Changed/);assert.equal(w.data.entries.length,1);assert.equal(w.get().id,1);
  assert.equal(w.get().planned,'2026-09-10T04:30:00.000Z');assert.equal(w.get().alert.at,'2026-09-10T04:20:00.000Z');
  assert.equal(w.get().raw,original.raw);assert.equal(w.get().created,original.created);assert.equal(w.get().minutes,45);
  assert.equal(w.get().revisions[0].snapshot.planned,original.planned);assert.match(w.get().revisions.at(-1).reason,/Move that meeting/);
  assert.equal(w.data.interactions.at(-1).raw,'Move that meeting one hour later');
});
test('two matching plans need a choice and the reply edits only the chosen target',async()=>{
  const proposal=edit('meeting',[change('time','one hour later','shift')]);
  const w=setup(proposal);w.interpreter=null;w.send('Meeting with Sam tomorrow at 3pm');w.interpreter=model(proposal);
  const first=w.get(1).planned,second=w.get(2).planned;
  await w.sendAsync('Move the meeting one hour later');
  assert.equal(w.pending.kind,'edit_target');assert.equal(w.get(1).planned,first);assert.equal(w.get(2).planned,second);assert.equal(w.data.entries.length,2);
  await w.sendAsync('2');assert.equal(w.get(1).planned,first);assert.equal(new Date(w.get(2).planned)-new Date(second),3600000);
});
test('a name can select an older entry without uploading any stored text',async()=>{
  const proposal=edit('meeting with Riya',[change('time','Friday at 10am')]);
  const w=setup(proposal);w.interpreter=null;w.send('Buy milk tomorrow at 6pm');
  let payload;
  const real=model(proposal);
  w.interpreter=async(raw,options)=>{payload={raw,options};return real(raw,options);};
  await w.sendAsync('Move the meeting with Riya to Friday at 10am');
  assert.equal(w.get(1).planned,'2026-09-11T04:30:00.000Z');assert.equal(w.get(2).title,'Buy milk tomorrow at 6pm');
  assert.deepEqual(Object.keys(payload.options).sort(),['mode','now']);assert.ok(!JSON.stringify(payload).includes('Buy milk'));
});
test('pronouns use the selected entry, but a restart does not silently select an old one',async()=>{
  const proposal=edit(null,[change('alert','reminder')]);
  const w=setup(proposal);await w.sendAsync('Make it a reminder instead');assert.equal(w.get().alert.type,'reminder');assert.equal(w.get().alert.at,w.get().planned);
  const restarted=new Workflow(w.data,{now,interpreter:model(proposal)});
  await restarted.sendAsync('Make it an alarm');assert.equal(restarted.pending.kind,'edit_target');assert.equal(restarted.get(1).alert.type,'reminder');
});
test('an unknown ID cannot match the provisional note created for the request',async()=>{
  const w=setup(edit('#2',[change('status','done')]));
  await w.sendAsync('Mark #2 done');assert.equal(w.pending.kind,'edit_target');assert.equal(w.data.entries.length,1);assert.equal(w.get(1).done,false);
});
test('a named reference still finds meetings when the model leaves its target empty',()=>{
  const entries=[{id:1,kind:'plan',title:'Meeting with Riya'},{id:2,kind:'plan',title:'Buy milk'},{id:3,kind:'plan',title:'Meeting with Sam'}];
  const proposal={...edit(null,[change('time','one hour later','shift')]),targetEvidence:'that meeting'};
  assert.deepEqual(editTargets(proposal,entries,2,now()).map(e=>e.id),[1,3]);
  assert.deepEqual(editTargets({...proposal,target:'that'},entries,2,now()).map(e=>e.id),[1,3]);
  assert.deepEqual(editTargets({...proposal,targetEvidence:'it'},entries,2,now()).map(e=>e.id),[2]);
});
test('an invalid choice number does not become a title search',async()=>{
  const proposal=edit('meeting',[change('time','one hour later','shift')]);
  const w=setup(proposal);w.interpreter=null;w.send('Meeting 9 tomorrow at 3pm');w.interpreter=model(proposal);
  await w.sendAsync('Move the meeting one hour later');const before=w.get(2).planned;
  assert.match(await w.sendAsync('9'),/Choose a listed number/);assert.equal(w.pending.kind,'edit_target');assert.equal(w.get(2).planned,before);
});
test('an ambiguous new value holds every change until a direct answer is given',async()=>{
  const proposal=edit('meeting',[change('time',null),change('alert','reminder')]);proposal.clarification='Friday morning or evening?';
  const w=setup(proposal),original=w.get().planned;
  await w.sendAsync('Move the meeting to Friday at seven and use a reminder');
  assert.equal(w.pending.kind,'edit_value');assert.equal(w.get().planned,original);assert.equal(w.get().alert.type,'alarm');
  await w.sendAsync('Friday at 7pm');assert.equal(w.get().planned,'2026-09-11T13:30:00.000Z');assert.equal(w.get().alert.type,'reminder');
});
test('canceling an edit question keeps all existing fields unchanged',async()=>{
  const proposal=edit('meeting',[change('time',null)]);proposal.clarification='What time?';
  const w=setup(proposal),original=structuredClone(w.get());
  await w.sendAsync('Move the meeting');await w.sendAsync('/cancel');assert.deepEqual(w.get(),original);
});
test('a short answer keeps the requested new day, including evening from the stated clock',async()=>{
  for(const answer of ['7pm','evening']){
    const proposal=edit('meeting',[change('alert','reminder'),change('time',null)]);proposal.clarification='Morning or evening?';
    const w=setup(proposal);await w.sendAsync('Move the meeting to Friday at seven and use a reminder');
    assert.equal(w.pending.need.field,'time');assert.equal(w.pending.options.length,2);
    await w.sendAsync(answer);assert.equal(w.get().planned,'2026-09-11T13:30:00.000Z');assert.equal(w.get().alert.type,'reminder');
  }
});
test('an approximate period does not silently retain the old morning clock',()=>{
  const w=setup(null);assert.ok(editPatch(w.get(),edit(null,[change('time','Friday evening')]),now()).need);
});
test('a reminder can ask for a missing start time and keep the selected type',()=>{
  const w=new Workflow(emptyData(),{now});w.send('Buy milk');
  w.applyEdit(1,edit('#1',[change('alert','reminder')]),'Test choice');assert.equal(w.pending.kind,'edit_value');assert.equal(w.pending.need.field,'time');
  w.send('tomorrow at 6pm');assert.equal(w.get().alert.type,'reminder');assert.equal(w.get().planned,'2026-09-10T12:30:00.000Z');
});
test('time-only edits retain the day and day-only edits retain the clock',()=>{
  const w=setup(null),e=w.get();
  const clock=editPatch(e,edit(null,[change('time','10am')]),now()).patch;
  assert.equal(clock.plannedDate,'2026-09-10');assert.equal(clock.planned,'2026-09-10T04:30:00.000Z');
  const day=editPatch(e,edit(null,[change('time','Friday')]),now()).patch;
  assert.equal(day.planned,'2026-09-11T03:30:00.000Z');
});
test('minute shifts cross midnight locally and past times do not replace a valid plan',()=>{
  const e={id:1,kind:'plan',planned:'2026-09-09T18:35:00.000Z',plannedDate:'2026-09-10',alertIntent:{type:'alarm'},done:false};
  const changed=editPatch(e,edit(null,[change('time','10 minutes earlier','shift')]),now()).patch;
  assert.equal(changed.planned,'2026-09-09T18:25:00.000Z');assert.equal(changed.plannedDate,'2026-09-09');assert.equal(changed.alert.at,'2026-09-09T18:15:00.000Z');
  assert.ok(editPatch(e,edit(null,[change('time','one hour earlier','shift')]),now()).need);
});
test('disabling alerts survives a later time change; canceling retains the entry',async()=>{
  const w=setup(edit('meeting',[change('alert','off')]));
  await w.sendAsync('Turn off the alarm for the meeting');assert.equal(w.get().alert,null);
  w.interpreter=model(edit('meeting',[change('time','one hour later','shift')]));await w.sendAsync('Move the meeting one hour later');assert.equal(w.get().alert,null);
  const original=w.get().raw;w.interpreter=model(edit('meeting',[change('status','cancelled')]));await w.sendAsync('Cancel the meeting');
  assert.equal(w.data.entries.length,1);assert.equal(w.get().state,'cancelled');assert.equal(w.get().raw,original);assert.equal(w.get().alert,null);
});
test('a request can change check-in minutes and energy without changing the original',async()=>{
  const w=new Workflow(emptyData(),{now});w.send('/checkin');w.send('Walked for ten minutes. I feel tired.');
  const raw=w.get().raw;w.interpreter=model(edit('walk',[change('duration','thirty minutes'),change('energy','High')]));
  await w.sendAsync('Change that walk to thirty minutes and set energy to high');assert.equal(w.get().minutes,30);assert.equal(w.get().energy,'High');assert.equal(w.get().raw,raw);assert.equal(w.get().kind,'checkin');assert.equal(w.get().alert,null);
});
test('schema rejects edits to raw text, duplicate fields, and invented IDs',async()=>{
  for(const proposal of [edit('meeting',[change('raw','overwritten')]),edit('meeting',[change('alert','alarm'),change('alert','off')]),edit('#9',[change('status','done')])]){
    const parse=model(proposal);const result=await parse('Change the meeting',{now:now()});assert.equal(result.entries,null);assert.equal(result.metadata.status,'failed');
  }
});
test('failed edit requests are retained without changing entries or creating new plans',async()=>{
  const w=setup(null);w.interpreter=createOpenRouter({});const original=structuredClone(w.get());
  const response=await w.sendAsync('Move the meeting one hour later');
  assert.match(response,/No plan or check-in changed/);assert.equal(w.data.entries.length,1);assert.deepEqual(w.get(),original);assert.equal(w.data.interactions.at(-1).raw,'Move the meeting one hour later');
  await w.sendAsync('Use a reminder instead');assert.equal(w.data.entries.length,1);assert.deepEqual(w.get(),original);
});
test('a natural time edit keeps an alert type chosen through the local menu',async()=>{
  const w=setup(edit('meeting',[change('time','one hour later','shift')]));
  w.send('/alert');w.send('1');w.send('yes');assert.equal(w.get().alert.type,'reminder');
  await w.sendAsync('Move the meeting one hour later');assert.equal(w.get().alert.type,'reminder');assert.equal(w.get().alert.at,w.get().planned);
});
test('/new cannot be turned into an edit of an existing entry by the model',async()=>{
  const w=setup(edit('meeting',[change('status','cancelled')]));const before=structuredClone(w.get());
  await w.sendAsync('/new Cancel the meeting');assert.deepEqual(w.get(1),before);assert.equal(w.data.entries.length,2);assert.equal(w.get(2).raw,'Cancel the meeting');assert.equal(w.get(2).alert,null);
});
test('failed persistence rolls back the edit and retains the saved request',async()=>{
  const w=setup(edit('meeting',[change('time','one hour later','shift')]));
  const original=w.get(1).planned;let writes=0;w.saveData=()=>{if(++writes>1)throw new Error('disk full');};
  await assert.rejects(w.sendAsync('Move the meeting one hour later'));assert.equal(w.get(1).planned,original);assert.equal(w.data.interactions.at(-1).raw,'Move the meeting one hour later');
});
test('field choices are based on what is missing and on alert state',()=>{
  const checkin={id:1,kind:'checkin',minutes:null,mood:null,energy:'Low',purpose:''};
  const unknown=actionsFor(checkin);assert.equal(unknown[0].key,'duration');assert.ok(!unknown.some(a=>a.label==='Energy?'));
  const plan={id:2,kind:'plan',planned:'2026-09-10T03:30Z',minutes:45,purpose:'Meet the team',alert:{type:'alarm',status:'scheduled'}};
  const actions=actionsFor(plan);assert.ok(actions.some(a=>a.key==='reminder'));assert.ok(!actions.some(a=>a.key==='alarm'));
  const closed=actionsFor({...plan,done:true});assert.deepEqual(closed.map(a=>a.key),['reopen','details']);
});
test('each bubble choice targets its own entry, even if another entry is selected',()=>{
  const w=new Workflow(emptyData(),{now});w.send('Meeting tomorrow at 9am');w.send('Buy milk tomorrow at 6pm');
  const before=w.get(1).alert.type;w.cards(w.data.entries);const index=w.quick.findIndex(a=>a.id===2&&a.key==='alarm');assert.ok(index>=0);
  w.send(String(index+1));assert.equal(w.get(1).alert.type,before);assert.equal(w.get(2).alert.type,'alarm');assert.equal(w.latest,2);
});
test('time choices use the stated days and AM/PM alternatives',()=>{
  const choices=timeChoices({interpretation:{timeEvidence:['Thursday or Friday at seven']}},now());
  assert.equal(choices.length,4);assert.deepEqual(choices.map(c=>new Date(c.at).getHours()),[7,19,7,19]);
  assert.deepEqual(timeChoices({interpretation:{timeEvidence:['tomorrow after lunch']}},now()),[]);
});
test('bubbles wrap to terminal width and remove terminal control codes from display only',()=>{
  const title='Meeting '.repeat(15)+'\u001b[31mred\u001b[0m';
  const e={id:1,kind:'plan',title,minutes:30,purpose:'',planned:null};
  const result=entryBubble(e,actionsFor(e).map((a,i)=>({...a,number:i+1})),{width:48});
  assert.ok(result.split('\n').every(line=>line.length===48));assert.ok(!result.includes('\u001b'));assert.equal(e.title,title);
  assert.match(bubble('Saved',['Walk'],{width:48}),/╭/);
});
test('duration edits support ordinary number words and reject partial compound values',()=>{
  assert.equal(editDuration('one hour'),60);assert.equal(editDuration('half an hour'),30);assert.equal(editDuration('twenty'),20);assert.equal(editDuration('1 hour 30 minutes'),null);assert.equal(editDuration('2000 minutes'),null);
});
test('same completes a time question using the new hour and the existing day and morning',()=>{
  const w=new Workflow(emptyData(),{now});w.send('Run tomorrow at 8am');
  const proposal={...edit(null,[{field:'time',op:'set',value:null,evidence:['make it 9no']}]),clarification:'Keep the same day and morning?'};
  w.applyEdit(1,proposal,'Natural edit: make it 9no');
  w.send('same');
  assert.equal(w.get(1).planned,'2026-09-10T03:30:00.000Z');assert.equal(w.pending,null);
});
test('explicit same day and time of day can resolve a bare new clock',()=>{
  const w=new Workflow(emptyData(),{now});w.send('Run tomorrow at 8am');
  const proposal={...edit(null,[{field:'time',op:'set',value:null,evidence:['make it 9 same day and time']}]),clarification:'What day and time should I use?'};
  w.applyEdit(1,proposal,'Natural edit: make it 9 same day and time');
  assert.equal(w.get(1).planned,'2026-09-10T03:30:00.000Z');assert.equal(w.pending,null);
});
test('same morning never silently becomes evening when the morning time has passed',()=>{
  const entry={id:1,kind:'plan',planned:'2026-09-10T02:30:00.000Z',plannedDate:'2026-09-10'};
  const request={...edit(null,[{field:'time',op:'set',value:null,evidence:['make it 7 same day and time']}]),clarification:'What future time?'};
  assert.ok(editPatch(entry,request,new Date('2026-09-10T12:00:00+05:30')).need);
});
