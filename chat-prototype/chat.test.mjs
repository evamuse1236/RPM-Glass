import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatServer} from './server.mjs';
import {normalizeExtraction} from '../cli/openrouter.mjs';

process.env.TZ='Asia/Kolkata';
test('HTTP chat keeps its question and resolves the reported same-time follow-up',async t=>{
  const now=()=>new Date('2026-09-09T23:30:00+05:30');let calls=0;
  const server=createChatServer({now,conversation:true,interpreter:async raw=>{
    calls++;
    if(calls===3)return {intent:'answer',answer:'same',metadata:{status:'accepted'}};
    if(calls===1){
      const extraction={entries:[{title:'run',kind:'plan',state:'active',evidence:[raw],time:{text:'8am',evidence:[raw],uncertain:false,clarification:null},durationMinutes:null,durationEvidence:null,alert:'reminder',purpose:null,purposeEvidence:null}],feelings:{mood:null,energy:null,evidence:[]}};
      return {intent:'capture',entries:normalizeExtraction(extraction,raw,now()),feelings:extraction.feelings,metadata:{status:'accepted'}};
    }
    return {intent:'edit',entries:null,edit:{target:null,targetEvidence:'it',changes:[{field:'time',op:'set',value:null,evidence:[raw]}],clarification:'What day and time should I use?'},metadata:{status:'accepted'}};
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const initial=await fetch(origin+'/api/state');const cookie=initial.headers.get('set-cookie').split(';')[0];let state=await initial.json();
  const send=async text=>{
    const response=await fetch(origin+'/api/turn',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({version:state.version,type:'message',text})});
    assert.equal(response.status,200);state=await response.json();
  };
  await send('run morning 8a');await send('make it 9no');
  assert.equal(state.question.choices.length,2);const question=state.question.text;
  await send('same');
  assert.equal(calls,3);assert.equal(state.entries.length,1);assert.match(state.entries[0].when,/9:00 AM/);assert.equal(state.question,null);
  assert.ok(state.messages.some(m=>m.question?.text===question));assert.equal(state.entries[0].raw,'run morning 8a');
});

for (const reply of ['say 1 pm','1pm']) {
  test(`HTTP chat accepts ${JSON.stringify(reply)} after asking for an afternoon time`,async t=>{
    const now=()=>new Date('2026-09-11T08:00:00+05:30');let calls=0;
    const server=createChatServer({now,conversation:true,interpreter:async(raw,{context})=>{
      calls++;
      if(calls===2){assert.equal(context.question.text,'What time in the afternoon?');return {intent:'answer',answer:'1pm',metadata:{status:'accepted'}};}
      const extraction={entries:[{title:'Call Deep',kind:'plan',state:'active',evidence:[raw],time:{text:null,evidence:['afternoon'],uncertain:true,clarification:'What time in the afternoon?'},durationMinutes:null,durationEvidence:null,alert:'reminder',purpose:null,purposeEvidence:null}],feelings:{mood:null,energy:null,evidence:[]}};
      return {intent:'capture',entries:normalizeExtraction(extraction,raw,now()),feelings:extraction.feelings,metadata:{status:'accepted'}};
    }});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
    const origin='http://127.0.0.1:'+server.address().port;
    const initial=await fetch(origin+'/api/state');const cookie=initial.headers.get('set-cookie').split(';')[0];let state=await initial.json();
    const send=async text=>{
      const response=await fetch(origin+'/api/turn',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({version:state.version,type:'message',text})});
      assert.equal(response.status,200);state=await response.json();
    };
    await send('call deep afternoon');
    assert.equal(state.question.text,'What time in the afternoon?');
    await send(reply);
    assert.equal(state.question,null,'a precise answer must close the time question');
    assert.equal(state.entries.length,1);assert.match(state.entries[0].when,/Sep 11, 1:00 PM/);
    assert.equal(calls,2,'typed answers reach the contextual AI and are applied locally');
  });
}
