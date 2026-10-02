import test from 'node:test';
import assert from 'node:assert/strict';
import {describeLink,areaTone} from './capture-context.mjs';
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
test('unknown fields and ids are not described',()=>{
 assert.equal(describeLink(data,'time','tomorrow'),null);
 assert.equal(describeLink(data,'blockId','missing'),null);
});
