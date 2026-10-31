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
const styled=node=>Object.assign(node,{style:{setProperty(){}}});

/** The composer's own elements, wired the way index.html wires them. */
function composerDom(){
 const doc=installFakeDom();
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

test('the composer is one row: the field, then one round button that is the orb at rest and Send with text', () => {
 assert.doesNotMatch(panelHtml,/bar-row|more_vert|arrow_upward/);
 assert.match(panelHtml,/<textarea id="message"[^>]*>[\s\S]*<div class="go">\s*<button id="dictate"[^>]*>[\s\S]*mic[\s\S]*<button id="send"[^>]*>[\s\S]*>send</);
 const {panel,message,dictate}=composerDom();
 const inputs=[];
 installComposer({onSubmit(){},onInput:v=>inputs.push(v),onVoice(){}});
 assert.ok(dictate.querySelector('.orb.idle'),'the mic sits on the voice orb');
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

test('while a session is open the composer orb is "Hang up", follows the voice, and a tap stops the session', async () => {
 const {panel,dictate}=composerDom();
 const composer=installComposer({onSubmit(){},onInput(){},onVoice(){}});
 const glow=dictate.querySelector('.orb');
 const levels=[];glow.style={setProperty:(k,v)=>levels.push([k,v])};
 composer.voice({phase:'listening'});
 assert.equal(panel.dataset.voice,'on');
 assert.equal(glow.className,'orb listening');
 assert.equal(dictate.getAttribute('aria-label'),'Hang up');
 assert.equal(dictate.disabled,false,'you can tap it to hang up');
 composer.level(.5);
 assert.deepEqual(levels.at(-1),['--level','0.50']);
 composer.voice({phase:'working'});
 assert.equal(glow.className,'orb working');
 composer.voice({});
 assert.equal(panel.dataset.voice,'off');
 assert.equal(glow.className,'orb idle');
 assert.equal(dictate.getAttribute('aria-label'),'Voice input');
 assert.deepEqual(levels.at(-1),['--level','0.00'],'the orb settles when the ramble ends');

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

test('the live card carries no orb and no Stop: the composer orb does both', async () => {
 installFakeDom();
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
 const node=voice.card();
 assert.equal(node.querySelector('.orb'),null);
 assert.equal(node.querySelectorAll('button').length,0);
 release();
});

test('showVoice keeps the orb tappable through a whole session, so a tap while RPM speaks cuts the speech; never while a reply is busy', () => {
 const panel=new FakeElement('section'),dictate=new FakeElement('button'),glow=styled(new FakeElement('span'));
 glow.className='orb idle';dictate.append(glow);
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
