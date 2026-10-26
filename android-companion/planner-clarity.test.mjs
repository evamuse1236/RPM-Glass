import test from 'node:test';
import assert from 'node:assert/strict';
import {applyClarityPreferences,clarityPreferences,setClarityPreference} from './planner-clarity.mjs';

const storage=entries=>{
  const values=new Map(entries);return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),values};
};

test('Clarity preferences default safely and reject unknown stored values',()=>{
  assert.deepEqual(clarityPreferences(storage()),{appearance:'system',dayLayout:'day',barTransparency:20});
  assert.deepEqual(clarityPreferences(storage([['rpm-clarity:appearance','sepia'],['rpm-clarity:today-layout','board'],['rpm-clarity:bar-transparency','lots']])),{appearance:'system',dayLayout:'day',barTransparency:20});
});

const fakeRoot=()=>{const props=new Map();return {dataset:{appearance:'dark'},style:{setProperty:(name,value)=>props.set(name,value)},props};};

test('appearance and bar transparency update root state and survive a reload',()=>{
  const store=storage(),root=fakeRoot();
  setClarityPreference('appearance','light',{storage:store,root});
  setClarityPreference('bar-transparency',35,{storage:store,root});
  assert.equal(root.dataset.appearance,'light');
  assert.equal(root.props.get('--bar-fill'),'65%');
  assert.equal(root.dataset.barGlass,'true');
  assert.equal(store.values.get('rpm-clarity:appearance'),'light');
  assert.equal(store.values.get('rpm-clarity:bar-transparency'),'35');
  setClarityPreference('appearance','system',{storage:store,root});
  assert.equal('appearance' in root.dataset,false);
  const reloaded=fakeRoot();applyClarityPreferences(clarityPreferences(store),reloaded);
  assert.equal(reloaded.props.get('--bar-fill'),'65%');
});

test('bar transparency snaps to 5% steps within 0 to 60, and 0 makes the bar solid',()=>{
  for(const [given,kept] of [[-10,0],[0,0],[23,25],[60,60],[95,60],['40',40]]){
    const store=storage(),root=fakeRoot();
    assert.equal(setClarityPreference('bar-transparency',given,{storage:store,root}).barTransparency,kept,String(given));
    assert.equal(root.props.get('--bar-fill'),`${100-kept}%`);
    assert.equal(root.dataset.barGlass,String(kept>0));
    assert.equal(root.dataset.barThin,String(kept>30));
  }
});

test('an unlinked calendar never warns that it could not be checked',async()=>{
 const {calendarRisk}=await import('./planner-calendar.mjs');
 for(const value of [{status:'unlinked'},{status:'unavailable',configured:false},{status:'permission_needed',configured:false},{status:'not_selected'}])assert.equal(calendarRisk(value,0,1000),null);
 assert.match(calendarRisk({status:'stale',configured:true},0,1000),/Calendar could not be fully checked/);
 assert.match(calendarRisk(null,0,1000),/Calendar could not be fully checked/);
});
