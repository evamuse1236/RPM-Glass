import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './fake-dom.mjs';
import {createVoiceMode} from './capture-voice.mjs';
import {placeCards} from './capture-presentation.mjs';

installFakeDom();

const listening=heard=>({phase:'listening',heard,changes:[],wordsReady:false});
const working=changes=>({phase:'working',heard:'Call mom tomorrow',changes,wordsReady:true});

/** A ramble as the phone hears it: many server messages, most of them audio that changes nothing on screen. */
function chattyStart(steps,gate){
 return ({onChange})=>{
  const done=gate.then(()=>({heard:'',said:'',changes:[],errors:[],batch:null,uuids:[],created:[],failed:'stop'}));
  queueMicrotask(()=>{for(const state of steps)onChange(state);});
  return {stop(){},cancel(){},done};
 };
}

function voiceWith(steps){
 let release,renders=0;
 const gate=new Promise(r=>{release=r;});
 const platform={voiceData:()=>({}),voiceRows:changes=>changes.map(c=>({verb:'Added',entity:'task',title:c.title})),
  action:async()=>null,saveWith:async()=>true};
 const voice=createVoiceMode({platform,conversationId:()=>'c',onChange:()=>{renders++;},afterSave(){},start:chattyStart(steps,gate),doc:null,win:{}});
 return {voice,renders:()=>renders,release};
}

test('audio chunks that change nothing on screen do not redraw Capture', async () => {
 const audio=Array.from({length:30},()=>listening('Call mom'));
 const {voice,renders,release}=voiceWith([listening(''),...audio,working([]),working([]),working([{title:'Call mom'}]),working([{title:'Call mom'}])]);
 voice.begin();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(renders(),5,'connecting, listening, the words, working, the first row');
 release();
});

test('the live card stays one node while its phase holds, and its words and rows change in place', async () => {
 const {voice,release}=voiceWith([listening('Call')]);
 voice.begin();
 await new Promise(r=>setTimeout(r,0));
 const first=voice.card();
 assert.match(first.textContent,/Call/);
 release();

 const next=voiceWith([listening('Call'),listening('Call mom tomorrow')]);
 next.voice.begin();
 await new Promise(r=>setTimeout(r,0));
 const a=next.voice.card();
 assert.match(a.textContent,/Call mom tomorrow/);
 assert.equal(next.voice.card(),a,'asking again returns the same node');
 next.release();

 const rows=voiceWith([working([{title:'Call mom'}]),working([{title:'Call mom'},{title:'Buy milk'}])]);
 rows.voice.begin();
 await new Promise(r=>setTimeout(r,0));
 const card=rows.voice.card();
 assert.match(card.textContent,/Buy milk/);
 rows.release();
});

test('placing the cards already on screen leaves them in place, so their entrance does not replay', () => {
 const content=document.createElement('div'),a=document.createElement('section'),b=document.createElement('section');
 let replaced=0;const real=content.replaceChildren.bind(content);content.replaceChildren=(...n)=>{replaced++;real(...n);};
 placeCards(content,[a,b]);
 placeCards(content,[a,b]);
 assert.equal(replaced,1);
 placeCards(content,[b]);
 assert.equal(replaced,2);
 assert.deepEqual(content.children,[b]);
});
