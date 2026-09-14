import test from 'node:test';
import assert from 'node:assert/strict';
import {Workflow,emptyData} from '../cli/workflow.mjs';
import {createOpenRouter,MODEL,normalizeExtraction} from '../cli/openrouter.mjs';
import {chatContext,sendChat} from './conversation.mjs';
import {createChatServer} from './server.mjs';

process.env.TZ='Asia/Kolkata';
const now=()=>new Date('2026-09-11T08:00:00+05:30');
const emptyFeelings={mood:null,energy:null,evidence:[]};
const envelope=patch=>({intent:'chat',entries:[],feelings:emptyFeelings,edit:null,answer:null,message:null,continuation:false,...patch});
const capture=(raw,title='Call Deep',time=null)=>({title,kind:'plan',state:'active',evidence:[raw],time:{text:time,evidence:[raw],uncertain:!time,clarification:time?null:'What time in the afternoon?'},durationMinutes:null,durationEvidence:null,alert:'reminder',purpose:null,purposeEvidence:null});
const edit=(raw,changes,target=null)=>({target,targetEvidence:target?target:null,changes:changes.map(c=>({...c,evidence:[raw]})),clarification:null});
const set=(field,value)=>({field,op:'set',value});
const model=(get,requests=[])=>createOpenRouter({apiKey:'test-only-token',conversation:true,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);requests.push(input);
  return new Response(JSON.stringify({model:MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify(get(input))}}]}));
}});
function setup(interpreter){
  const w=new Workflow(emptyData(),{now});w.send('Run tomorrow at 7am');w.interpreter=interpreter;return w;
}
const context=(w,question=null,messages=[])=>chatContext(w,messages,question);
const question=w=>({text:w.pending.prompt??w.pending.need?.prompt??'What time in the afternoon?',entryId:w.pending.id,choices:[]});

test('maybe 8 is a contextual edit of the selected run, never a new plan',async()=>{
  const requests=[];
  const w=setup(model(input=>envelope({intent:'edit',edit:edit(input.text,[set('time','8am')])}),requests));
  const original=structuredClone(w.get());
  const result=await sendChat(w,'maybe 8',context(w,null,[{role:'user',text:'Run tomorrow at 7am'},{role:'assistant',text:'Saved.'}]));
  assert.equal(result.reply,'Changed.');assert.equal(w.data.entries.length,1);assert.equal(w.get().planned,'2026-09-12T02:30:00.000Z');
  assert.equal(w.get().raw,original.raw);assert.equal(w.get().minutes,original.minutes);
  assert.equal(requests[0].context.selected.title,original.title);assert.equal(requests[0].context.selected.day,'2026-09-12');
  assert.equal(requests[0].context.recentMessages[0].text,'Run tomorrow at 7am');assert.equal(w.data.interactions.at(-1).raw,'maybe 8');
});

test('a failed short correction keeps the words without manufacturing an entry',async()=>{
  const w=setup(createOpenRouter({conversation:true})),original=structuredClone(w.data.entries);
  const result=await sendChat(w,'maybe 8',context(w));
  assert.match(result.reply,/no plan was created or changed/);assert.deepEqual(w.data.entries,original);assert.equal(w.data.interactions.at(-1).raw,'maybe 8');
});

test('typed answer uses the open question, can normalize words, and preserves its day',async()=>{
  const requests=[];
  const w=setup(model(input=>envelope({intent:'answer',answer:{value:'1pm',evidence:[input.text]}}),requests));
  w.applyEdit(1,{...edit('Friday afternoon',[set('time',null)]),clarification:'What time in the afternoon?'},'Requested Friday afternoon');
  await sendChat(w,'say one',context(w,question(w)));
  assert.equal(w.get().planned,'2026-09-11T07:30:00.000Z');assert.equal(w.pending,null);assert.equal(requests[0].context.question.kind,'edit_value');
  assert.equal(requests[0].context.question.proposedChanges[0].evidence[0],'Friday afternoon');
});

test('a clock answer is retained while a separate day question is answered',async()=>{
  const raw='Call Mira Saturday or Sunday afternoon';
  const data={entries:[{...capture(raw),time:{text:null,evidence:[raw],uncertain:true,clarification:'What time?'}}],feelings:emptyFeelings};
  const w=new Workflow(emptyData(),{now,interpreter:async()=>({intent:'capture',entries:normalizeExtraction(data,raw,now()),feelings:emptyFeelings,metadata:{status:'accepted'}})});
  await w.sendAsync(raw);
  w.interpreter=model(input=>envelope({intent:'answer',answer:{value:input.text,evidence:[input.text]}}));
  await sendChat(w,'1pm',context(w,question(w)));assert.match(w.pending.prompt,/day/);
  await sendChat(w,'Saturday',context(w,question(w)));
  assert.equal(w.pending,null);assert.equal(w.get().planned,'2026-09-12T07:30:00.000Z');
});

test('an unsupported recurring request does not quietly become a one-time plan',async()=>{
  const raw='Call Mira every afternoon';
  const data={entries:[{...capture(raw),time:{text:null,evidence:[raw],uncertain:true,clarification:'What time?'}}],feelings:emptyFeelings};
  const w=new Workflow(emptyData(),{now,interpreter:async()=>({intent:'capture',entries:normalizeExtraction(data,raw,now()),feelings:emptyFeelings,metadata:{status:'accepted'}})});
  await w.sendAsync(raw);w.interpreter=model(input=>envelope({intent:'answer',answer:{value:input.text,evidence:[input.text]}}));
  await sendChat(w,'1pm',context(w,question(w)));
  assert.equal(w.get().planned,null);assert.match(w.pending.prompt,/one-time/);
});

