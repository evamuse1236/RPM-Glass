import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');

test('every stylesheet the Capture and planner pages link is served by the native asset allowlist',()=>{
 const allow=new Set([...read('../app/src/main/java/com/rpm/prototype/CompanionSurface.java').match(/ASSETS=Set\.of\(([^)]*)\)/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]));
 for(const page of ['index.html','planner.html']){
  assert.ok(allow.has(page),page);
  for(const [,href] of read(page).matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g))assert.ok(allow.has(href),`${page} links ${href}, missing from CompanionSurface.ASSETS`);
 }
});
