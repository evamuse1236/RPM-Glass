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

const settle=ms=>new Promise(r=>setTimeout(r,ms));

test('one live card holds from the first word to the last change, its words and rows changing in place', async () => {
 const {voice,release}=voiceWith([listening('Call'),listening('Call mom tomorrow'),working([{title:'Call mom'}]),working([{title:'Call mom'},{title:'Buy milk'}])]);
 voice.begin();
 await settle(0);
 const [node]=voice.cards();
 assert.equal(voice.cards()[0],node,'asking again returns the same node');
 await settle(600);
 assert.equal(node.querySelector('.voice-lead').textContent,'Call mom tomorrow','the words stream in while the changes land');
 assert.deepEqual([...node.querySelectorAll('.voice-row .voice-title')].map(cell=>cell.textContent),['Call mom','Buy milk'],'one row per item, in order');
 release();
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

test('while RPM speaks, the card keeps your words and never shows its sentence', async () => {
 const {voice,release}=voiceWith([working([]),{phase:'speaking',heard:'Call mom tomorrow',said:'Done, mom is set.',changes:[],wordsReady:true}]);
 voice.begin();
 await settle(0);
 const [node]=voice.cards();
 await settle(600);
 assert.equal(node.querySelector('.voice-lead').textContent,'Call mom tomorrow');
 assert.doesNotMatch(node.textContent,/mom is set/);
 release();
});
