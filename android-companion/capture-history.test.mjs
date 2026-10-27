import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan} from './planner-state.mjs';
import {createRamble,applyRamble,undoRamble} from './voice-turn.mjs';
import {intentViewFromData} from './intent-service.mjs';
import {voiceRows} from './capture-voice-rows.mjs';
import {historyView} from './capture-views.mjs';

installFakeDom();
const TZ='Asia/Kolkata',NOW=new Date('2026-10-27T12:00:00Z');
const turnDone={serverContent:{turnComplete:true}};

function ramble(data,messageId,title){
 const r=createRamble({data,timeZone:TZ,now:()=>NOW});r.stop();
 r.receive({serverContent:{inputTranscription:{text:`add ${title}`}}});
 r.receive({toolCall:{functionCalls:[{id:'c1',name:'save_task',args:{title}}]}});
 r.receive(turnDone);r.receive(turnDone);
 applyRamble(data,r.result(),{messageId,timeZone:TZ,now:NOW});
}
function history(data,discard=()=>{}){
 return historyView({captures:intentViewFromData(data,{now:NOW}).captures,hasMore:false,showMore(){},retry(){},discard,
  voiceRows:changes=>voiceRows(data,changes,NOW),onBack(){}});
}
const rows=view=>[...view.querySelectorAll('.history-row')];
const buttons=row=>[...row.querySelectorAll('button')].map(b=>b.textContent.trim());

test('after Capture reopens, History offers Discard on the newest ramble only, and says what each one changed', () => {
 const data=freshStore();
 ramble(data,'m-1','Call mom');ramble(data,'m-2','Buy milk');
 const discarded=[],[newest,older]=rows(history(data,id=>discarded.push(id)));
 assert.match(newest.textContent,/Added Buy milk/);
 assert.match(older.textContent,/Added Call mom/);
 assert.ok(buttons(newest).some(b=>b.endsWith('Discard')));
 assert.ok(!buttons(older).some(b=>b.endsWith('Discard')),'an older ramble cannot be taken back without the newer one');
 [...newest.querySelectorAll('button')].find(b=>b.textContent.trim().endsWith('Discard')).click();
 assert.deepEqual(discarded,['m-2']);
});

test('a ramble loses Discard once the plan changes after it, and a discarded one says so', () => {
 const data=freshStore();
 ramble(data,'m-1','Call mom');
 editPlan(data,{type:'saveTask',fields:{title:'Typed later'}},NOW);
 assert.ok(!buttons(rows(history(data))[0]).some(b=>b.endsWith('Discard')));
 const fresh=freshStore();ramble(fresh,'m-1','Call mom');undoRamble(fresh,'m-1',NOW);
 const [row]=rows(history(fresh));
 assert.match(row.textContent,/Discarded/);assert.ok(!buttons(row).some(b=>b.endsWith('Discard')));
});
