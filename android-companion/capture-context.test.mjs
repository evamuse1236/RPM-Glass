import test from 'node:test';
import assert from 'node:assert/strict';
import {describeLink,areaTone,blockChoices} from './capture-context.mjs';
const data={planner:{
 areas:[{id:'a1',title:'Learning'},{id:'a2',title:'Home',colorIndex:9}],
 goals:[{id:'g1',areaId:'a1'},{id:'g2',areaId:'a2'}],
 projects:[{id:'p1',title:'New term',goalId:'g1'},{id:'p2',title:'Calm week',goalId:'g2'}],
 blocks:[{id:'b1',title:'Explain the chapter',projectId:'p1'},{id:'b2',title:'Rest',purpose:'Have energy',projectId:null}],
}};
test('a Block choice names its Area and Project with the planner colour',()=>{
 assert.deepEqual(describeLink(data,'blockId','b1'),{title:'Explain the chapter',subtitle:'Learning · New term',tone:'area-0'});
 assert.equal(areaTone(data.planner.areas[1],data.planner.areas),'area-1');
});
test('an unlinked Block falls back to its Purpose and has no colour',()=>{
 assert.deepEqual(describeLink(data,'blockId','b2'),{title:'Rest',subtitle:'Have energy',tone:null});
});
test('Block choices skip finished Results and put the nearest deadline first',()=>{
 const blocks=[...data.planner.blocks,{id:'b3',title:'Done already',achieved:true},{id:'b4',title:'Archived',archived:true}];
 const due={b2:{at:new Date('2026-10-04T23:00'),label:'Due tomorrow'}};
 const choices=blockChoices({planner:{...data.planner,blocks}},id=>due[id]??null);
 assert.deepEqual(choices.map(c=>c.id),['b2','b1']);
 assert.equal(choices[0].due.label,'Due tomorrow');
 assert.equal(choices[1].due,null);
});
test('unknown fields and ids are not described',()=>{
 assert.equal(describeLink(data,'time','tomorrow'),null);
 assert.equal(describeLink(data,'blockId','missing'),null);
});
