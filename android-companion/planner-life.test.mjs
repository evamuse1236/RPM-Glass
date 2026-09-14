import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {editPlan,planner,validatePlanner} from './planner-state.mjs';

test('life ratings are optional, validated and undoable without changing linked goals',()=>{
  const d=freshStore();const area=editPlan(d,{type:'saveEntity',collection:'areas',fields:{title:'Learning'}});
  assert.equal(planner(d).areas[0].rating,undefined);
  const goal=editPlan(d,{type:'saveEntity',collection:'goals',fields:{title:'Understand the subject',year:2026,areaId:area}});
  editPlan(d,{type:'saveEntity',collection:'areas',id:area,fields:{title:'Learning',rating:7.4}});
  assert.equal(planner(d).areas[0].rating,7.4);assert.equal(planner(d).goals[0].id,goal);
  const before=JSON.stringify(d);assert.throws(()=>editPlan(d,{type:'saveEntity',collection:'areas',id:area,fields:{title:'Learning',rating:11}}));assert.equal(JSON.stringify(d),before);
  editPlan(d,{type:'undo'});assert.equal(planner(d).areas[0].rating,undefined);
});
test('legacy yearly goals and new month/quarter goals coexist; invalid periods are atomic',()=>{
  const d=freshStore();editPlan(d,{type:'saveEntity',collection:'goals',fields:{title:'Legacy goal',year:2026}});
  const monthly=editPlan(d,{type:'saveEntity',collection:'goals',fields:{title:'September goal',year:2026,horizon:'monthly',period:9}});
  const quarterly=editPlan(d,{type:'saveEntity',collection:'goals',fields:{title:'Quarter goal',year:2026,horizon:'quarterly',period:3}});
  validatePlanner(d);assert.equal(planner(d).goals[0].horizon,undefined);
  const before=JSON.stringify(d);assert.throws(()=>editPlan(d,{type:'saveEntity',collection:'goals',id:quarterly,fields:{title:'Invalid',year:2026,horizon:'quarterly',period:5}}));assert.equal(JSON.stringify(d),before);
  editPlan(d,{type:'saveEntity',collection:'goals',id:monthly,fields:{title:'Edited through old fields',year:2026}});
  assert.equal(planner(d).goals.find(g=>g.id===monthly).period,9);
  editPlan(d,{type:'saveEntity',collection:'goals',id:monthly,fields:{title:'Yearly now',year:2026,horizon:'yearly'}});
  assert.equal(planner(d).goals.find(g=>g.id===monthly).period,null);
});
test('core values survive old context updates and undo preserves original values',()=>{
  const d=freshStore();editPlan(d,{type:'context',vision:'Vision',goals:'Goals',coreValues:'Curiosity',approved:false});
  editPlan(d,{type:'context',vision:'New vision',goals:'Goals',approved:true});
  assert.equal(planner(d).context.coreValues,'Curiosity');
  editPlan(d,{type:'context',vision:'New vision',goals:'Goals',coreValues:'Care',approved:true});
  editPlan(d,{type:'undo'});assert.equal(planner(d).context.coreValues,'Curiosity');
});
