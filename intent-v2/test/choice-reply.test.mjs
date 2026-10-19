import test from 'node:test';
import assert from 'node:assert/strict';
import {readChoiceReply,choiceTurn} from '../src/choice-reply.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {sourceUnits} from '../src/context.mjs';
import {setup,seed,turn,operation,field} from './helpers.mjs';

const choice=(id,label,...targets)=>({id,label,targets});
const draft={entity:'draft',id:'d0'},task={entity:'task',id:'41'},alarm={entity:'alarm',id:'41'};
const question={id:'q-m1',revision:1,prompt:'Which one?',action:'remove',choices:[choice('c1','The dinner draft',draft),choice('c2','The dinner alarm',alarm),choice('c3','Both',draft,alarm)]};
const read=(raw,extra={})=>readChoiceReply(raw,question,extra);

test('ordinals and "last" pick by the order the person saw',()=>{
 assert.deepEqual(read('First'),['c1']);assert.deepEqual(read('the second one'),['c2']);
 assert.deepEqual(read('Last'),['c3']);assert.deepEqual(read('2'),['c2']);
 assert.equal(read('fifth'),null);
});

test('"both" and "all" take a Both choice when offered, and the union otherwise',()=>{
 assert.deepEqual(read('Both'),['c3']);assert.deepEqual(read('ok both of them please'),['c3']);
 const two={...question,choices:question.choices.slice(0,2)};
 assert.deepEqual(readChoiceReply('both',two),['c1','c2']);
 const three={...question,choices:[choice('a','Run',task),choice('b','Swim',{entity:'task',id:'42'}),choice('c','Walk',{entity:'task',id:'43'})]};
 assert.equal(readChoiceReply('both',three),null,'"both" of three is unclear');
 assert.deepEqual(readChoiceReply('all',three),['a','b','c']);
 assert.deepEqual(readChoiceReply('first and third',three),['a','c']);
});

test('label words pick one choice, in any order; shared words are unclear',()=>{
 assert.deepEqual(read('the alarm'),['c2']);assert.deepEqual(read('delete the draft'),['c1']);
 const reordered={...question,choices:[question.choices[1],question.choices[0],question.choices[2]]};
 assert.deepEqual(readChoiceReply('the alarm',reordered),['c2']);
 assert.deepEqual(readChoiceReply('first',reordered),['c2'],'"first" is the first chip shown, not the first ID');
 assert.equal(read('dinner'),null);assert.equal(read('move gym to 6 and both'),null);
});

test('"that one" counts only when the person pointed at a draft with an Edit tap',()=>{
 assert.equal(read('That one only'),null);
 assert.equal(read('that one',{focus:{draftId:'d0',explicit:false}}),null);
 assert.deepEqual(read('that one',{focus:{draftId:'d0',explicit:true}}),['c1']);
});

test('a tap must name an offered choice; an invented ID is refused',()=>{
 assert.deepEqual(read('anything',{choiceId:'c2'}),['c2']);
 assert.throws(()=>read('Both',{choiceId:'c9'}),/not offered/);
});

test('the chosen removal becomes a turn the interpreter checks like any model turn',()=>{
 const t=choiceTurn('Both',question,['c3']);
 const parsed=interpretTurn(t,{units:sourceUnits('Both'),messageId:'m2',visibleEntities:[{entity:'draft',id:'d0'},{entity:'task',id:'41',alert:'alarm'}]});
 assert.deepEqual(parsed.operations.map(o=>[o.kind,o.entity,o.targetId]),[['archive','draft','d0'],['update','task','41']]);
 assert.equal(choiceTurn('first',{...question,action:'other'},['c1']),null,'an open-ended question goes back to the model');
});

test('a model clarification may only name items it was shown, and an alarm only on a task that has one',()=>{
 const raw='Delete this',units=sourceUnits(raw);
 const asking=choices=>turn(raw,[],{draftMode:'none',clarification:{prompt:'Which one?',action:'remove',choices}});
 const visible=[{entity:'draft',id:'d0'},{entity:'task',id:'41',alert:'alarm'},{entity:'task',id:'42'}];
 const parse=t=>interpretTurn(t,{units,messageId:'m1',visibleEntities:visible});
 assert.equal(parse(asking([{label:'Draft',targets:[draft]},{label:'Alarm',targets:[alarm]}])).clarification.choices.length,2);
 assert.throws(()=>parse(asking([{label:'Draft',targets:[draft]},{label:'Other',targets:[{entity:'task',id:'99'}]}])),/not supplied/);
 assert.throws(()=>parse(asking([{label:'Draft',targets:[draft]},{label:'Alarm',targets:[{entity:'alarm',id:'42'}]}])),/has none/);
 assert.throws(()=>parse(asking([{label:'Draft',targets:[draft]}])),/two to four/);
 assert.throws(()=>parse(asking([{label:'Draft',targets:[draft]},{label:'draft!',targets:[task]}])),/distinct/);
 assert.throws(()=>parse(asking([{label:'Draft',targets:[draft]},{label:'Block',targets:[{entity:'block',id:'b1'}]}])),/not supplied|not supported/);
});

test('the question saved on a capture gets stable choice IDs in the order the model gave',async()=>{
 const d=seed();d.entries=[{id:41,kind:'plan',title:'Dinner',alertIntent:{type:'alarm'},done:false,archived:false}];
 const s=setup(async()=>turn('Delete dinner',[],{draftMode:'none',clarification:{prompt:'Which one?',action:'remove',choices:[{label:'The task',targets:[task]},{label:'Its alarm',targets:[alarm]}]}}),{seed:d});
 await s.harness.capture({messageId:'m1',conversationId:'c1',text:'Delete dinner'});
 const saved=(await s.repository.load()).intentV2.captures.m1.clarification;
 assert.deepEqual(saved,{id:'q-m1',revision:1,prompt:'Which one?',action:'remove',choices:[{id:'c1',label:'The task',targets:[task]},{id:'c2',label:'Its alarm',targets:[alarm]}]});
});
