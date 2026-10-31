import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFakeDom,FakeElement} from './fake-dom.mjs';
import {installComposer,showVoice,orbTap} from './capture-composer.mjs';
import {installSheet} from './capture-sheet.mjs';
import {createVoiceMode} from './capture-voice.mjs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('index.html'),css=read('capture.css');
const panelHtml=html.slice(html.indexOf('<section id="panel"'),html.indexOf('</section>',html.indexOf('<section id="panel"')));
const styled=node=>{const props={};return Object.assign(node,{style:{props,setProperty(k,v){props[k]=v;}}});};
const tick=()=>new Promise(r=>setTimeout(r,0));

/** A fake DOM whose new elements carry a style. Reduce Motion is on, so the drop draws each mode still. */
function styledDom(){
 const doc=installFakeDom();
 const create=doc.createElement;
 doc.createElement=tag=>styled(create(tag));
 doc.documentElement.dataset.reduceMotion='true';
 return doc;
}

/** The composer's own elements, wired the way index.html wires them. */
function composerDom(){
 const doc=styledDom();
 const ids={};
 const make=(tag,id)=>{const node=styled(new FakeElement(tag));node.id=id;ids[id]=node;return node;};
 const panel=make('section','panel'),form=make('form','composer'),message=make('textarea','message'),dictate=make('button','dictate'),send=make('button','send');
 const go=new FakeElement('div');go.className='go';go.append(dictate,send);
 form.append(message,go);panel.append(form);
 Object.assign(message,{scrollHeight:24});
 doc.getElementById=id=>ids[id]??null;
 globalThis.getComputedStyle=()=>({lineHeight:'24px',paddingTop:'12px',paddingBottom:'12px'});
 globalThis.window={addEventListener(){}};
 globalThis.ResizeObserver=class{observe(){}};
 return ids;
}

test('the composer is one row: the field, then one round button that is the drop at rest and Send with text', () => {
 assert.doesNotMatch(panelHtml,/bar-row|more_vert|arrow_upward/);
 assert.match(panelHtml,/<textarea id="message"[^>]*>[\s\S]*<div class="go">\s*<button id="dictate"[^>]*>[\s\S]*mic[\s\S]*<button id="send"[^>]*>[\s\S]*>send</);
 const {panel,message,dictate}=composerDom();
 const inputs=[];
 installComposer({onSubmit(){},onInput:v=>inputs.push(v),onVoice(){}});
 const drop=dictate.querySelector('.drop');
 assert.ok(drop,'the voice drop sits in the button');
 assert.equal(drop.dataset.drop,'idle','at rest the drop is the mic button');
 assert.equal(dictate.querySelector('.orb'),null,'the old orb is gone');
 assert.equal(panel.dataset.hasText,'false');
 message.value='Call mom';
 message.dispatch('input');
 assert.equal(panel.dataset.hasText,'true');
 assert.deepEqual(inputs,['Call mom']);
 message.value='  ';
 message.dispatch('input');
 assert.equal(panel.dataset.hasText,'false','spaces alone keep the orb');
 for(const hide of ['.bar[data-has-text=true][data-voice=off] .voice-go','.bar[data-has-text=false] .send','.bar[data-voice=on] .send'])
  assert.ok(css.includes(hide),`${hide} is hidden`);
 assert.match(css,/\n\.go>button\{grid-area:1\/1;[^}]*inline-size:48px;block-size:48px/,'both share one 48dp cell, so they cross-fade in place');
});

test('the handle is a labelled 48dp button that opens More, and a second tap closes it', () => {
 const more=html.match(/<button id="more"[^>]*>.*?<\/button>/)?.[0]??'';
 for(const attr of ['aria-label="More"','aria-haspopup="dialog"','aria-expanded="false"','aria-controls="sheet"'])assert.ok(more.includes(attr),attr);
 assert.match(more,/>expand_less</);
 assert.match(css,/\n\.handle::after\{content:'';position:absolute;inset:-8px 0 -16px\}/,'24dp tab plus 24dp below it is a 48dp target');
 const doc=installFakeDom();
 const ids={sheet:new FakeElement('section'),scrim:new FakeElement('div'),more:new FakeElement('button')};
 ids.sheet.hidden=true;ids.scrim.hidden=true;
 doc.getElementById=id=>ids[id];doc.addEventListener=()=>{};
 installSheet({platform:{},setView(){}});
 ids.more.click();
 assert.equal(ids.sheet.hidden,false);
 assert.equal(ids.more.getAttribute('aria-expanded'),'true');
 ids.more.click();
 assert.equal(ids.sheet.hidden,true);
 assert.equal(ids.more.getAttribute('aria-expanded'),'false');
});

