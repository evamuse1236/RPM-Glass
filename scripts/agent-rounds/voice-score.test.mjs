import test from 'node:test';
import assert from 'node:assert/strict';
import {titleProblem,scoreVoice,telegramTargets} from './voice-score.mjs';

test('a title with filler, a clock time or only an alert word is not a short action', () => {
 for(const [title,problem] of [['I will cook lunch','filler'],["I'll read a book",'filler'],['Alarm at 6:10 AM','time'],['Nap at 3 pm','time'],['Alarm in 5 minutes','time'],['Alarm','generic'],['Reminder','generic']])
  assert.equal(titleProblem(title),problem,title);
 for(const title of ['Cook lunch','Read a book','Call Asha','Take vitamins','Water the plants'])assert.equal(titleProblem(title),null,title);
});

test('a noise case passes only when nothing changed; a request needs its words in clean titles', () => {
 assert.deepEqual(scoreVoice({kind:'noise'},{created:[],ops:0}),{noise:true});
 assert.deepEqual(scoreVoice({kind:'noise'},{created:[{entity:'task',title:'Pizza'}],ops:1}),{noise:false});
 const c={kind:'request',expect:{titles:[['cook','lunch']],min:1}};
 assert.deepEqual(scoreVoice(c,{created:[{entity:'task',title:'Cook lunch'}],ops:1}),{title:true,acts:true});
 assert.deepEqual(scoreVoice(c,{created:[{entity:'task',title:'I will cook lunch'}],ops:1}),{title:false,acts:true});
 assert.deepEqual(scoreVoice(c,{created:[],ops:0}),{title:false,acts:false});
});

test('a run that never finished fails every target it was scored on, so a broken key cannot pass noise', () => {
 assert.deepEqual(scoreVoice({kind:'noise'},{end:'closed 1007',created:[],ops:0}),{noise:false});
 assert.deepEqual(scoreVoice({kind:'request',expect:{titles:[['x']],min:1}},{end:'timeout',created:[],ops:0}),{title:false,acts:false});
});

test('a Telegram case passes on a clean draft to the named bot, a send only when expected, and the words spoken back', () => {
 const c={kind:'request',expect:{telegram:{draft:{to:'ima',words:['milk']},sent:false,says:['29']}}};
 const draft={op:'send',dry:true,to:'Ima',text:'Order milk'};
 assert.deepEqual(telegramTargets(c,{telegram:[draft],said:'Send Ima "Order milk"? It is 29 rupees'}),{tgDraft:true,tgSent:true,tgSays:true});
 assert.equal(telegramTargets(c,{telegram:[{...draft,text:'Tell Ima to order milk'}],said:''}).tgDraft,false,'filler in the message fails');
 assert.equal(telegramTargets(c,{telegram:[draft,{op:'send',to:'Ima',text:'Order milk'}],said:''}).tgSent,false,'a send before the yes fails');
 assert.deepEqual(telegramTargets({expect:{telegram:{read:'ima'}}},{telegram:[{op:'read',chat:'Ima'}]}),{tgRead:true});
 assert.deepEqual(scoreVoice({kind:'noise',expect:{telegram:{none:true}}},{created:[],ops:0,telegram:[{op:'read'}]}),{noise:true,tgNone:false});
 assert.deepEqual(scoreVoice({kind:'noise'},{created:[],ops:0,telegram:[{op:'send',to:'Ima',text:'x'}]}),{noise:false},'a real send on noise fails noise');
});
