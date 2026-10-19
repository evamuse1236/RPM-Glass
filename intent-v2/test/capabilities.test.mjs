import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPTURE_OPERATIONS,CAPABILITY_RULES} from '../src/capabilities.mjs';
import {OPERATION_SCHEMA,ALLOWED_FIELDS,FIELD_NAMES} from '../src/schema.mjs';
import {intentSystemPrompt} from '../prompts/intent-system.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {operation,turn} from './helpers.mjs';

test('every schema operation and field has a model-facing description from the same registry',()=>{
 assert.deepEqual(OPERATION_SCHEMA.properties.entity.enum,Object.keys(CAPTURE_OPERATIONS));
 assert.deepEqual(new Set(OPERATION_SCHEMA.properties.kind.enum),new Set(Object.values(CAPTURE_OPERATIONS).flatMap(s=>Object.keys(s.actions))));
 assert.ok(intentSystemPrompt.includes(CAPABILITY_RULES));
 for(const [entity,spec] of Object.entries(CAPTURE_OPERATIONS)){
  assert.ok(spec.description.trim());assert.deepEqual(ALLOWED_FIELDS[entity],spec.fields);
  for(const [kind,description] of Object.entries(spec.actions)){assert.ok(description.trim());assert.ok(CAPABILITY_RULES.includes(`${kind}: ${description}`));}
  for(const field of spec.fields){assert.ok(FIELD_NAMES.includes(field));assert.ok(CAPABILITY_RULES.includes(field));}
 }
});
test('an operation outside the capability table cannot reach the planner',()=>{
 const output=turn('complete this Block',[operation([],{kind:'complete',entity:'block',targetId:'b1'})]);
 assert.throws(()=>interpretTurn(output,{messageId:'m',units:[{id:'s0',text:'complete this Block'}],visibleEntities:[{id:'b1',entity:'block'}]}),/Only a saved task can be completed/);
});
