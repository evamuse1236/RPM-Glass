import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadGate,instantRows,worthReading,READ_IDLE_MS,READS_PER_DRAFT} from './capture-forming.mjs';
import {previewRows} from './capture-receipt.mjs';
import {splitWhen} from './capture-lines.mjs';

const now=new Date('2026-10-20T10:00:00+05:30');
const chips=row=>({...splitWhen(row.when),alert:row.alert,repeat:row.repeat,minutes:row.minutes,must:row.must,where:row.where});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function harness({answer=text=>({status:'read',rows:[{title:text.toUpperCase()}]})}={}){
 const timers=[],asked=[],states=[];
 const gate=createReadGate({
  read:(text,signal)=>{const call={text,signal};asked.push(call);return new Promise(resolve=>{call.resolve=()=>resolve(answer(text));});},
  onChange:state=>states.push(state),
  setTimer:(fn,ms)=>{const t={fn,ms,live:true};timers.push(t);return t;},
  clearTimer:t=>{t.live=false;},
 });
 const fire=()=>{for(const t of timers.splice(0))if(t.live)t.fn();};
 return {gate,timers,asked,states,fire,last:()=>states.at(-1)};
}

test('the prototype’s samples form the same chips their receipts show',()=>{
 const [amma]=instantRows('Call Amma tomorrow at 6 pm, remind me 10 min before',{now});
 assert.equal(amma.title,'Call Amma');
 assert.deepEqual(chips(amma),{day:'Wed 21 Oct',time:'6:00 PM',alert:'reminder',repeat:null,minutes:null,must:false,where:null});
 const long=instantRows('Past paper section B on Thursday at 5 pm, must. Run 3 km every morning at 6 am. Email Prof Rao about the citation format',{now});
 assert.deepEqual(long.map(r=>r.title),['Past paper section B','Run 3 km','Email Prof Rao about the citation format']);
 assert.deepEqual(chips(long[0]),{day:'Thu 22 Oct',time:'5:00 PM',alert:null,repeat:null,minutes:null,must:true,where:null});
 assert.deepEqual(chips(long[1]),{day:'Wed 21 Oct',time:'6:00 AM',alert:null,repeat:'Daily',minutes:null,must:false,where:null});
 assert.deepEqual(chips(long[2]),{day:null,time:null,alert:null,repeat:null,minutes:null,must:false,where:null});
 const [alarm]=instantRows('Wake me at 6:30 with an alarm for the RM quiz',{now});
 assert.deepEqual(chips(alarm),{day:'Wed 21 Oct',time:'6:30 AM',alert:'alarm',repeat:null,minutes:null,must:false,where:null});
 assert.deepEqual(chips(instantRows('Read chapter 3 for 45 minutes',{now})[0]).minutes,45);
});

test('a model read draws as its receipt will: the Block it chose, else Inbox, with the Block’s Area tone',()=>{
 const data={entries:[],planner:{areas:[{id:'a1',title:'Studies',colorIndex:3}],goals:[{id:'g1',areaId:'a1'}],projects:[{id:'p1',goalId:'g1',title:'Term 1'}],blocks:[{id:'b1',title:'RM critical review',projectId:'p1'}]}};
 const op=(opId,fields)=>({opId,kind:'create',entity:'task',fields:fields.map(([name,value])=>({name,op:'set',value}))});
 const rows=previewRows(data,[op('t1',[['title','Past paper section B'],['blockId','b1'],['must',true],['time','Thursday at 5 pm']]),op('t2',[['title','Email Prof Rao'],['alert','off']]),{opId:'u1',kind:'update',entity:'task',fields:[]}],
  {items:[{opId:'t1',status:'parsed',planned:'2026-10-22T11:30:00.000Z',plannedDate:'2026-10-22'}]});
 assert.equal(rows.length,2,'only new tasks form');
 assert.deepEqual([rows[0].where,rows[0].tone,rows[0].must,splitWhen(rows[0].when).day],['RM critical review','area-3',true,'Thu 22 Oct']);
 assert.deepEqual([rows[1].where,rows[1].tone,rows[1].alert,rows[1].when],['Inbox',null,null,null]);
});

test('a model read waits for a pause, then reads once; its rows replace the instant ones',async()=>{
 const h=harness();
 h.gate.type('Past paper section B on Thursday',{enabled:true});
 assert.equal(h.timers[0].ms,READ_IDLE_MS);
 assert.equal(h.last().reading,true,'Reading shows while a read is due');
 assert.equal(h.asked.length,0,'nothing is asked before the pause');
 h.fire();await tick();
 assert.equal(h.asked.length,1);
 h.asked[0].resolve();await tick();
 assert.deepEqual(h.last().rows,[{title:'PAST PAPER SECTION B ON THURSDAY'}]);
 assert.equal(h.last().reading,false);
 h.gate.type('Past paper section B on Thursday',{enabled:true});
 assert.equal(h.timers.length,0,'the same words are never asked twice');
});

test('an answer that arrives after the words changed is dropped and its request cancelled',async()=>{
 const h=harness();
 h.gate.type('Call Amma tomorrow at 6',{enabled:true});h.fire();await tick();
 const first=h.asked[0];
 h.gate.type('Call Amma tomorrow at 6 pm',{enabled:true});
 assert.equal(first.signal.aborted,true);
 first.resolve();await tick();
 assert.equal(h.last().text,'Call Amma tomorrow at 6 pm');
 assert.equal(h.last().rows,null,'the stale answer never shows');
 h.gate.type('Call Amma tomorrow at 6',{enabled:true});
 assert.equal(h.last().rows,null,'nor is it kept for the old words');
});

test('without a key nothing is asked and no Reading chip shows; instant chips still form',()=>{
 const h=harness();
 h.gate.type('Call Amma tomorrow at 6 pm, remind me 10 min before',{enabled:false});
 assert.equal(h.timers.length,0);
 assert.equal(h.last().reading,false);
 assert.equal(instantRows('Call Amma tomorrow at 6 pm, remind me 10 min before',{now})[0].alert,'reminder');
});

test('a draft gets at most a few reads, short words none, and Enter keeps the last read running for reuse',async()=>{
 assert.equal(worthReading('Buy milk'),false);
 assert.equal(worthReading('x '.repeat(800)),false);
 const h=harness();
 for(let i=0;i<READS_PER_DRAFT+2;i++){h.gate.type(`Call the bank about card ${i}`,{enabled:true});h.fire();await tick();}
 assert.equal(h.asked.length,READS_PER_DRAFT);
 assert.equal(h.last().reading,false,'past the limit no Reading chip promises a read');
 h.gate.sent();
 h.gate.type('Call the bank about the new card',{enabled:true});h.fire();await tick();
 assert.equal(h.asked.length,READS_PER_DRAFT+1,'the next draft has its own allowance');
 const running=h.asked.at(-1);
 h.gate.sent();
 assert.equal(running.signal.aborted,false,'Enter does not cancel the read it may reuse');
});
