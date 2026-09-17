import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyClarityPreferences,clarityPreferences,setClarityPreference} from './planner-clarity.mjs';

const storage=entries=>{
  const values=new Map(entries);return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),values};
};

test('Clarity preferences default safely and reject unknown stored values',()=>{
  assert.deepEqual(clarityPreferences(storage()),{appearance:'system',dayLayout:'agenda',solidNavigation:false});
  assert.deepEqual(clarityPreferences(storage([['rpm-clarity:appearance','sepia'],['rpm-clarity:day-layout','board'],['rpm-clarity:solid-navigation','yes']])),{appearance:'system',dayLayout:'agenda',solidNavigation:false});
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

test('planner integrates Clarity without inline script or canonical sort writes',async()=>{
  const [source,css,html]=await Promise.all([
    readFile(new URL('./planner.mjs',import.meta.url),'utf8'),
    readFile(new URL('./planner-stitch.css',import.meta.url),'utf8'),
    readFile(new URL('./planner.html',import.meta.url),'utf8')
  ]);
  assert.equal(source.includes("commit({type:'aiDraft'"),false);
  assert.equal(source.includes('api.sortPreview.create'),true);
  assert.equal(source.includes('api.sortPreview.accept'),true);
  assert.equal(source.includes('api.sortPreview.dismiss'),true);
  assert.equal(source.includes("el('small','task-estimate'"),true);
  assert.equal(source.includes("check.setAttribute('role','checkbox')"),true);
  assert.equal(source.includes("mountClaritySettings(work)"),true);
  assert.equal(source.includes("clarity.dayLayout==='agenda'"),true);
  assert.equal(css.includes(':root[data-appearance=dark]'),true);
  assert.equal(css.includes('@media(prefers-color-scheme:dark)'),true);
  assert.equal(css.includes('@media(forced-colors:active)'),true);
  assert.equal(css.includes(':root[data-large-text=true] .week-strip{display:none}'),true);
  assert.equal(html.includes('<script type="module" src="/runtime.js"></script>'),true);
  assert.equal(html.includes('<script>'),false);
});