test('a new thought can leave a question without being saved as the old answer',async()=>{
  const requests=[];
  const w=setup(model(input=>envelope({intent:'capture',entries:[capture(input.text,'Buy milk','tomorrow at 6pm')]}),requests));
  w.send('/purpose');const original=structuredClone(w.get());
  await sendChat(w,'Also buy milk tomorrow at 6pm',context(w,question(w)));
  assert.equal(w.data.entries.length,2);assert.deepEqual(w.get(1),original);assert.equal(w.get(2).title,'Buy milk');assert.equal(w.get(2).purpose,'');
  assert.equal(w.pending,null);assert.equal(requests[0].context.question.kind,'purpose');
});

test('never mind leaves a question but does not cancel or delete the plan',async()=>{
  const w=setup(model(()=>envelope({intent:'cancel_question'})));w.send('/purpose');const original=structuredClone(w.get());
  await sendChat(w,'never mind',context(w,question(w)));
  assert.equal(w.pending,null);assert.deepEqual(w.get(),original);assert.equal(w.data.entries.length,1);
});

test('continuing a multi-field edit retains the requested reminder and adds the answer',async()=>{
  const w=setup(model(input=>envelope({intent:'edit',continuation:true,edit:edit(input.text,[set('time','1pm'),set('duration','30 minutes')])})));
  w.applyEdit(1,{...edit('Friday afternoon with a reminder',[set('time',null),set('alert','reminder')]),clarification:'What time in the afternoon?'},'Requested Friday');
  await sendChat(w,'1pm and 30 minutes',context(w,question(w)));
  assert.equal(w.pending,null);assert.equal(w.get().minutes,30);assert.equal(w.get().alert.type,'reminder');
  assert.equal(w.get().plannedDate,'2026-09-11');
});

test('a continuation aimed at a different entry is rejected atomically',async()=>{
  const w=setup(null);w.send('Buy milk tomorrow at 6pm');w.send('/show 1');
  w.applyEdit(1,{...edit('Friday afternoon',[set('time',null)]),clarification:'What time?'},'Requested Friday');
  w.interpreter=model(input=>envelope({intent:'edit',continuation:true,edit:edit(input.text,[set('time','1pm')],'milk')}));
  const entries=structuredClone(w.data.entries),pending=structuredClone(w.pending);
  const response=await sendChat(w,'change milk to 1pm',context(w,question(w)));
  assert.match(response.reply,/nothing changed/);assert.deepEqual(w.data.entries,entries);assert.deepEqual(w.pending,pending);
});

test('small talk is a chat reply, not a new entry or a field value',async()=>{
  const w=setup(model(()=>envelope({intent:'chat',message:'Your run is planned for tomorrow at 7 AM.'})));const entries=structuredClone(w.data.entries);
  const result=await sendChat(w,'What did I plan?',context(w));
  assert.match(result.reply,/run/);assert.deepEqual(w.data.entries,entries);
});

test('context is bounded and excludes revisions, arbitrary properties and other stores',()=>{
  const w=setup(null);w.get().privateDebugToken='secret-marker';w.get().revisions.push({secret:'old-revision-marker'});
  for(let i=0;i<20;i++)w.send('Note '+i+' '+('x'.repeat(3000)));
  const result=context(w,null,Array.from({length:20},()=>({role:'user',text:'x'.repeat(12000),secret:'message-secret'})));
  assert.equal(result.entries.length,8);assert.equal(result.recentMessages.length,6);assert.ok(JSON.stringify(result).length<20000);
  assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('revisions'));
});

test('context cannot grant a model permission to invent record IDs or absolute reply dates',async()=>{
  const w=setup(null);w.send('/time');
  for(const output of [
    envelope({intent:'edit',edit:{...edit('change it',[set('time','8am')]),target:'#1',targetEvidence:'it'}}),
    envelope({intent:'answer',answer:{value:'2026-09-12 at 8am',evidence:['8am']}}),
  ]){
    const parse=model(()=>output);const result=await parse('change it to 8am',{now:now(),context:context(w,question(w))});
    assert.equal(result.metadata.status,'failed');assert.equal(result.entries,null);
  }
});

test('HTTP displays the actual missing-day explanation rather than repeating the old question',async t=>{
  let calls=0;
  const server=createChatServer({now,conversation:true,interpreter:model(input=>{
    calls++;
    return calls===1?envelope({intent:'capture',entries:[{...capture(input.text),time:{text:null,evidence:[input.text],uncertain:true,clarification:'What time?'}}]}):envelope({intent:'answer',answer:{value:'1pm',evidence:[input.text]}});
  })});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const initial=await fetch(origin+'/api/state'),cookie=initial.headers.get('set-cookie').split(';')[0];let state=await initial.json();
  for(const text of ['Call Deep Saturday or Sunday afternoon','1pm']){
    const response=await fetch(origin+'/api/turn',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({version:state.version,type:'message',text})});state=await response.json();assert.equal(response.status,200);
  }
  assert.match(state.question.text,/Include the day/);assert.doesNotMatch(state.question.text,/What time\?/);assert.equal(state.entries[0].when,null);
});
