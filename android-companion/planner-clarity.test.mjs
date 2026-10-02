import test from 'node:test';
import assert from 'node:assert/strict';
import {applyClarityPreferences,clarityPreferences,setClarityPreference} from './planner-clarity.mjs';

const storage=entries=>{
  const values=new Map(entries);return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),values};
};

test('Clarity preferences default safely and reject unknown stored values',()=>{
  assert.deepEqual(clarityPreferences(storage()),{appearance:'system',dayLayout:'agenda',solidNavigation:true});
  assert.deepEqual(clarityPreferences(storage([['rpm-clarity:appearance','sepia'],['rpm-clarity:day-layout','board'],['rpm-clarity:solid-navigation','yes']])),{appearance:'system',dayLayout:'agenda',solidNavigation:true});
});

test('appearance and navigation preferences update semantic root state',()=>{
  const store=storage(),root={dataset:{appearance:'dark'}};
  setClarityPreference('appearance','light',{storage:store,root});
  setClarityPreference('solid-navigation',true,{storage:store,root});
  assert.equal(root.dataset.appearance,'light');
  assert.equal(root.dataset.solidNavigation,'true');
  assert.equal(store.values.get('rpm-clarity:appearance'),'light');
  setClarityPreference('appearance','system',{storage:store,root});
  assert.equal('appearance' in root.dataset,false);
  applyClarityPreferences(clarityPreferences(store),root);
  assert.equal(root.dataset.solidNavigation,'true');
});