test('while a session is open the composer drop is "Hang up", follows the voice, ticks on a save, and a tap stops the session', async () => {
 const {panel,dictate}=composerDom();
 const composer=installComposer({onSubmit(){},onInput(){},onVoice(){}});
 const drop=dictate.querySelector('.drop');
 composer.voice({phase:'connecting'});
 assert.equal(drop.dataset.drop,'listening','the drop listens as the call opens');
 composer.voice({phase:'listening'});
 assert.equal(panel.dataset.voice,'on');
 assert.equal(dictate.getAttribute('aria-label'),'Hang up');
 assert.equal(dictate.disabled,false,'you can tap it to hang up');
 composer.voice({phase:'working'});
 assert.equal(drop.dataset.drop,'working');
 composer.voice({phase:'working',moment:{n:1,kind:'writing'}});
 assert.equal(drop.dataset.saved,'1','a save plays the tick');
 composer.voice({phase:'working',moment:{n:1,kind:'writing'}});
 assert.equal(drop.dataset.saved,'1','the same save never ticks twice');
 composer.voice({phase:'listening',moment:{n:2,kind:'oops'}});
 assert.equal(drop.dataset.saved,'1','a failed save plays no tick');
 composer.voice({phase:'speaking'});
 assert.equal(drop.dataset.drop,'speaking');
 composer.voice({});
 assert.equal(panel.dataset.voice,'off');
 assert.equal(drop.dataset.drop,'idle','the drop is the mic button again when the call ends');
 assert.equal(dictate.getAttribute('aria-label'),'Voice input');

 let stopped=0,started=0,release;
 const gate=new Promise(r=>{release=r;});
 const start=({onChange})=>{
  queueMicrotask(()=>onChange({phase:'listening',heard:'Call mom',changes:[],wordsReady:false}));
  return {stop(){stopped++;},cancel(){},done:gate.then(()=>({heard:'',said:'',changes:[],errors:[],failed:'stop'}))};
 };
 const platform={voiceData:()=>({}),voiceRows:()=>[],action:async()=>null,saveWith:async()=>true};
 const voice=createVoiceMode({platform,conversationId:()=>'c',onChange(){},afterSave(){},start,doc:null,win:{}});
 const tap=orbTap(voice,()=>{started++;voice.begin();});
 tap();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(voice.active(),true);
 assert.equal(started,1);
 tap();
 assert.equal(stopped,1,'a tap on the live orb stops the ramble');
 assert.equal(started,1,'and never starts a second one');
 release();
});

test('the live card carries no drop and no Stop: the composer button does both', async () => {
 styledDom();
 let release;
 const gate=new Promise(r=>{release=r;});
 const start=({onChange})=>{
  queueMicrotask(()=>onChange({phase:'listening',heard:'Call mom',changes:[],wordsReady:false}));
  return {stop(){},cancel(){},done:gate.then(()=>({heard:'',said:'',changes:[],errors:[],failed:'stop'}))};
 };
 const platform={voiceData:()=>({}),voiceRows:()=>[],action:async()=>null,saveWith:async()=>true};
 const voice=createVoiceMode({platform,conversationId:()=>'c',onChange(){},afterSave(){},start,doc:null,win:{}});
 voice.begin();
 await new Promise(r=>setTimeout(r,0));
 const [node]=voice.cards();
 assert.equal(node.querySelector('.drop'),null);
 assert.equal(node.querySelectorAll('button').length,0);
 release();
});

test('showVoice keeps the button tappable through a whole session, so a tap while RPM speaks cuts the speech; never while a reply is busy', () => {
 const panel=new FakeElement('section'),dictate=new FakeElement('button');
 for(const phase of ['connecting','listening','working','speaking']){
  showVoice(panel,dictate,{phase});
  assert.equal(dictate.disabled,false,phase);
  assert.equal(dictate.getAttribute('aria-label'),'Hang up');
 }
 showVoice(panel,dictate,{busy:true});
 assert.equal(dictate.disabled,true);
 showVoice(panel,dictate,{});
 assert.equal(dictate.disabled,false);
});
